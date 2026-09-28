import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  NotificationPriority,
  NotificationType,
  Prisma,
  UserRole,
} from "../generated/prisma/client";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  GuestNotificationQueryDto,
} from "./dto/guest-notification-query.dto";

import {
  NotificationQueryDto,
} from "./dto/notification-query.dto";

type NotificationViewer = {
  id: string;
  role?: UserRole;
};

type ResolvedNotificationViewer = {
  id: string;
  role: UserRole;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  /* =======================================================
     ACCOUNT / ADMIN NOTIFICATIONS
  ======================================================== */

  async findMine(
    viewer:
      NotificationViewer,

    query:
      NotificationQueryDto
  ) {
    const resolvedViewer =
      await this.resolveViewer(
        viewer
      );

    const page =
      Math.max(
        1,
        query.page ??
          1
      );

    const limit =
      Math.min(
        50,
        Math.max(
          1,
          query.limit ??
            20
        )
      );

    const where:
      Prisma.NotificationWhereInput =
      {
        AND: [
          this.visibleTo(
            resolvedViewer
          ),

          ...(query.type
            ? [
                {
                  type:
                    query.type as
                      NotificationType,
                },
              ]
            : []),

          ...(query.priority
            ? [
                {
                  priority:
                    query.priority as
                      NotificationPriority,
                },
              ]
            : []),

          ...(query.unreadOnly
            ? [
                {
                  readAt:
                    null,
                },
              ]
            : []),
        ],
      };

    const [
      notifications,
      total,
      unreadCount,
    ] =
      await Promise.all([
        this.prisma.notification.findMany(
          {
            where,

            orderBy: {
              createdAt:
                "desc",
            },

            skip:
              (
                page -
                1
              ) *
              limit,

            take:
              limit,

            select:
              notificationSelect,
          }
        ),

        this.prisma.notification.count({
          where,
        }),

        this.countUnread(
          resolvedViewer
        ),
      ]);

    return {
      data:
        notifications,

      unreadCount,

      pagination: {
        page,
        limit,
        total,

        pages:
          Math.max(
            1,
            Math.ceil(
              total /
                limit
            )
          ),
      },
    };
  }

  async unreadCount(
    viewer:
      NotificationViewer
  ) {
    const resolvedViewer =
      await this.resolveViewer(
        viewer
      );

    return {
      count:
        await this.countUnread(
          resolvedViewer
        ),
    };
  }

  private countUnread(
    viewer:
      ResolvedNotificationViewer
  ) {
    return this.prisma.notification.count({
      where: {
        AND: [
          this.visibleTo(
            viewer
          ),

          {
            readAt:
              null,
          },
        ],
      },
    });
  }

  async markRead(
    viewer:
      NotificationViewer,

    notificationId:
      string
  ) {
    const notification =
      await this.findVisibleOne(
        viewer,
        notificationId
      );

    if (
      notification.readAt
    ) {
      return notification;
    }

    return this.prisma.notification.update({
      where: {
        id:
          notification.id,
      },

      data: {
        readAt:
          new Date(),
      },

      select:
        notificationSelect,
    });
  }

  async markUnread(
    viewer:
      NotificationViewer,

    notificationId:
      string
  ) {
    const notification =
      await this.findVisibleOne(
        viewer,
        notificationId
      );

    return this.prisma.notification.update({
      where: {
        id:
          notification.id,
      },

      data: {
        readAt:
          null,
      },

      select:
        notificationSelect,
    });
  }

  async markAllRead(
    viewer:
      NotificationViewer
  ) {
    const resolvedViewer =
      await this.resolveViewer(
        viewer
      );

    const result =
      await this.prisma.notification.updateMany({
        where: {
          AND: [
            this.visibleTo(
              resolvedViewer
            ),

            {
              readAt:
                null,
            },
          ],
        },

        data: {
          readAt:
            new Date(),
        },
      });

    return {
      updated:
        result.count,
    };
  }

  async remove(
    viewer:
      NotificationViewer,

    notificationId:
      string
  ) {
    const resolvedViewer =
      await this.resolveViewer(
        viewer
      );

    const notification =
      await this.findVisibleOne(
        resolvedViewer,
        notificationId
      );

    if (
      notification.recipientUserId !==
      resolvedViewer.id
    ) {
      throw new ForbiddenException(
        "Shared role notifications cannot be deleted."
      );
    }

    await this.prisma.notification.delete({
      where: {
        id:
          notification.id,
      },
    });

    return {
      deleted:
        true,
    };
  }

  /* =======================================================
     ADMIN NAVIGATION BADGES

     newOrders is derived from UNREAD admin notifications
     created specifically when a new checkout/order is placed.

     This keeps the Orders badge aligned with the same backend
     events that power the Notifications inbox instead of
     inventing a separate frontend-only counter.
  ======================================================== */

  async getAdminBadges(
    viewer:
      NotificationViewer
  ) {
    const resolvedViewer =
      await this.resolveViewer(
        viewer
      );

    if (
      resolvedViewer.role !==
      UserRole.ADMIN
    ) {
      throw new ForbiddenException(
        "Admin access required."
      );
    }

    const visible =
      this.visibleTo(
        resolvedViewer
      );

    const [
      unreadNotifications,
      newOrders,
    ] =
      await Promise.all([
        this.prisma.notification.count({
          where: {
            AND: [
              visible,

              {
                readAt:
                  null,
              },
            ],
          },
        }),

        this.prisma.notification.count({
          where: {
            AND: [
              visible,

              {
                readAt:
                  null,
              },

              {
                type:
                  NotificationType.ORDER,
              },

              {
                title: {
                  in: [
                    "New PayFast order",
                    "New cash-on-delivery order",
                  ],
                },
              },
            ],
          },
        }),
      ]);

    return {
      newOrders,
      unreadNotifications,
    };
  }

  /*
   * When the admin opens the Orders page, treat new-order
   * alerts as seen. This clears only the Orders badge and
   * those matching notification rows; unrelated unread
   * payment/delivery/system notifications remain unread.
   */
  async markAdminOrderAlertsRead(
    viewer:
      NotificationViewer
  ) {
    const resolvedViewer =
      await this.resolveViewer(
        viewer
      );

    if (
      resolvedViewer.role !==
      UserRole.ADMIN
    ) {
      throw new ForbiddenException(
        "Admin access required."
      );
    }

    const result =
      await this.prisma.notification.updateMany({
        where: {
          AND: [
            this.visibleTo(
              resolvedViewer
            ),

            {
              readAt:
                null,
            },

            {
              type:
                NotificationType.ORDER,
            },

            {
              title: {
                in: [
                  "New PayFast order",
                  "New cash-on-delivery order",
                ],
              },
            },
          ],
        },

        data: {
          readAt:
            new Date(),
        },
      });

    return {
      updated:
        result.count,
    };
  }

  /* =======================================================
     GUEST NOTIFICATIONS

     Guests do not have a User row, so there is no secure
     recipientUserId that can own a Notification record.

     Instead, the backend rebuilds a private notification
     timeline from the guest's real order history after
     verifying BOTH:
       - order id / order number
       - checkout email

     Read/unread state is stored in the guest's browser.
  ======================================================== */

  async findGuestNotifications(
    input:
      GuestNotificationQueryDto
  ) {
    const references =
      dedupeGuestRefs(
        input.orders
      );

    if (
      references.length ===
      0
    ) {
      return {
        data: [],
      };
    }

    const orders =
      (
        await Promise.all(
          references.map(
            async (
              reference
            ) => {
              const orderId =
                reference.orderId.trim();

              const email =
                normalizeEmail(
                  reference.email
                );

              return this.prisma.order.findFirst({
                where: {
                  userId:
                    null,

                  email,

                  OR: [
                    {
                      id:
                        orderId,
                    },

                    {
                      orderNumber:
                        orderId,
                    },
                  ],
                },

                select: {
                  id:
                    true,

                  orderNumber:
                    true,

                  orderStatus:
                    true,

                  paymentStatus:
                    true,

                  paymentMethod:
                    true,

                  createdAt:
                    true,

                  updatedAt:
                    true,

                  paidAt:
                    true,

                  shippedAt:
                    true,

                  deliveredAt:
                    true,
                },
              });
            }
          )
        )
      ).filter(
        (
          order
        ): order is NonNullable<
          typeof order
        > =>
          Boolean(
            order
          )
      );

    const notifications =
      orders
        .flatMap(
          (
            order
          ) =>
            buildGuestOrderNotifications(
              order
            )
        )
        .sort(
          (
            a,
            b
          ) =>
            b.createdAt.getTime() -
            a.createdAt.getTime()
        );

    return {
      data:
        notifications,
    };
  }

  /* =======================================================
     CREATION HELPERS
  ======================================================== */

  createForUser(
    input: {
      userId:
        string;

      type:
        NotificationType;

      priority?:
        NotificationPriority;

      title:
        string;

      message:
        string;

      href?:
        string |
        null;

      metadata?:
        Prisma.InputJsonValue;
    }
  ) {
    return this.prisma.notification.create({
      data: {
        recipientUserId:
          input.userId,

        type:
          input.type,

        priority:
          input.priority ??
          NotificationPriority.NORMAL,

        title:
          input.title,

        message:
          input.message,

        href:
          input.href ??
          null,

        metadata:
          input.metadata,
      },

      select:
        notificationSelect,
    });
  }

  createForRole(
    input: {
      role:
        UserRole;

      type:
        NotificationType;

      priority?:
        NotificationPriority;

      title:
        string;

      message:
        string;

      href?:
        string |
        null;

      metadata?:
        Prisma.InputJsonValue;
    }
  ) {
    return this.prisma.notification.create({
      data: {
        targetRole:
          input.role,

        type:
          input.type,

        priority:
          input.priority ??
          NotificationPriority.NORMAL,

        title:
          input.title,

        message:
          input.message,

        href:
          input.href ??
          null,

        metadata:
          input.metadata,
      },

      select:
        notificationSelect,
    });
  }

  /* =======================================================
     ACCESS
  ======================================================== */

  private async resolveViewer(
    viewer:
      NotificationViewer
  ):
    Promise<ResolvedNotificationViewer> {
    if (
      viewer.role
    ) {
      return {
        id:
          viewer.id,

        role:
          viewer.role,
      };
    }

    const user =
      await this.prisma.user.findUnique({
        where: {
          id:
            viewer.id,
        },

        select: {
          id:
            true,

          role:
            true,
        },
      });

    if (
      !user
    ) {
      throw new NotFoundException(
        "User not found."
      );
    }

    return {
      id:
        user.id,

      role:
        user.role,
    };
  }

  private visibleTo(
    viewer:
      ResolvedNotificationViewer
  ):
    Prisma.NotificationWhereInput {
    return {
      OR: [
        {
          recipientUserId:
            viewer.id,
        },

        {
          recipientUserId:
            null,

          targetRole:
            viewer.role,
        },
      ],
    };
  }

  private async findVisibleOne(
    viewer:
      NotificationViewer,

    notificationId:
      string
  ) {
    const resolvedViewer =
      await this.resolveViewer(
        viewer
      );

    const notification =
      await this.prisma.notification.findFirst({
        where: {
          id:
            notificationId,

          AND: [
            this.visibleTo(
              resolvedViewer
            ),
          ],
        },

        select:
          notificationSelect,
      });

    if (
      !notification
    ) {
      throw new NotFoundException(
        "Notification not found."
      );
    }

    return notification;
  }
}

const notificationSelect = {
  id:
    true,

  recipientUserId:
    true,

  targetRole:
    true,

  type:
    true,

  priority:
    true,

  title:
    true,

  message:
    true,

  href:
    true,

  metadata:
    true,

  readAt:
    true,

  createdAt:
    true,
} satisfies Prisma.NotificationSelect;

/* =========================================================
   GUEST TIMELINE BUILDER
========================================================= */

type GuestOrderForNotifications = {
  id:
    string;

  orderNumber:
    string;

  orderStatus:
    string;

  paymentStatus:
    string;

  paymentMethod:
    string;

  createdAt:
    Date;

  updatedAt:
    Date;

  paidAt:
    Date |
    null;

  shippedAt:
    Date |
    null;

  deliveredAt:
    Date |
    null;
};

type GuestNotification = {
  id:
    string;

  recipientUserId:
    null;

  targetRole:
    null;

  type:
    "ORDER" |
    "PAYMENT" |
    "DELIVERY" |
    "DISPUTE";

  priority:
    "NORMAL" |
    "IMPORTANT" |
    "URGENT";

  title:
    string;

  message:
    string;

  href:
    string;

  metadata: {
    guest:
      true;

    orderId:
      string;

    orderNumber:
      string;

    orderStatus:
      string;

    paymentStatus:
      string;
  };

  readAt:
    null;

  createdAt:
    Date;
};

function buildGuestOrderNotifications(
  order:
    GuestOrderForNotifications
):
  GuestNotification[] {
  const href =
    `/account/orders/${order.id}`;

  const metadata = {
    guest:
      true as const,

    orderId:
      order.id,

    orderNumber:
      order.orderNumber,

    orderStatus:
      order.orderStatus,

    paymentStatus:
      order.paymentStatus,
  };

  const result:
    GuestNotification[] = [
      {
        id:
          guestNotificationId(
            order.id,
            "created"
          ),

        recipientUserId:
          null,

        targetRole:
          null,

        type:
          "ORDER",

        priority:
          "IMPORTANT",

        title:
          "Order received",

        message:
          order.paymentMethod ===
          "PAYFAST"
            ? `Order ${order.orderNumber} was created.`
            : `Order ${order.orderNumber} was received.`,

        href,

        metadata,

        readAt:
          null,

        createdAt:
          order.createdAt,
      },
    ];

  if (
    order.paidAt
  ) {
    result.push({
      id:
        guestNotificationId(
          order.id,
          "paid"
        ),

      recipientUserId:
        null,

      targetRole:
        null,

      type:
        "PAYMENT",

      priority:
        "IMPORTANT",

      title:
        "Payment confirmed",

      message:
        `Payment for ${order.orderNumber} has been confirmed.`,

      href,

      metadata,

      readAt:
        null,

      createdAt:
        order.paidAt,
    });
  }

  if (
    order.shippedAt
  ) {
    result.push({
      id:
        guestNotificationId(
          order.id,
          "shipped"
        ),

      recipientUserId:
        null,

      targetRole:
        null,

      type:
        "DELIVERY",

      priority:
        "IMPORTANT",

      title:
        "Your order is on its way",

      message:
        `Order ${order.orderNumber} has been shipped.`,

      href,

      metadata,

      readAt:
        null,

      createdAt:
        order.shippedAt,
    });
  }

  if (
    order.deliveredAt
  ) {
    result.push({
      id:
        guestNotificationId(
          order.id,
          "delivered"
        ),

      recipientUserId:
        null,

      targetRole:
        null,

      type:
        "DELIVERY",

      priority:
        "IMPORTANT",

      title:
        "Order delivered",

      message:
        `Order ${order.orderNumber} has been delivered.`,

      href,

      metadata,

      readAt:
        null,

      createdAt:
        order.deliveredAt,
    });
  }

  /*
   * Statuses that do not have their own timestamp still need
   * one current-state notification. Use updatedAt.
   */
  const statusNotification =
    currentStatusNotification(
      order,
      href,
      metadata
    );

  if (
    statusNotification
  ) {
    result.push(
      statusNotification
    );
  }

  return dedupeGuestNotifications(
    result
  );
}

function currentStatusNotification(
  order:
    GuestOrderForNotifications,

  href:
    string,

  metadata:
    GuestNotification["metadata"]
):
  GuestNotification |
  null {
  const base = {
    id:
      guestNotificationId(
        order.id,
        order.orderStatus.toLowerCase()
      ),

    recipientUserId:
      null,

    targetRole:
      null,

    href,

    metadata,

    readAt:
      null,

    createdAt:
      order.updatedAt,
  } as const;

  switch (
    order.orderStatus
  ) {
    case "PROCESSING":
      return {
        ...base,
        type:
          "ORDER",
        priority:
          "NORMAL",
        title:
          "Order confirmed",
        message:
          `Order ${order.orderNumber} is being prepared.`,
      };

    case "PACKING":
      return {
        ...base,
        type:
          "ORDER",
        priority:
          "NORMAL",
        title:
          "Your order is being packed",
        message:
          `Your fragrances for ${order.orderNumber} are being packed.`,
      };

    case "READY_FOR_SHIPMENT":
      return {
        ...base,
        type:
          "DELIVERY",
        priority:
          "IMPORTANT",
        title:
          "Ready for shipment",
        message:
          `Order ${order.orderNumber} is ready to leave ÉLAN.`,
      };

    case "CANCELLED":
      return {
        ...base,
        type:
          "ORDER",
        priority:
          "URGENT",
        title:
          "Order cancelled",
        message:
          `Order ${order.orderNumber} has been cancelled.`,
      };

    case "RETURN_REQUESTED":
      return {
        ...base,
        type:
          "DISPUTE",
        priority:
          "IMPORTANT",
        title:
          "Return request received",
        message:
          `Your return request for ${order.orderNumber} has been received.`,
      };

    case "RETURNED":
      return {
        ...base,
        type:
          "DISPUTE",
        priority:
          "IMPORTANT",
        title:
          "Order returned",
        message:
          `Order ${order.orderNumber} has been returned.`,
      };

    case "REFUNDED":
      return {
        ...base,
        type:
          "PAYMENT",
        priority:
          "IMPORTANT",
        title:
          "Order refunded",
        message:
          `Order ${order.orderNumber} has been refunded.`,
      };

    default:
      return null;
  }
}

function guestNotificationId(
  orderId:
    string,

  event:
    string
) {
  return `guest:${orderId}:${event}`;
}

function dedupeGuestNotifications(
  notifications:
    GuestNotification[]
) {
  const seen =
    new Set<string>();

  return notifications.filter(
    (
      notification
    ) => {
      if (
        seen.has(
          notification.id
        )
      ) {
        return false;
      }

      seen.add(
        notification.id
      );

      return true;
    }
  );
}

function normalizeEmail(
  email:
    string
) {
  return email
    .trim()
    .toLowerCase();
}

function dedupeGuestRefs(
  refs:
    GuestNotificationQueryDto["orders"]
) {
  const seen =
    new Set<string>();

  return refs.filter(
    (
      reference
    ) => {
      const key =
        `${reference.orderId.trim().toLowerCase()}::${normalizeEmail(
          reference.email
        )}`;

      if (
        seen.has(
          key
        )
      ) {
        return false;
      }

      seen.add(
        key
      );

      return true;
    }
  );
}
