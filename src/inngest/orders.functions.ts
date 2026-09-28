import type {
  PrismaService,
} from "../prisma/prisma.service";

import type {
  Prisma,
} from "../generated/prisma/client";

import {
  inngest,
} from "./client";

import {
  CHECKOUT_CREATED_EVENT,
  COD_ORDER_PLACED_EVENT,
  ORDER_PAID_EVENT,
} from "./checkout.functions";

/* =========================================================
   EVENTS
========================================================= */

export const ORDER_STATUS_CHANGED_EVENT =
  "elan/order.status-changed";

/* =========================================================
   CREATE ORDER FUNCTIONS
========================================================= */

export function createOrderFunctions(
  prisma:
    PrismaService
) {
  /* =======================================================
     1. PAYFAST CHECKOUT CREATED

     This is the missing piece that caused a newly-created
     PayFast order to show no notification until payment was
     completed.

     - Account customer: gets "Order created"
     - Guest: no in-app customer notification because there
       is no authenticated user notification inbox
     - Admin: gets a new-order notification for BOTH account
       and guest orders
  ======================================================== */

  const checkoutCreatedNotification =
    inngest.createFunction(
      {
        id:
          "elan-checkout-created-notification",

        name:
          "ÉLAN checkout created notification",

        triggers: {
          event:
            CHECKOUT_CREATED_EVENT,
        },

        retries:
          3,
      },

      async ({
        event,
        step,
        logger,
      }) => {
        const data =
          event.data as {
            orderId:
              string;

            orderNumber:
              string;

            reservationExpiresAt?:
              string;

            createdAt?:
              string;
          };

        const order =
          await step.run(
            "load-order",
            () =>
              prisma.order.findUnique(
                {
                  where: {
                    id:
                      data.orderId,
                  },

                  select: {
                    id:
                      true,

                    userId:
                      true,

                    email:
                      true,

                    firstName:
                      true,

                    lastName:
                      true,

                    orderNumber:
                      true,

                    orderStatus:
                      true,

                    paymentStatus:
                      true,

                    paymentMethod:
                      true,

                    total:
                      true,

                    currency:
                      true,
                  },
                }
              )
          );

        if (
          !order
        ) {
          logger.warn(
            "Checkout-created notification skipped: order not found.",
            {
              orderId:
                data.orderId,
            }
          );

          return {
            skipped:
              "ORDER_NOT_FOUND",
          };
        }

        /*
         * Account customer notification.
         *
         * Guest orders deliberately do not create a customer
         * inbox notification because there is no authenticated
         * User record to own it.
         */
        if (
          order.userId
        ) {
          await step.run(
            "notify-account-customer",
            () =>
              createNotificationOnce(
                prisma,
                {
                  recipientUserId:
                    order.userId,

                  type:
                    "ORDER",

                  priority:
                    "IMPORTANT",

                  title:
                    "Order created",

                  message:
                    `Order ${order.orderNumber} has been created. Complete your PayFast payment to confirm it.`,

                  href:
                    `/account/orders/${order.id}`,

                  metadata: {
                    orderId:
                      order.id,

                    orderNumber:
                      order.orderNumber,

                    orderStatus:
                      order.orderStatus,

                    paymentStatus:
                      order.paymentStatus,

                    paymentMethod:
                      order.paymentMethod,
                  },
                }
              )
          );
        }

        /*
         * Admin receives every new PayFast checkout, including
         * guest checkouts.
         */
        await step.run(
          "notify-admin",
          () =>
            createNotificationOnce(
              prisma,
              {
                targetRole:
                  "ADMIN",

                type:
                  "ORDER",

                priority:
                  "IMPORTANT",

                title:
                  "New PayFast order",

                message:
                  `${order.orderNumber} was created by ${order.firstName} ${order.lastName}. Payment is pending.`,

                href:
                  `/admin/orders/${order.id}`,

                metadata: {
                  orderId:
                    order.id,

                  orderNumber:
                    order.orderNumber,

                  customerType:
                    order.userId
                      ? "ACCOUNT"
                      : "GUEST",

                  email:
                    order.email,

                  orderStatus:
                    order.orderStatus,

                  paymentStatus:
                    order.paymentStatus,

                  paymentMethod:
                    order.paymentMethod,

                  total:
                    Number(
                      order.total
                    ),

                  currency:
                    order.currency,
                },
              }
            )
        );

        return {
          ok:
            true,

          customerNotification:
            Boolean(
              order.userId
            ),

          adminNotification:
            true,
        };
      }
    );

  /* =======================================================
     2. VERIFIED PAYFAST PAYMENT

     - Account customer: payment confirmation
     - Admin: payment confirmation
  ======================================================== */

  const paidOrderNotification =
    inngest.createFunction(
      {
        id:
          "elan-order-paid-notification",

        name:
          "ÉLAN order paid notification",

        triggers: {
          event:
            ORDER_PAID_EVENT,
        },

        retries:
          3,
      },

      async ({
        event,
        step,
        logger,
      }) => {
        const data =
          event.data as {
            orderId:
              string;

            orderNumber:
              string;
          };

        const order =
          await step.run(
            "load-order",
            () =>
              prisma.order.findUnique(
                {
                  where: {
                    id:
                      data.orderId,
                  },

                  select: {
                    id:
                      true,

                    userId:
                      true,

                    email:
                      true,

                    firstName:
                      true,

                    lastName:
                      true,

                    orderNumber:
                      true,

                    orderStatus:
                      true,

                    paymentStatus:
                      true,

                    paymentMethod:
                      true,

                    total:
                      true,

                    currency:
                      true,
                  },
                }
              )
          );

        if (
          !order
        ) {
          logger.warn(
            "Paid-order notification skipped: order not found.",
            {
              orderId:
                data.orderId,
            }
          );

          return {
            skipped:
              "ORDER_NOT_FOUND",
          };
        }

        if (
          order.userId
        ) {
          await step.run(
            "notify-account-customer",
            () =>
              createNotificationOnce(
                prisma,
                {
                  recipientUserId:
                    order.userId,

                  type:
                    "PAYMENT",

                  priority:
                    "IMPORTANT",

                  title:
                    "Payment confirmed",

                  message:
                    `Payment for order ${order.orderNumber} has been confirmed. We’re preparing your fragrance.`,

                  href:
                    `/account/orders/${order.id}`,

                  metadata: {
                    orderId:
                      order.id,

                    orderNumber:
                      order.orderNumber,

                    orderStatus:
                      order.orderStatus,

                    paymentStatus:
                      order.paymentStatus,
                  },
                }
              )
          );
        }

        await step.run(
          "notify-admin",
          () =>
            createNotificationOnce(
              prisma,
              {
                targetRole:
                  "ADMIN",

                type:
                  "PAYMENT",

                priority:
                  "IMPORTANT",

                title:
                  "PayFast payment confirmed",

                message:
                  `Payment for ${order.orderNumber} has been confirmed.`,

                href:
                  `/admin/orders/${order.id}`,

                metadata: {
                  orderId:
                    order.id,

                  orderNumber:
                    order.orderNumber,

                  customerType:
                    order.userId
                      ? "ACCOUNT"
                      : "GUEST",

                  email:
                    order.email,

                  paymentStatus:
                    order.paymentStatus,

                  total:
                    Number(
                      order.total
                    ),

                  currency:
                    order.currency,
                },
              }
            )
        );

        return {
          ok:
            true,
        };
      }
    );

  /* =======================================================
     3. CASH ON DELIVERY ORDER CREATED

     - Account customer: gets "Order received"
     - Guest: no in-app customer inbox
     - Admin: always gets a new-order notification
  ======================================================== */

  const codOrderNotification =
    inngest.createFunction(
      {
        id:
          "elan-cod-order-notification",

        name:
          "ÉLAN COD order notification",

        triggers: {
          event:
            COD_ORDER_PLACED_EVENT,
        },

        retries:
          3,
      },

      async ({
        event,
        step,
        logger,
      }) => {
        const data =
          event.data as {
            orderId:
              string;

            orderNumber:
              string;
          };

        const order =
          await step.run(
            "load-order",
            () =>
              prisma.order.findUnique(
                {
                  where: {
                    id:
                      data.orderId,
                  },

                  select: {
                    id:
                      true,

                    userId:
                      true,

                    email:
                      true,

                    firstName:
                      true,

                    lastName:
                      true,

                    orderNumber:
                      true,

                    orderStatus:
                      true,

                    paymentStatus:
                      true,

                    paymentMethod:
                      true,

                    total:
                      true,

                    currency:
                      true,
                  },
                }
              )
          );

        if (
          !order
        ) {
          logger.warn(
            "COD notification skipped: order not found.",
            {
              orderId:
                data.orderId,
            }
          );

          return {
            skipped:
              "ORDER_NOT_FOUND",
          };
        }

        if (
          order.userId
        ) {
          await step.run(
            "notify-account-customer",
            () =>
              createNotificationOnce(
                prisma,
                {
                  recipientUserId:
                    order.userId,

                  type:
                    "ORDER",

                  priority:
                    "IMPORTANT",

                  title:
                    "Order received",

                  message:
                    `Order ${order.orderNumber} has been received. You’ll pay when the order arrives.`,

                  href:
                    `/account/orders/${order.id}`,

                  metadata: {
                    orderId:
                      order.id,

                    orderNumber:
                      order.orderNumber,

                    orderStatus:
                      order.orderStatus,

                    paymentStatus:
                      order.paymentStatus,

                    paymentMethod:
                      order.paymentMethod,
                  },
                }
              )
          );
        }

        await step.run(
          "notify-admin",
          () =>
            createNotificationOnce(
              prisma,
              {
                targetRole:
                  "ADMIN",

                type:
                  "ORDER",

                priority:
                  "IMPORTANT",

                title:
                  "New cash-on-delivery order",

                message:
                  `${order.orderNumber} was placed by ${order.firstName} ${order.lastName}.`,

                href:
                  `/admin/orders/${order.id}`,

                metadata: {
                  orderId:
                    order.id,

                  orderNumber:
                    order.orderNumber,

                  customerType:
                    order.userId
                      ? "ACCOUNT"
                      : "GUEST",

                  email:
                    order.email,

                  orderStatus:
                    order.orderStatus,

                  paymentStatus:
                    order.paymentStatus,

                  paymentMethod:
                    order.paymentMethod,

                  total:
                    Number(
                      order.total
                    ),

                  currency:
                    order.currency,
                },
              }
            )
        );

        return {
          ok:
            true,
        };
      }
    );

  /* =======================================================
     4. ORDER STATUS CHANGED

     The admin order backend emits this event when fulfilment
     moves to packing / ready / shipped / delivered / etc.
  ======================================================== */

  const orderStatusNotification =
    inngest.createFunction(
      {
        id:
          "elan-order-status-notification",

        name:
          "ÉLAN order status notification",

        triggers: {
          event:
            ORDER_STATUS_CHANGED_EVENT,
        },

        retries:
          3,
      },

      async ({
        event,
        step,
        logger,
      }) => {
        const data =
          event.data as {
            orderId:
              string;

            previousStatus?:
              string;

            orderStatus:
              string;
          };

        const order =
          await step.run(
            "load-order",
            () =>
              prisma.order.findUnique(
                {
                  where: {
                    id:
                      data.orderId,
                  },

                  select: {
                    id:
                      true,

                    userId:
                      true,

                    orderNumber:
                      true,

                    orderStatus:
                      true,
                  },
                }
              )
          );

        if (
          !order
        ) {
          logger.warn(
            "Order-status notification skipped: order not found.",
            {
              orderId:
                data.orderId,
            }
          );

          return {
            skipped:
              "ORDER_NOT_FOUND",
          };
        }

        const copy =
          statusCopy(
            order.orderStatus
          );

        /*
         * Admin must receive fulfilment/status notifications
         * for BOTH account and guest orders.
         *
         * This was the missing piece: previously this function
         * only created the customer notification.
         */
        await step.run(
          "notify-admin",
          () =>
            createNotificationOnce(
              prisma,
              {
                targetRole:
                  "ADMIN",

                type:
                  notificationTypeForStatus(
                    order.orderStatus
                  ),

                priority:
                  notificationPriorityForStatus(
                    order.orderStatus
                  ),

                title:
                  adminStatusTitle(
                    order.orderStatus
                  ),

                message:
                  `${adminStatusMessage(
                    order.orderStatus
                  )} ${order.orderNumber}.`,

                href:
                  `/admin/orders/${order.id}`,

                metadata: {
                  orderId:
                    order.id,

                  orderNumber:
                    order.orderNumber,

                  previousStatus:
                    data.previousStatus ??
                    null,

                  orderStatus:
                    order.orderStatus,
                },
              }
            )
        );

        /*
         * Guest customers do not have an authenticated
         * customer notification inbox. The admin notification
         * above is still created for guest orders.
         */
        if (
          !order.userId
        ) {
          return {
            ok:
              true,

            customerNotification:
              false,

            adminNotification:
              true,
          };
        }

        await step.run(
          "notify-account-customer",
          () =>
            createNotificationOnce(
              prisma,
              {
                recipientUserId:
                  order.userId!,

                type:
                  "DELIVERY",

                priority:
                  "IMPORTANT",

                title:
                  copy.title,

                message:
                  `${copy.message} Order ${order.orderNumber}.`,

                href:
                  `/account/orders/${order.id}`,

                metadata: {
                  orderId:
                    order.id,

                  orderNumber:
                    order.orderNumber,

                  previousStatus:
                    data.previousStatus ??
                    null,

                  orderStatus:
                    order.orderStatus,
                },
              }
            )
        );

        return {
          ok:
            true,

          customerNotification:
            true,

          adminNotification:
            true,
        };
      }
    );

  return [
    checkoutCreatedNotification,
    paidOrderNotification,
    codOrderNotification,
    orderStatusNotification,
  ];
}

/* =========================================================
   IDEMPOTENT NOTIFICATION CREATION
========================================================= */

async function createNotificationOnce(
  prisma:
    PrismaService,

  input: {
    recipientUserId?:
      string |
      null;

    targetRole?:
      "CUSTOMER" |
      "ADMIN" |
      null;

    type:
      "ORDER" |
      "PAYMENT" |
      "INVENTORY" |
      "DISPUTE" |
      "DELIVERY" |
      "CUSTOMER" |
      "SYSTEM";

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

    metadata?:
      Prisma.InputJsonValue;
  }
) {
  const existing =
    await prisma.notification.findFirst(
      {
        where: {
          recipientUserId:
            input.recipientUserId ??
            null,

          targetRole:
            input.targetRole ??
            null,

          type:
            input.type,

          title:
            input.title,

          href:
            input.href,
        },

        select: {
          id:
            true,

          createdAt:
            true,
        },
      }
    );

  if (
    existing
  ) {
    return {
      created:
        false,

      notification:
        existing,
    };
  }

  const notification =
    await prisma.notification.create(
      {
        data: {
          recipientUserId:
            input.recipientUserId ??
            null,

          targetRole:
            input.targetRole ??
            null,

          type:
            input.type,

          priority:
            input.priority,

          title:
            input.title,

          message:
            input.message,

          href:
            input.href,

          metadata:
            input.metadata,
        },
      }
    );

  return {
    created:
      true,

    notification,
  };
}

/* =========================================================
   ADMIN STATUS HELPERS
========================================================= */


function notificationTypeForStatus(
  status:
    string
):
  "ORDER" |
  "DELIVERY" |
  "DISPUTE" {
  switch (
    status
  ) {
    case "READY_FOR_SHIPMENT":
    case "SHIPPED":
    case "DELIVERED":
      return "DELIVERY";

    case "RETURN_REQUESTED":
    case "RETURNED":
    case "REFUNDED":
      return "DISPUTE";

    default:
      return "ORDER";
  }
}

function notificationPriorityForStatus(
  status:
    string
):
  "NORMAL" |
  "IMPORTANT" |
  "URGENT" {
  switch (
    status
  ) {
    case "CANCELLED":
    case "RETURN_REQUESTED":
      return "URGENT";

    case "SHIPPED":
    case "DELIVERED":
    case "REFUNDED":
      return "IMPORTANT";

    default:
      return "NORMAL";
  }
}

function adminStatusTitle(
  status:
    string
) {
  switch (
    status
  ) {
    case "PROCESSING":
      return "Order processing";

    case "PACKING":
      return "Order packing";

    case "READY_FOR_SHIPMENT":
      return "Order ready for shipment";

    case "SHIPPED":
      return "Order shipped";

    case "DELIVERED":
      return "Order delivered";

    case "CANCELLED":
      return "Order cancelled";

    case "RETURN_REQUESTED":
      return "Return requested";

    case "RETURNED":
      return "Order returned";

    case "REFUNDED":
      return "Order refunded";

    default:
      return "Order status updated";
  }
}

function adminStatusMessage(
  status:
    string
) {
  switch (
    status
  ) {
    case "PROCESSING":
      return "A customer order moved to processing:";

    case "PACKING":
      return "A customer order is now being packed:";

    case "READY_FOR_SHIPMENT":
      return "A customer order is ready for shipment:";

    case "SHIPPED":
      return "A customer order has been marked as shipped:";

    case "DELIVERED":
      return "A customer order has been marked as delivered:";

    case "CANCELLED":
      return "A customer order has been cancelled:";

    case "RETURN_REQUESTED":
      return "A return has been requested for order:";

    case "RETURNED":
      return "A customer order has been marked as returned:";

    case "REFUNDED":
      return "A customer order has been marked as refunded:";

    default:
      return "A customer order changed status:";
  }
}

/* =========================================================
   STATUS COPY
========================================================= */

function statusCopy(
  status:
    string
) {
  switch (
    status
  ) {
    case "PROCESSING":
      return {
        title:
          "Your order is confirmed",
        message:
          "Your order is now being prepared.",
      };

    case "PACKING":
      return {
        title:
          "Your order is being packed",
        message:
          "Your fragrances are being prepared for dispatch.",
      };

    case "READY_FOR_SHIPMENT":
      return {
        title:
          "Ready for shipment",
        message:
          "Your order is packed and ready to leave ÉLAN.",
      };

    case "SHIPPED":
      return {
        title:
          "Your order is on its way",
        message:
          "Your fragrances have been handed to the delivery partner.",
      };

    case "DELIVERED":
      return {
        title:
          "Order delivered",
        message:
          "Your ÉLAN order has been marked as delivered.",
      };

    case "CANCELLED":
      return {
        title:
          "Order cancelled",
        message:
          "Your order has been cancelled.",
      };

    case "RETURN_REQUESTED":
      return {
        title:
          "Return request received",
        message:
          "We’ve received your return request.",
      };

    case "RETURNED":
      return {
        title:
          "Order returned",
        message:
          "Your returned order has been received.",
      };

    case "REFUNDED":
      return {
        title:
          "Order refunded",
        message:
          "Your order has been marked as refunded.",
      };

    default:
      return {
        title:
          "Order updated",
        message:
          "There is a new update on your order.",
      };
  }
}
