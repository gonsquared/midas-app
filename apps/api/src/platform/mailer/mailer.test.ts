import { describe, expect, it } from 'vitest';
import { ConsoleMailer, MemoryMailer, type MailMessage } from './mailer.js';
import { passwordResetMessage } from './templates.js';

const message: MailMessage = {
  to: 'a@example.com',
  subject: 'Reset',
  text: 'secret-token-body',
  html: '<p>secret-token-body</p>',
  tag: 'password-reset',
};

describe('MemoryMailer', () => {
  it('captures messages and can be told to fail once', async () => {
    const mailer = new MemoryMailer();
    await mailer.send(message);
    expect(mailer.sent).toEqual([message]);
    mailer.failNext = new Error('smtp down');
    await expect(mailer.send(message)).rejects.toThrow('smtp down');
    await mailer.send(message);
    expect(mailer.sent).toHaveLength(2);
  });
});

describe('ConsoleMailer', () => {
  it('logs recipient and subject but never the body outside development', async () => {
    const lines: Array<Record<string, unknown>> = [];
    await new ConsoleMailer({ info: (obj) => lines.push(obj) }, false).send(message);
    expect(JSON.stringify(lines)).toContain('a@example.com');
    expect(JSON.stringify(lines)).not.toContain('secret-token-body');
  });

  it('prints the body in development', async () => {
    const lines: Array<Record<string, unknown>> = [];
    await new ConsoleMailer({ info: (obj) => lines.push(obj) }, true).send(message);
    expect(JSON.stringify(lines)).toContain('secret-token-body');
  });
});

describe('passwordResetMessage', () => {
  it('puts the token in the URL fragment and escapes the display name in HTML', () => {
    const mail = passwordResetMessage({
      to: 'a@example.com',
      displayName: '<script>alert(1)</script>',
      appBaseUrl: 'https://midas.example.com/',
      token: 'abc_DEF-123',
    });
    expect(mail.text).toContain('https://midas.example.com/reset-password#token=abc_DEF-123');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.tag).toBe('password-reset');
  });
});
