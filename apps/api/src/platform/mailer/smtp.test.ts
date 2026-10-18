import net from 'node:net';
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailer, MailDeliveryError, SmtpMailer } from './mailer.js';
import { testConfig } from '../../../test/support/app.js';
import { passwordResetMessage } from './templates.js';

/** Minimal SMTP sink that records the DATA payload and recipients (stands in for Mailpit). */
function startSink() {
  const received: { rcpt: string[]; data: string } = { rcpt: [], data: '' };
  const server = net.createServer((socket) => {
    let inData = false;
    let buffer = '';
    socket.write('220 sink ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (inData) {
        if (buffer.includes('\r\n.\r\n')) {
          received.data = buffer;
          buffer = '';
          inData = false;
          socket.write('250 queued\r\n');
        }
        return;
      }
      for (const line of buffer.split('\r\n')) {
        if (line === '') continue;
        const command = line.toUpperCase();
        if (command.startsWith('EHLO') || command.startsWith('HELO')) socket.write('250 sink\r\n');
        else if (command.startsWith('MAIL FROM')) socket.write('250 ok\r\n');
        else if (command.startsWith('RCPT TO')) {
          received.rcpt.push(line);
          socket.write('250 ok\r\n');
        } else if (command === 'DATA') {
          inData = true;
          socket.write('354 go\r\n');
        } else if (command === 'QUIT') socket.end('221 bye\r\n');
      }
      if (!inData) buffer = '';
    });
  });
  return new Promise<{ port: number; received: typeof received; close(): Promise<void> }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as net.AddressInfo;
        resolve({
          port,
          received,
          close: () => new Promise((done) => server.close(() => done())),
        });
      });
    },
  );
}

let sink: Awaited<ReturnType<typeof startSink>> | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await sink?.close();
  sink = undefined;
});

describe('SmtpMailer', () => {
  it('delivers a message to an SMTP server', async () => {
    sink = await startSink();
    const mailer = new SmtpMailer('Midas <no-reply@example.com>', {
      host: '127.0.0.1',
      port: sink.port,
      secure: false,
      user: undefined,
      password: undefined,
    });
    await mailer.send(
      passwordResetMessage({
        to: 'jane@example.com',
        displayName: 'Jane',
        appBaseUrl: 'http://localhost:5173',
        token: 'tok_en-123',
      }),
    );
    expect(sink.received.rcpt.join()).toContain('jane@example.com');
    expect(sink.received.data).toContain('Subject: Reset your Midas password');
    expect(sink.received.data).toContain('tok_en-123');
  });

  it('rejects when the server is unreachable', async () => {
    const mailer = new SmtpMailer('Midas <no-reply@example.com>', {
      host: '127.0.0.1',
      port: 1,
      secure: false,
      user: undefined,
      password: undefined,
    });
    await expect(
      mailer.send({
        to: 'a@example.com',
        subject: 's',
        text: 't',
        html: 'h',
        tag: 'password-reset',
      }),
    ).rejects.toThrow();
  });
});

describe('SmtpMailer transport options', () => {
  const smtp = {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    user: 'u',
    password: 'p',
  };
  it('requires STARTTLS and verifies certificates in strict (production) mode', () => {
    const spy = vi.spyOn(nodemailer, 'createTransport');
    new SmtpMailer('a@example.com', smtp, { strictTls: true });
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      secure: false,
      requireTLS: true,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    });
  });

  it('does not add requireTLS for implicit TLS, but still verifies certificates', () => {
    const spy = vi.spyOn(nodemailer, 'createTransport');
    new SmtpMailer('a@example.com', { ...smtp, port: 465, secure: true }, { strictTls: true });
    const options = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toMatchObject({ secure: true, requireTLS: false });
    expect(options.tls).toMatchObject({ rejectUnauthorized: true });
  });

  it('stays opportunistic outside production so local Mailpit works', () => {
    const spy = vi.spyOn(nodemailer, 'createTransport');
    new SmtpMailer('a@example.com', smtp);
    const options = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.requireTLS).toBeUndefined();
    expect(options.tls).toBeUndefined();
  });

  it('createMailer enables strict TLS only in production', () => {
    const production = {
      NODE_ENV: 'production',
      APP_BASE_URL: 'https://midas.example.com',
      MAIL_TRANSPORT: 'smtp',
      DATABASE_SSL: 'verify-full',
    };
    const spy = vi.spyOn(nodemailer, 'createTransport');
    createMailer(testConfig(production), { info: () => undefined });
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ requireTLS: true });
    createMailer(testConfig({ MAIL_TRANSPORT: 'smtp' }), { info: () => undefined });
    expect((spy.mock.calls[1]?.[0] as Record<string, unknown>).requireTLS).toBeUndefined();
  });

  it('does not leak the recipient through delivery errors', async () => {
    const mailer = new SmtpMailer('a@example.com', smtp);
    const failure = Object.assign(new Error('550 5.1.1 <victim@example.com> User unknown'), {
      code: 'EENVELOPE',
      responseCode: 550,
      command: 'RCPT TO',
    });
    (mailer as unknown as { transport: { sendMail: () => Promise<never> } }).transport = {
      sendMail: () => Promise.reject(failure),
    };
    const error = await mailer
      .send({ to: 'victim@example.com', subject: 's', text: 't', html: 'h', tag: 'password-reset' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(JSON.stringify(error)).not.toContain('victim');
    expect((error as Error).message).not.toContain('victim');
    expect((error as Error).stack).not.toContain('victim');
    expect(error).toMatchObject({ code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' });
  });
});
