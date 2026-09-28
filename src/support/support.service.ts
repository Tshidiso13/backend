import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  randomBytes,
} from "crypto";

import {
  NotificationPriority,
  NotificationType,
  UserRole,
} from "../generated/prisma/client";

import {
  EmailService,
} from "../email/email.service";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  CreateSupportTicketDto,
} from "./dto/create-support-ticket.dto";

import {
  ReplySupportTicketDto,
} from "./dto/reply-support-ticket.dto";

import {
  UpdateSupportStatusDto,
} from "./dto/update-support-status.dto";

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly email:
      EmailService
  ) {}

  /* =======================================================
     CUSTOMER: LIST TICKETS
  ======================================================== */

  async findMine(
    userId:
      string
  ) {
    return this.prisma.supportTicket.findMany({
      where: {
        userId,
      },

      orderBy: {
        updatedAt:
          "desc",
      },

      include: {
        messages: {
          orderBy: {
            createdAt:
              "asc",
          },
        },
      },
    });
  }

  /* =======================================================
     CUSTOMER: GET ONE
  ======================================================== */

  async findMineOne(
    userId:
      string,

    ticketId:
      string
  ) {
    const ticket =
      await this.prisma.supportTicket.findFirst({
        where: {
          id:
            ticketId,

          userId,
        },

        include: {
          messages: {
            orderBy: {
              createdAt:
                "asc",
            },
          },
        },
      });

    if (
      !ticket
    ) {
      throw new NotFoundException(
        "Support request not found."
      );
    }

    return ticket;
  }

  /* =======================================================
     CUSTOMER: CREATE
  ======================================================== */

  async create(
    userId:
      string,

    input:
      CreateSupportTicketDto
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id:
            userId,
        },

        select: {
          id:
            true,

          name:
            true,

          email:
            true,
        },
      });

    if (
      !user
    ) {
      throw new NotFoundException(
        "Account not found."
      );
    }

    if (
      input.orderNumber
    ) {
      const order =
        await this.prisma.order.findFirst({
          where: {
            userId,

            orderNumber:
              input.orderNumber,
          },

          select: {
            id:
              true,
          },
        });

      if (
        !order
      ) {
        throw new BadRequestException(
          "That order number does not belong to your account."
        );
      }
    }

    const ticketNumber =
      generateTicketNumber();

    const ticket =
      await this.prisma.$transaction(
        async (
          tx
        ) => {
          const created =
            await tx.supportTicket.create({
              data: {
                ticketNumber,

                userId,

                name:
                  user.name,

                email:
                  user.email,

                category:
                  input.category,

                subject:
                  input.subject,

                orderNumber:
                  input.orderNumber ??
                  null,

                status:
                  "OPEN",

                priority:
                  priorityForCategory(
                    input.category
                  ),
              },
            });

          await tx.supportMessage.create({
            data: {
              ticketId:
                created.id,

              sender:
                "CUSTOMER",

              senderName:
                user.name,

              senderEmail:
                user.email,

              message:
                input.message,
            },
          });

          await tx.notification.create({
            data: {
              recipientUserId:
                userId,

              type:
                NotificationType.CUSTOMER,

              priority:
                NotificationPriority.NORMAL,

              title:
                "Support request received",

              message:
                `We received ${ticketNumber}. Our team will reply from your account.`,

              href:
                `/account/help?ticket=${created.id}`,

              metadata: {
                ticketId:
                  created.id,

                ticketNumber,
              },
            },
          });

          await tx.notification.create({
            data: {
              targetRole:
                UserRole.ADMIN,

              type:
                NotificationType.CUSTOMER,

              priority:
                priorityForCategory(
                  input.category
                ) ===
                "URGENT"
                  ? NotificationPriority.URGENT
                  : NotificationPriority.IMPORTANT,

              title:
                "New support request",

              message:
                `${ticketNumber} · ${input.subject}`,

              href:
                `/admin/support/${created.id}`,

              metadata: {
                ticketId:
                  created.id,

                ticketNumber,

                customerId:
                  userId,
              },
            },
          });

          return created;
        }
      );

    /*
     * Email is deliberately outside the DB transaction:
     * a temporary SMTP failure must never lose the ticket.
     */
    await Promise.allSettled([
      this.email.sendCustomer({
        email:
          user.email,

        name:
          user.name,

        subject:
          `We received your request · ${ticketNumber}`,

        text:
          buildCustomerCreatedText(
            user.name,
            ticketNumber,
            input.subject
          ),

        html:
          buildCustomerCreatedHtml(
            user.name,
            ticketNumber,
            input.subject
          ),
      }),

      this.email.sendAdmin({
        subject:
          `[ÉLAN Support] ${ticketNumber} · ${input.subject}`,

        text:
          buildAdminNewTicketText({
            ticketNumber,
            name:
              user.name,
            email:
              user.email,
            category:
              input.category,
            subject:
              input.subject,
            orderNumber:
              input.orderNumber,
            message:
              input.message,
          }),

        html:
          buildAdminNewTicketHtml({
            ticketNumber,
            name:
              user.name,
            email:
              user.email,
            category:
              input.category,
            subject:
              input.subject,
            orderNumber:
              input.orderNumber,
            message:
              input.message,
          }),
      }),
    ]);

    return this.findMineOne(
      userId,
      ticket.id
    );
  }

  /* =======================================================
     CUSTOMER: REPLY
  ======================================================== */

  async reply(
    userId:
      string,

    ticketId:
      string,

    input:
      ReplySupportTicketDto
  ) {
    const ticket =
      await this.findMineOne(
        userId,
        ticketId
      );

    if (
      ticket.status ===
        "CLOSED"
    ) {
      throw new BadRequestException(
        "This support request is closed."
      );
    }

    const message =
      await this.prisma.$transaction(
        async (
          tx
        ) => {
          const created =
            await tx.supportMessage.create({
              data: {
                ticketId:
                  ticket.id,

                sender:
                  "CUSTOMER",

                senderName:
                  ticket.name,

                senderEmail:
                  ticket.email,

                message:
                  input.message,
              },
            });

          await tx.supportTicket.update({
            where: {
              id:
                ticket.id,
            },

            data: {
              status:
                "OPEN",
            },
          });

          await tx.notification.create({
            data: {
              targetRole:
                UserRole.ADMIN,

              type:
                NotificationType.CUSTOMER,

              priority:
                NotificationPriority.IMPORTANT,

              title:
                "Customer replied",

              message:
                `${ticket.ticketNumber} has a new customer reply.`,

              href:
                `/admin/support/${ticket.id}`,

              metadata: {
                ticketId:
                  ticket.id,

                ticketNumber:
                  ticket.ticketNumber,
              },
            },
          });

          return created;
        }
      );

    await this.email.sendAdmin({
      subject:
        `[ÉLAN Support] Customer replied · ${ticket.ticketNumber}`,

      text:
        `${ticket.name} replied to ${ticket.ticketNumber}:\n\n${input.message}`,

      html:
        simpleEmailHtml(
          "Customer replied",
          `${ticket.name} replied to ${ticket.ticketNumber}.`,
          input.message
        ),
    });

    return message;
  }

  /* =======================================================
     ADMIN: LIST
  ======================================================== */

  async adminFindAll(
    status?:
      string
  ) {
    return this.prisma.supportTicket.findMany({
      where: {
        ...(status
          ? {
              status:
                status as
                  any,
            }
          : {}),
      },

      orderBy: {
        updatedAt:
          "desc",
      },

      include: {
        _count: {
          select: {
            messages:
              true,
          },
        },
      },
    });
  }

  /* =======================================================
     ADMIN: GET ONE
  ======================================================== */

  async adminFindOne(
    ticketId:
      string
  ) {
    const ticket =
      await this.prisma.supportTicket.findUnique({
        where: {
          id:
            ticketId,
        },

        include: {
          messages: {
            orderBy: {
              createdAt:
                "asc",
            },
          },

          user: {
            select: {
              id:
                true,

              name:
                true,

              email:
                true,
            },
          },
        },
      });

    if (
      !ticket
    ) {
      throw new NotFoundException(
        "Support request not found."
      );
    }

    return ticket;
  }

  /* =======================================================
     ADMIN: STATUS
  ======================================================== */

  async adminUpdateStatus(
    ticketId:
      string,

    input:
      UpdateSupportStatusDto
  ) {
    await this.adminFindOne(
      ticketId
    );

    return this.prisma.supportTicket.update({
      where: {
        id:
          ticketId,
      },

      data: {
        status:
          input.status,

        resolvedAt:
          input.status ===
            "RESOLVED"
            ? new Date()
            : null,
      },
    });
  }

  /* =======================================================
     ADMIN: REPLY
  ======================================================== */

  async adminReply(
    ticketId:
      string,

    admin: {
      id:
        string;

      name?:
        string;

      email?:
        string;
    },

    input:
      ReplySupportTicketDto
  ) {
    const ticket =
      await this.adminFindOne(
        ticketId
      );

    if (
      ticket.status ===
        "CLOSED"
    ) {
      throw new BadRequestException(
        "This support request is closed."
      );
    }

    const senderName =
      admin.name ??
      "ÉLAN Support";

    const message =
      await this.prisma.$transaction(
        async (
          tx
        ) => {
          const created =
            await tx.supportMessage.create({
              data: {
                ticketId:
                  ticket.id,

                sender:
                  "ADMIN",

                senderName,

                senderEmail:
                  admin.email ??
                  null,

                message:
                  input.message,
              },
            });

          await tx.supportTicket.update({
            where: {
              id:
                ticket.id,
            },

            data: {
              status:
                "WAITING_FOR_CUSTOMER",
            },
          });

          await tx.notification.create({
            data: {
              recipientUserId:
                ticket.userId,

              type:
                NotificationType.CUSTOMER,

              priority:
                NotificationPriority.IMPORTANT,

              title:
                "ÉLAN Support replied",

              message:
                `There is a new reply on ${ticket.ticketNumber}.`,

              href:
                `/account/help?ticket=${ticket.id}`,

              metadata: {
                ticketId:
                  ticket.id,

                ticketNumber:
                  ticket.ticketNumber,
              },
            },
          });

          return created;
        }
      );

    await this.email.sendCustomer({
      email:
        ticket.email,

      name:
        ticket.name,

      subject:
        `ÉLAN Support replied · ${ticket.ticketNumber}`,

      text:
        `Hi ${ticket.name},\n\nWe replied to ${ticket.ticketNumber}:\n\n${input.message}\n\nSign in to your ÉLAN account to continue the conversation.`,

      html:
        simpleEmailHtml(
          "ÉLAN Support replied",
          `There is a new reply on ${ticket.ticketNumber}.`,
          input.message
        ),
    });

    return message;
  }
}

/* =========================================================
   HELPERS
========================================================= */

function generateTicketNumber() {
  const now =
    new Date();

  const stamp =
    [
      now.getFullYear(),
      String(
        now.getMonth() +
        1
      ).padStart(
        2,
        "0"
      ),
      String(
        now.getDate()
      ).padStart(
        2,
        "0"
      ),
    ].join("");

  const suffix =
    randomBytes(
      3
    )
      .toString(
        "hex"
      )
      .toUpperCase();

  return `SUP-${stamp}-${suffix}`;
}

function priorityForCategory(
  category:
    string
):
  "NORMAL" |
  "IMPORTANT" |
  "URGENT" {
  if (
    category ===
      "PAYMENT"
  ) {
    return "URGENT";
  }

  if (
    category ===
      "DELIVERY" ||
    category ===
      "RETURNS"
  ) {
    return "IMPORTANT";
  }

  return "NORMAL";
}

function buildCustomerCreatedText(
  name:
    string,

  ticketNumber:
    string,

  subject:
    string
) {
  return [
    `Hi ${name},`,
    "",
    "We’ve received your message.",
    `Reference: ${ticketNumber}`,
    `Subject: ${subject}`,
    "",
    "A member of the ÉLAN team will review it and reply through your account.",
  ].join(
    "\n"
  );
}

function buildCustomerCreatedHtml(
  name:
    string,

  ticketNumber:
    string,

  subject:
    string
) {
  return simpleEmailHtml(
    "We’ve received your message.",
    `Hi ${name}, your support reference is ${ticketNumber}.`,
    `Subject: ${subject}\n\nA member of the ÉLAN team will review your request and reply through your account.`
  );
}

function buildAdminNewTicketText(
  input: {
    ticketNumber:
      string;

    name:
      string;

    email:
      string;

    category:
      string;

    subject:
      string;

    orderNumber?:
      string;

    message:
      string;
  }
) {
  return [
    "New ÉLAN support request",
    "",
    `Reference: ${input.ticketNumber}`,
    `Customer: ${input.name}`,
    `Email: ${input.email}`,
    `Category: ${input.category}`,
    `Subject: ${input.subject}`,
    ...(input.orderNumber
      ? [
          `Order: ${input.orderNumber}`,
        ]
      : []),
    "",
    input.message,
  ].join(
    "\n"
  );
}

function buildAdminNewTicketHtml(
  input: {
    ticketNumber:
      string;

    name:
      string;

    email:
      string;

    category:
      string;

    subject:
      string;

    orderNumber?:
      string;

    message:
      string;
  }
) {
  return simpleEmailHtml(
    "New support request",
    `${input.ticketNumber} · ${input.name} · ${input.category}`,
    `${input.subject}${input.orderNumber ? `\nOrder: ${input.orderNumber}` : ""}\n\n${input.message}`
  );
}

function simpleEmailHtml(
  title:
    string,

  intro:
    string,

  body:
    string
) {
  return `
    <!doctype html>
    <html>
      <body style="margin:0;background:#efeae5;font-family:Arial,Helvetica,sans-serif;">
        <table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="padding:28px 12px;background:#efeae5;">
          <tr>
            <td align="center">
              <table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fbfaf7;">
                <tr>
                  <td style="padding:34px 38px;border-bottom:1px solid #e3dad4;">
                    <div style="font-family:Georgia,'Times New Roman',serif;font-size:25px;letter-spacing:.12em;color:#342725;">
                      ÉLAN PARFUMS
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:38px;">
                    <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#9a756c;">
                      Customer care
                    </div>
                    <h1 style="margin:12px 0 22px;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1.05;font-weight:400;color:#342725;">
                      ${escapeHtml(
                        title
                      )}
                    </h1>
                    <p style="margin:0 0 24px;color:#74645e;font-size:14px;line-height:1.7;">
                      ${escapeHtml(
                        intro
                      )}
                    </p>
                    <div style="white-space:pre-line;color:#74645e;font-size:14px;line-height:1.7;">
                      ${escapeHtml(
                        body
                      )}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function escapeHtml(
  value:
    string
) {
  return value
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}
