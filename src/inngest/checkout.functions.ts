import {
  Prisma,
} from "../generated/prisma/client";

import type {
  PrismaService,
} from "../prisma/prisma.service";

import {
  inngest,
} from "./client";

/* =========================================================
   EVENTS
========================================================= */

export const CHECKOUT_CREATED_EVENT =
  "elan/checkout.created";

export const ORDER_PAID_EVENT =
  "elan/order.paid";

export const COD_ORDER_PLACED_EVENT =
  "elan/order.cod-placed";

/* =========================================================
   EVENT TYPES
========================================================= */

type CheckoutCreatedEventData = {
  orderId: string;
  orderNumber: string;
  reservationExpiresAt: string;
  createdAt: string;
};

type OrderPaidEventData = {
  orderId: string;
  orderNumber: string;
  paidAt?: string;
};

type CodOrderPlacedEventData = {
  orderId: string;
  orderNumber: string;
  userId?: string | null;
  guest?: boolean;
  email: string;
  total: number;
  placedAt: string;
};

/* =========================================================
   RELEASE EXPIRED RESERVATION
========================================================= */

async function releaseExpiredReservation(
  prisma: PrismaService,
  orderId: string
) {
  return prisma.$transaction(
    async (tx) => {
      const order =
        await tx.order.findUnique({
          where: {
            id: orderId,
          },

          include: {
            payment: true,

            reservations: {
              where: {
                status:
                  "ACTIVE",
              },
            },
          },
        });

      if (!order) {
        return {
          status:
            "ORDER_NOT_FOUND",
        };
      }

      /*
       * Cash on delivery commits stock immediately,
       * therefore it does not use PayFast reservations.
       */
      if (
        order.paymentMethod ===
        "CASH_ON_DELIVERY"
      ) {
        return {
          status:
            "COD_ORDER",
        };
      }

      /*
       * A verified PayFast payment already owns the stock.
       * Never release it.
       */
      if (
        order.paymentStatus ===
        "COMPLETE"
      ) {
        return {
          status:
            "PAYMENT_COMPLETE",
        };
      }

      if (
        order.reservations.length ===
        0
      ) {
        return {
          status:
            "NO_ACTIVE_RESERVATIONS",
        };
      }

      if (
        order.reservationExpiresAt &&
        order.reservationExpiresAt >
          new Date()
      ) {
        return {
          status:
            "NOT_EXPIRED",
        };
      }

      /*
       * Release reservedStock for every active reservation.
       */
      for (
        const reservation
        of order.reservations
      ) {
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "ProductVariant"
            SET "reservedStock" = GREATEST(
              0,
              "reservedStock" - ${reservation.quantity}
            )
            WHERE "id" = ${reservation.variantId}
          `
        );
      }

      await tx.inventoryReservation.updateMany({
        where: {
          orderId:
            order.id,

          status:
            "ACTIVE",
        },

        data: {
          status:
            "RELEASED",
        },
      });

      if (order.payment) {
        await tx.payment.update({
          where: {
            orderId:
              order.id,
          },

          data: {
            status:
              "CANCELLED",
          },
        });
      }

      await tx.order.update({
        where: {
          id:
            order.id,
        },

        data: {
          orderStatus:
            "CANCELLED",

          paymentStatus:
            "CANCELLED",

          reservationExpiresAt:
            null,
        },
      });

      return {
        status:
          "RELEASED",

        orderNumber:
          order.orderNumber,

        releasedReservations:
          order.reservations.length,
      };
    }
  );
}

/* =========================================================
   CREATE CHECKOUT FUNCTIONS
========================================================= */

export function createCheckoutFunctions(
  prisma: PrismaService
) {
  const reservationMinutes =
    Math.min(
      60,
      Math.max(
        5,
        Number(
          process.env
            .CHECKOUT_RESERVATION_MINUTES ??
            15
        ) || 15
      )
    );

  /* =======================================================
     1. PAYFAST CHECKOUT RESERVATION EXPIRY
  ======================================================== */

  const checkoutReservationExpiry =
    inngest.createFunction(
      {
        id:
          "checkout-reservation-expiry",

        name:
          "Checkout reservation expiry",

        triggers: {
          event:
            CHECKOUT_CREATED_EVENT,
        },

        retries:
          5,
      },

      async ({
        event,
        step,
        logger,
      }) => {
        const data =
          event.data as CheckoutCreatedEventData;

        /*
         * Wait for the customer's PayFast payment window.
         */
        await step.sleep(
          "wait-for-payment-window",
          `${reservationMinutes}m`
        );

        const result =
          await step.run(
            "release-reservation-if-unpaid",
            () =>
              releaseExpiredReservation(
                prisma,
                data.orderId
              )
          );

        logger.info(
          "Checkout reservation expiry finished.",
          {
            orderNumber:
              data.orderNumber,

            result,
          }
        );

        return result;
      }
    );

  /* =======================================================
     2. SAFETY-NET RESERVATION AUDIT
  ======================================================== */

  const expiredReservationAudit =
    inngest.createFunction(
      {
        id:
          "expired-checkout-reservation-audit",

        name:
          "Expired checkout reservation audit",

        triggers: {
          cron:
            "*/5 * * * *",
        },

        retries:
          3,
      },

      async ({
        step,
        logger,
      }) => {
        /*
         * This protects the store if an event could not be
         * sent when checkout was created.
         */
        const expiredOrders =
          await step.run(
            "find-expired-checkout-orders",
            () =>
              prisma.inventoryReservation.findMany({
                where: {
                  status:
                    "ACTIVE",

                  expiresAt: {
                    lte:
                      new Date(),
                  },
                },

                distinct: [
                  "orderId",
                ],

                select: {
                  orderId:
                    true,
                },

                take:
                  100,
              })
          );

        const results =
          await step.run(
            "release-expired-checkout-orders",
            async () => {
              const output: unknown[] =
                [];

              for (
                const row
                of expiredOrders
              ) {
                output.push(
                  await releaseExpiredReservation(
                    prisma,
                    row.orderId
                  )
                );
              }

              return output;
            }
          );

        logger.info(
          "Expired checkout reservation audit completed.",
          {
            checked:
              expiredOrders.length,

            results,
          }
        );

        return {
          checked:
            expiredOrders.length,

          results,
        };
      }
    );

  /* =======================================================
     3. VERIFIED PAYFAST ORDER PROCESSOR
  ======================================================== */

  const paidOrderProcessor =
    inngest.createFunction(
      {
        id:
          "paid-order-processor",

        name:
          "Paid order processor",

        triggers: {
          event:
            ORDER_PAID_EVENT,
        },

        retries:
          5,
      },

      async ({
        event,
        step,
        logger,
      }) => {
        const data =
          event.data as OrderPaidEventData;

        /*
         * This is the correct place to later fan out:
         *
         * - customer order confirmation email
         * - admin new-order notification
         * - low-stock checks
         * - analytics jobs
         * - fulfilment creation
         */
        const order =
          await step.run(
            "load-paid-order",
            () =>
              prisma.order.findUnique({
                where: {
                  id:
                    data.orderId,
                },

                include: {
                  items: true,
                  payment: true,
                },
              })
          );

        if (!order) {
          logger.warn(
            "Paid order could not be found.",
            {
              orderId:
                data.orderId,
            }
          );

          return {
            status:
              "ORDER_NOT_FOUND",
          };
        }

        logger.info(
          "Verified PayFast order is ready for fulfilment.",
          {
            orderNumber:
              order.orderNumber,

            paymentStatus:
              order.paymentStatus,

            orderStatus:
              order.orderStatus,
          }
        );

        return {
          status:
            "READY_FOR_FULFILMENT",

          orderId:
            order.id,

          orderNumber:
            order.orderNumber,
        };
      }
    );

  /* =======================================================
     4. CASH ON DELIVERY ORDER PROCESSOR
  ======================================================== */

  const codOrderProcessor =
    inngest.createFunction(
      {
        id:
          "cod-order-processor",

        name:
          "Cash on delivery order processor",

        triggers: {
          event:
            COD_ORDER_PLACED_EVENT,
        },

        retries:
          5,
      },

      async ({
        event,
        step,
        logger,
      }) => {
        const data =
          event.data as CodOrderPlacedEventData;

        const order =
          await step.run(
            "load-cod-order",
            () =>
              prisma.order.findUnique({
                where: {
                  id:
                    data.orderId,
                },

                include: {
                  items: true,
                },
              })
          );

        if (!order) {
          logger.warn(
            "COD order could not be found.",
            {
              orderId:
                data.orderId,
            }
          );

          return {
            status:
              "ORDER_NOT_FOUND",
          };
        }

        /*
         * This is where you can later:
         *
         * - send "order received" email
         * - notify admin
         * - create fulfilment task
         * - run fraud/risk checks
         */
        logger.info(
          "Cash on delivery order is ready for fulfilment.",
          {
            orderNumber:
              order.orderNumber,

            guest:
              data.guest ?? false,

            email:
              data.email,
          }
        );

        return {
          status:
            "READY_FOR_FULFILMENT",

          orderId:
            order.id,

          orderNumber:
            order.orderNumber,
        };
      }
    );

  return [
    checkoutReservationExpiry,
    expiredReservationAudit,
    paidOrderProcessor,
    codOrderProcessor,
  ];
}
