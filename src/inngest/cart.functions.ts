import type {
  PrismaService,
} from "../prisma/prisma.service";

import {
  inngest,
} from "./client";

/* =========================================================
   EVENT NAMES
========================================================= */

export const CART_CHANGED_EVENT =
  "elan/cart.changed";

export const CART_ABANDONED_EVENT =
  "elan/cart.abandoned";

/* =========================================================
   TYPES
========================================================= */

export type CartChangedAction =
  | "ADDED"
  | "UPDATED"
  | "REMOVED"
  | "CLEARED"
  | "SYNCED"
  | "MOVED_TO_WISHLIST";

type CartChangedEventData = {
  userId: string;

  action:
    CartChangedAction;

  variantId?:
    string;

  changedAt:
    string;
};

type CartAbandonedEventData = {
  userId: string;
  itemCount: number;
  subtotal: number;
  detectedAt: string;
};

/* =========================================================
   FACTORY
========================================================= */

export function createCartFunctions(
  prisma: PrismaService
) {
  const abandonedDelay =
    process.env
      .CART_ABANDONED_DELAY
      ?.trim() ||
    "2h";

  /* =======================================================
     1. CART ACTIVITY PROCESSOR
  ======================================================== */

  const cartActivityProcessor =
    inngest.createFunction(
      {
        id:
          "cart-activity-processor",

        name:
          "Cart activity processor",

        triggers: {
          event:
            CART_CHANGED_EVENT,
        },

        retries:
          3,
      },

      async ({
        event,
        step,
        logger,
      }) => {
        const eventData =
          event.data as CartChangedEventData;

        const snapshot =
          await step.run(
            "load-current-cart",
            async () => {
              const items =
                await prisma.cartItem.findMany(
                  {
                    where: {
                      userId:
                        eventData.userId,
                    },

                    select: {
                      quantity:
                        true,

                      variant: {
                        select: {
                          price:
                            true,

                          stock:
                            true,

                          reservedStock:
                            true,

                          active:
                            true,

                          product: {
                            select: {
                              status:
                                true,
                            },
                          },
                        },
                      },
                    },
                  }
                );

              const activeItems =
                items.filter(
                  (item) =>
                    item.variant.active &&
                    item.variant.product
                      .status ===
                      "ACTIVE"
                );

              const itemCount =
                activeItems.reduce(
                  (
                    total,
                    item
                  ) =>
                    total +
                    item.quantity,
                  0
                );

              const subtotal =
                activeItems.reduce(
                  (
                    total,
                    item
                  ) =>
                    total +
                    Number(
                      item.variant.price
                    ) *
                      item.quantity,
                  0
                );

              const unavailableItems =
                activeItems.filter(
                  (item) => {
                    const availableStock =
                      Math.max(
                        0,
                        item.variant.stock -
                          item.variant
                            .reservedStock
                      );

                    return (
                      availableStock <
                      item.quantity
                    );
                  }
                ).length;

              return {
                itemCount,
                subtotal,
                unavailableItems,
              };
            }
          );

        logger.info(
          "Cart activity processed.",
          {
            userId:
              eventData.userId,

            action:
              eventData.action,

            variantId:
              eventData.variantId ??
              null,

            itemCount:
              snapshot.itemCount,

            subtotal:
              snapshot.subtotal,

            unavailableItems:
              snapshot.unavailableItems,
          }
        );

        return {
          action:
            eventData.action,

          userId:
            eventData.userId,

          variantId:
            eventData.variantId ??
            null,

          cart:
            snapshot,
        };
      }
    );

  /* =======================================================
     2. ABANDONED CART WATCHER

     Any new cart event for the same customer cancels the
     previous pending wait and starts a fresh two-hour timer.
  ======================================================== */

  const abandonedCartWatcher =
    inngest.createFunction(
      {
        id:
          "abandoned-cart-watcher",

        name:
          "Abandoned cart watcher",

        triggers: {
          event:
            CART_CHANGED_EVENT,
        },

        singleton: {
          key:
            "event.data.userId",

          mode:
            "cancel",
        },

        retries:
          5,
      },

      async ({
        event,
        step,
        logger,
      }) => {
        const eventData =
          event.data as CartChangedEventData;

        if (
          eventData.action ===
            "CLEARED"
        ) {
          return {
            status:
              "IGNORED",

            reason:
              "CART_CLEARED",
          };
        }

        await step.sleep(
          "wait-before-abandoned-check",
          abandonedDelay
        );

        const currentCart =
          await step.run(
            "recheck-cart",
            async () => {
              const items =
                await prisma.cartItem.findMany(
                  {
                    where: {
                      userId:
                        eventData.userId,
                    },

                    select: {
                      quantity:
                        true,

                      variant: {
                        select: {
                          price:
                            true,

                          active:
                            true,

                          product: {
                            select: {
                              status:
                                true,
                            },
                          },
                        },
                      },
                    },
                  }
                );

              const activeItems =
                items.filter(
                  (item) =>
                    item.variant.active &&
                    item.variant.product
                      .status ===
                      "ACTIVE"
                );

              return {
                itemCount:
                  activeItems.reduce(
                    (
                      total,
                      item
                    ) =>
                      total +
                      item.quantity,
                    0
                  ),

                subtotal:
                  activeItems.reduce(
                    (
                      total,
                      item
                    ) =>
                      total +
                      Number(
                        item.variant.price
                      ) *
                        item.quantity,
                    0
                  ),
              };
            }
          );

        if (
          currentCart.itemCount ===
          0
        ) {
          return {
            status:
              "IGNORED",

            reason:
              "CART_EMPTY",
          };
        }

        const abandonedEvent = {
          userId:
            eventData.userId,

          itemCount:
            currentCart.itemCount,

          subtotal:
            currentCart.subtotal,

          detectedAt:
            new Date().toISOString(),
        } satisfies CartAbandonedEventData;

        await step.sendEvent(
          "send-abandoned-cart-event",
          {
            name:
              CART_ABANDONED_EVENT,

            data:
              abandonedEvent,
          }
        );

        logger.info(
          "Abandoned cart detected.",
          abandonedEvent
        );

        return {
          status:
            "ABANDONED",

          ...currentCart,
        };
      }
    );

  /* =======================================================
     3. ABANDONED CART JOB

     The durable job is active now and visible in Inngest.
     Later your Nodemailer service can be called inside the
     "prepare-reminder" step without changing CartService.
  ======================================================== */

  const abandonedCartJob =
    inngest.createFunction(
      {
        id:
          "abandoned-cart-job",

        name:
          "Abandoned cart job",

        triggers: {
          event:
            CART_ABANDONED_EVENT,
        },

        retries:
          5,

        concurrency: {
          limit:
            5,
        },
      },

      async ({
        event,
        step,
        logger,
      }) => {
        const eventData =
          event.data as CartAbandonedEventData;

        const customer =
          await step.run(
            "load-customer",
            async () => {
              return prisma.user.findUnique(
                {
                  where: {
                    id:
                      eventData.userId,
                  },

                  select: {
                    id:
                      true,

                    name:
                      true,

                    email:
                      true,
                  },
                }
              );
            }
          );

        if (!customer) {
          return {
            status:
              "IGNORED",

            reason:
              "CUSTOMER_NOT_FOUND",
          };
        }

        const reminder =
          await step.run(
            "prepare-reminder",
            async () => {
              return {
                customerId:
                  customer.id,

                customerName:
                  customer.name,

                customerEmail:
                  customer.email,

                itemCount:
                  eventData.itemCount,

                subtotal:
                  eventData.subtotal,

                detectedAt:
                  eventData.detectedAt,

                emailStatus:
                  "READY_FOR_SMTP",
              };
            }
          );

        logger.info(
          "Abandoned cart reminder prepared.",
          {
            customerId:
              customer.id,

            itemCount:
              eventData.itemCount,

            subtotal:
              eventData.subtotal,
          }
        );

        return reminder;
      }
    );

  return [
    cartActivityProcessor,
    abandonedCartWatcher,
    abandonedCartJob,
  ];
}
