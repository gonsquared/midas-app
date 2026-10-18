import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../config.js';

/** Message categories, used for metrics and log filtering. */
export type MailTag = 'password-reset';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  tag: MailTag;
}

/** Outbound email port (ADR-010). Implementations must never log message bodies in production. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Captures messages in memory. Used by tests. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  /** Test seam: make the next `send` reject. */
  failNext: Error | undefined;

  async send(message: MailMessage): Promise<void> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = undefined;
      throw error;
    }
    this.sent.push(message);
  }
}

export interface MailLogger {
  info(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Local sink without any server: logs subject and recipient only, because the body carries the
 * reset token. The full message is written only when `printBodies` is set (development).
 */
export class ConsoleMailer implements Mailer {
  constructor(
    private readonly logger: MailLogger,
    private readonly printBodies: boolean,
  ) {}

  async send(message: MailMessage): Promise<void> {
    this.logger.info(
      {
        mail: { to: message.to, subject: message.subject, tag: message.tag },
        ...(this.printBodies && { body: message.text }),
      },
      'mail sent to console sink',
    );
  }
}

/** Delivery failure without recipient data: only the error code, SMTP status and command. */
export class MailDeliveryError extends Error {
  readonly code: string | undefined;
  readonly responseCode: number | undefined;
  readonly command: string | undefined;

  constructor(cause: unknown) {
    const e = (typeof cause === 'object' && cause !== null ? cause : {}) as Record<string, unknown>;
    const code = typeof e.code === 'string' ? e.code : undefined;
    const responseCode = typeof e.responseCode === 'number' ? e.responseCode : undefined;
    const command = typeof e.command === 'string' ? e.command : undefined;
    super(
      `SMTP delivery failed (code=${code ?? 'unknown'}, responseCode=${responseCode ?? 'n/a'}, command=${command ?? 'n/a'})`,
    );
    this.name = 'MailDeliveryError';
    this.code = code;
    this.responseCode = responseCode;
    this.command = command;
  }
}

/** SMTP adapter (nodemailer): Mailpit locally, any SMTP provider in production. */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  /**
   * `strictTls` (production): when the connection is not implicit TLS, STARTTLS is mandatory
   * (no silent downgrade to plaintext) and the server certificate is always verified.
   */
  constructor(
    private readonly from: string,
    smtp: Config['mail']['smtp'],
    options: { strictTls: boolean } = { strictTls: false },
  ) {
    this.transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(options.strictTls && {
        requireTLS: !smtp.secure,
        tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' as const },
      }),
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      ...(smtp.user && smtp.password && { auth: { user: smtp.user, pass: smtp.password } }),
    });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      // SMTP errors echo the server response, which usually contains the recipient address
      // (for example "550 <user@host> unknown"). Keep only non-identifying fields.
      throw new MailDeliveryError(error);
    }
  }
}

export function createMailer(config: Config, logger: MailLogger): Mailer {
  switch (config.mail.transport) {
    case 'memory':
      return new MemoryMailer();
    case 'console':
      return new ConsoleMailer(logger, config.env === 'development');
    case 'smtp':
      return new SmtpMailer(config.mail.from, config.mail.smtp, {
        strictTls: config.env === 'production',
      });
  }
}
