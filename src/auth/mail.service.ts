import {
  Injectable,
  Logger,
} from "@nestjs/common";

import { ConfigService } from "@nestjs/config";

import * as nodemailer from "nodemailer";

@Injectable()
export class AuthMailService {
  private readonly logger =
    new Logger(AuthMailService.name);

  constructor(
    private readonly config: ConfigService
  ) {}

  private createTransporter() {
    const host =
      this.config.get<string>(
        "SMTP_HOST"
      );

    const user =
      this.config.get<string>(
        "SMTP_USER"
      );

    const password =
      this.config.get<string>(
        "SMTP_PASSWORD"
      );

    if (!host || !user || !password) {
      return null;
    }

    return nodemailer.createTransport({
      host,

      port:
        this.config.get<number>(
          "SMTP_PORT"
        ) ?? 587,

      secure:
        Number(
          this.config.get(
            "SMTP_PORT"
          )
        ) === 465,

      auth: {
        user,
        pass: password,
      },
    });
  }

  async sendPasswordReset(
    email: string,
    resetUrl: string
  ) {
    const transporter =
      this.createTransporter();

    if (!transporter) {
      this.logger.warn(
        `SMTP not configured. Password reset URL for ${email}: ${resetUrl}`
      );

      return;
    }

    await transporter.sendMail({
      from:
        this.config.get<string>(
          "SMTP_FROM"
        ) ??
        "Élan Parfums <no-reply@elan.local>",

      to: email,

      subject:
        "Reset your ÉLAN Parfums password",

      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;">
          <h1 style="font-family:Georgia,serif;font-weight:400;">
            Reset your password
          </h1>

          <p>
            We received a request to reset the password for your ÉLAN Parfums account.
          </p>

          <p>
            This link expires in one hour.
          </p>

          <p style="margin:32px 0;">
            <a
              href="${resetUrl}"
              style="
                background:#5a1425;
                color:#ffffff;
                padding:14px 22px;
                text-decoration:none;
                display:inline-block;
              "
            >
              Choose a new password
            </a>
          </p>

          <p style="font-size:12px;color:#777;">
            If you did not request this, you can ignore this email.
          </p>
        </div>
      `,
    });
  }
}