import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import {
  ConfigService,
} from "@nestjs/config";

import nodemailer, {
  Transporter,
} from "nodemailer";

import type {
  EmailMessage,
  EmailRecipient,
} from "./email.types";

@Injectable()
export class EmailService
implements
  OnModuleInit,
  OnModuleDestroy {
  private readonly logger =
    new Logger(
      EmailService.name
    );

  private transporter:
    Transporter | null =
    null;

  private readonly fromEmail:
    string;

  private readonly fromName:
    string;

  private readonly adminEmail:
    string;

  private readonly replyTo:
    string |
    undefined;

  private readonly smtpUser:
    string;

  constructor(
    private readonly config:
      ConfigService
  ) {
    this.smtpUser =
      clean(
        this.config.get<string>(
          "SMTP_USER"
        )
      ) ??
      "";

    const parsedFrom =
      parseFrom(
        this.config.get<string>(
          "SMTP_FROM"
        )
      );

    /*
     * IMPORTANT FOR GMAIL:
     * Prefer an explicitly configured SMTP_FROM_EMAIL.
     * Otherwise use the authenticated Gmail account.
     *
     * Do not use a fake address such as no-reply@example.com.
     */
    this.fromEmail =
      clean(
        this.config.get<string>(
          "SMTP_FROM_EMAIL"
        )
      ) ??
      this.smtpUser ??
      parsedFrom.email ??
      "";

    this.fromName =
      clean(
        this.config.get<string>(
          "SMTP_FROM_NAME"
        )
      ) ??
      parsedFrom.name ??
      "ÉLAN Parfums";

    this.adminEmail =
      normalizeEmail(
        clean(
          this.config.get<string>(
            "ADMIN_NOTIFICATION_EMAIL"
          )
        ) ??
        ""
      );

    this.replyTo =
      clean(
        this.config.get<string>(
          "SMTP_REPLY_TO"
        )
      ) ??
      undefined;
  }

  async onModuleInit() {
    const host =
      clean(
        this.config.get<string>(
          "SMTP_HOST"
        )
      );

    const port =
      Number(
        clean(
          this.config.get<string>(
            "SMTP_PORT"
          )
        ) ??
          "587"
      );

    const user =
      this.smtpUser;

    const pass =
      clean(
        this.config.get<string>(
          "SMTP_PASS"
        )
      ) ??
      clean(
        this.config.get<string>(
          "SMTP_PASSWORD"
        )
      );

    const configuredSecure =
      clean(
        this.config.get<string>(
          "SMTP_SECURE"
        )
      );

    const secure =
      configuredSecure !==
      undefined
        ? configuredSecure.toLowerCase() ===
          "true"
        : port ===
          465;

    if (
      !host ||
      !user ||
      !pass ||
      !this.fromEmail
    ) {
      this.logger.warn(
        "SMTP is not fully configured. Email delivery is disabled."
      );

      this.logger.warn(
        `SMTP config status: host=${Boolean(
          host
        )}, user=${Boolean(
          user
        )}, password=${Boolean(
          pass
        )}, from=${Boolean(
          this.fromEmail
        )}`
      );

      return;
    }

    this.transporter =
      nodemailer.createTransport({
        host,
        port,
        secure,

        auth: {
          user,
          pass,
        },

        requireTLS:
          port ===
          587,

        pool:
          true,

        maxConnections:
          3,

        maxMessages:
          100,
      });

    try {
      await this.transporter.verify();

      this.logger.log(
        `SMTP connection verified for ${user}. Sender: ${this.fromName} <${this.fromEmail}>`
      );
    } catch (
      error
    ) {
      this.logger.error(
        "SMTP verification failed.",
        error
      );

      /*
       * If verification fails, do not leave a transporter that
       * looks usable to the rest of the application.
       */
      this.transporter.close();
      this.transporter =
        null;
    }
  }

  async onModuleDestroy() {
    this.transporter?.close();
  }

  isConfigured() {
    return Boolean(
      this.transporter &&
      this.fromEmail
    );
  }

  getAdminRecipient():
    EmailRecipient | null {
    if (
      !this.adminEmail
    ) {
      return null;
    }

    return {
      email:
        this.adminEmail,

      name:
        "ÉLAN Admin",
    };
  }

  async send(
    message:
      EmailMessage
  ) {
    if (
      !this.transporter
    ) {
      this.logger.warn(
        `Email skipped because SMTP is not configured: ${message.subject}`
      );

      return {
        sent:
          false,

        skipped:
          true,

        reason:
          "SMTP_NOT_CONFIGURED",
      };
    }

    const recipient =
      normalizeEmail(
        message.to.email
      );

    if (
      !recipient ||
      !isEmail(
        recipient
      )
    ) {
      this.logger.error(
        `Email not sent because recipient is invalid: "${message.to.email}"`
      );

      throw new Error(
        `Invalid email recipient: ${message.to.email}`
      );
    }

    this.logger.log(
      `Sending email to ${recipient}: ${message.subject}`
    );

    const info =
      await this.transporter.sendMail({
        from: {
          name:
            this.fromName,

          address:
            this.fromEmail,
        },

        /*
         * Set the SMTP envelope explicitly. This matters for
         * Gmail and gives us reliable accepted/rejected info.
         */
        envelope: {
          from:
            this.fromEmail,

          to: [
            recipient,
          ],
        },

        to: {
          name:
            message.to.name ??
            "",

          address:
            recipient,
        },

        replyTo:
          message.replyTo ??
          this.replyTo,

        subject:
          message.subject,

        text:
          message.text,

        html:
          message.html,
      });

    const accepted =
      (info.accepted ??
        []).map(
        (
          value
        ) =>
          String(
            value
          ).toLowerCase()
      );

    const rejected =
      (info.rejected ??
        []).map(
        (
          value
        ) =>
          String(
            value
          ).toLowerCase()
      );

    this.logger.log(
      `SMTP result for ${recipient}: accepted=[${accepted.join(
        ", "
      )}] rejected=[${rejected.join(
        ", "
      )}] response="${info.response ?? ""}"`
    );

    /*
     * Nodemailer returning from sendMail does not necessarily
     * mean our intended recipient was accepted. Fail the
     * Inngest step when Gmail rejects the customer so the
     * workflow can retry and the failure is visible.
     */
    const recipientAccepted =
      accepted.some(
        (
          value
        ) =>
          value ===
          recipient
      );

    if (
      rejected.includes(
        recipient
      ) ||
      !recipientAccepted
    ) {
      throw new Error(
        `SMTP did not accept recipient ${recipient}. Response: ${info.response ?? "No response"}`
      );
    }

    this.logger.log(
      `Email accepted by SMTP for ${recipient}: ${message.subject}`
    );

    return {
      sent:
        true,

      skipped:
        false,

      messageId:
        info.messageId,

      accepted,

      rejected,

      response:
        info.response,
    };
  }

  sendCustomer(
    input: {
      email:
        string;

      name?:
        string;

      subject:
        string;

      text:
        string;

      html:
        string;
    }
  ) {
    const customerEmail =
      normalizeEmail(
        input.email
      );

    this.logger.log(
      `Customer email target: ${customerEmail}`
    );

    return this.send({
      to: {
        email:
          customerEmail,

        name:
          input.name,
      },

      subject:
        input.subject,

      text:
        input.text,

      html:
        input.html,
    });
  }

  async sendAdmin(
    input: {
      subject:
        string;

      text:
        string;

      html:
        string;
    }
  ) {
    const recipient =
      this.getAdminRecipient();

    if (
      !recipient
    ) {
      this.logger.warn(
        `Admin email skipped because ADMIN_NOTIFICATION_EMAIL is missing: ${input.subject}`
      );

      return {
        sent:
          false,

        skipped:
          true,

        reason:
          "ADMIN_EMAIL_NOT_CONFIGURED",
      };
    }

    return this.send({
      to:
        recipient,

      subject:
        input.subject,

      text:
        input.text,

      html:
        input.html,
    });
  }
}

function clean(
  value:
    string |
    undefined
) {
  if (
    value ===
    undefined
  ) {
    return undefined;
  }

  const result =
    value.trim();

  return result ||
    undefined;
}

function normalizeEmail(
  value:
    string
) {
  return value
    .trim()
    .toLowerCase();
}

function isEmail(
  value:
    string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

function parseFrom(
  value:
    string |
    undefined
) {
  if (
    !value
  ) {
    return {
      name:
        undefined,

      email:
        undefined,
    };
  }

  const cleaned =
    value.trim();

  const match =
    cleaned.match(
      /^(.*?)\s*<([^>]+)>$/
    );

  if (
    match
  ) {
    return {
      name:
        match[1]
          ?.trim()
          .replace(
            /^["']|["']$/g,
            ""
          ) ||
        undefined,

      email:
        match[2]
          ?.trim()
          .toLowerCase() ||
        undefined,
    };
  }

  if (
    cleaned.includes(
      "@"
    )
  ) {
    return {
      name:
        undefined,

      email:
        cleaned.toLowerCase(),
    };
  }

  return {
    name:
      cleaned,

    email:
      undefined,
  };
}
