import type {
  PrismaService,
} from "../prisma/prisma.service";

import {
  inngest,
} from "./client";

/* =========================================================
   EVENT NAMES
========================================================= */

export const INVENTORY_STOCK_UPDATED_EVENT =
  "elan/inventory.stock.updated";

export const INVENTORY_ALERT_EVENT =
  "elan/inventory.alert.requested";

/* =========================================================
   TYPES
========================================================= */

type InventoryStockUpdatedEventData = {
  variantId: string;
  productId: string;
  productName: string;
  size: string;
  sku: string;

  stock: number;
  reservedStock: number;
  availableStock: number;
  threshold: number;

  changedAt: string;
};

type InventoryAlertEventData = {
  variantId: string;
  productId: string;
  productName: string;
  size: string;
  sku: string;

  stock: number;
  reservedStock: number;
  availableStock: number;
  threshold: number;

  severity:
    | "LOW_STOCK"
    | "OUT_OF_STOCK";

  source:
    | "STOCK_UPDATE"
    | "DAILY_AUDIT";

  detectedAt: string;
};

/* =========================================================
   FACTORY

   PrismaService comes from the existing Nest application.
   This avoids creating a second PrismaClient just for Inngest.
========================================================= */

export function createInventoryFunctions(
  prisma: PrismaService
) {
  /* =======================================================
     1. WATCH EVERY STOCK UPDATE
  ======================================================== */

  const inventoryStockWatcher =
    inngest.createFunction(
      {
        id:
          "inventory-stock-watcher",

        name:
          "Inventory stock watcher",

        triggers: {
          event:
            INVENTORY_STOCK_UPDATED_EVENT,
        },

        /*
         * Only one watcher for a variant should execute at once.
         * If stock is changed rapidly, the latest event wins.
         */
        singleton: {
          key:
            "event.data.variantId",

          mode:
            "cancel",
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
          event.data as InventoryStockUpdatedEventData;

        /*
         * Re-read the variant from Neon.
         * We do not trust the event as the final stock state because
         * another update may have happened after this event was sent.
         */
        const variant =
          await step.run(
            "load-current-variant",
            async () => {
              return prisma.productVariant.findUnique(
                {
                  where: {
                    id:
                      eventData.variantId,
                  },

                  select: {
                    id:
                      true,

                    productId:
                      true,

                    size:
                      true,

                    sku:
                      true,

                    stock:
                      true,

                    reservedStock:
                      true,

                    threshold:
                      true,

                    active:
                      true,

                    product: {
                      select: {
                        name:
                          true,

                        status:
                          true,
                      },
                    },
                  },
                }
              );
            }
          );

        if (!variant) {
          logger.warn(
            "Inventory watcher skipped because the variant no longer exists.",
            {
              variantId:
                eventData.variantId,
            }
          );

          return {
            status:
              "VARIANT_NOT_FOUND",
          };
        }

        if (
          !variant.active ||
          variant.product.status ===
            "ARCHIVED"
        ) {
          return {
            status:
              "IGNORED",
            reason:
              "Variant inactive or product archived.",
          };
        }

        const availableStock =
          Math.max(
            0,
            variant.stock -
              variant.reservedStock
          );

        const severity =
          availableStock <=
          0
            ? "OUT_OF_STOCK"
            : availableStock <=
              variant.threshold
            ? "LOW_STOCK"
            : null;

        if (!severity) {
          logger.info(
            "Inventory level is healthy.",
            {
              variantId:
                variant.id,
              availableStock,
              threshold:
                variant.threshold,
            }
          );

          return {
            status:
              "HEALTHY",
            availableStock,
          };
        }

        await step.sendEvent(
          "send-inventory-alert-event",
          {
            name:
              INVENTORY_ALERT_EVENT,

            data: {
              variantId:
                variant.id,

              productId:
                variant.productId,

              productName:
                variant.product.name,

              size:
                variant.size,

              sku:
                variant.sku,

              stock:
                variant.stock,

              reservedStock:
                variant.reservedStock,

              availableStock,

              threshold:
                variant.threshold,

              severity,

              source:
                "STOCK_UPDATE",

              detectedAt:
                new Date().toISOString(),
            } satisfies InventoryAlertEventData,
          }
        );

        return {
          status:
            severity,
          availableStock,
        };
      }
    );

  /* =======================================================
     2. DAILY INVENTORY AUDIT

     Runs at 08:00 South Africa time every day.
     It catches low stock even when stock changed outside the
     admin inventory page (orders, imports, manual DB changes,
     future warehouse integrations, etc).
  ======================================================== */

  const dailyInventoryAudit =
    inngest.createFunction(
      {
        id:
          "daily-inventory-audit",

        name:
          "Daily inventory audit",

        triggers: {
          cron:
            "TZ=Africa/Johannesburg 0 8 * * *",
        },

        retries:
          3,
      },

      async ({
        step,
        logger,
      }) => {
        const variants =
          await step.run(
            "scan-inventory",
            async () => {
              return prisma.productVariant.findMany(
                {
                  where: {
                    active:
                      true,

                    product: {
                      status: {
                        not:
                          "ARCHIVED",
                      },
                    },
                  },

                  select: {
                    id:
                      true,

                    productId:
                      true,

                    size:
                      true,

                    sku:
                      true,

                    stock:
                      true,

                    reservedStock:
                      true,

                    threshold:
                      true,

                    product: {
                      select: {
                        name:
                          true,
                      },
                    },
                  },
                }
              );
            }
          );

        const alerts =
          variants
            .map(
              (
                variant
              ): InventoryAlertEventData | null => {
                const availableStock =
                  Math.max(
                    0,
                    variant.stock -
                      variant.reservedStock
                  );

                const severity =
                  availableStock <=
                  0
                    ? "OUT_OF_STOCK"
                    : availableStock <=
                      variant.threshold
                    ? "LOW_STOCK"
                    : null;

                if (!severity) {
                  return null;
                }

                return {
                  variantId:
                    variant.id,

                  productId:
                    variant.productId,

                  productName:
                    variant.product.name,

                  size:
                    variant.size,

                  sku:
                    variant.sku,

                  stock:
                    variant.stock,

                  reservedStock:
                    variant.reservedStock,

                  availableStock,

                  threshold:
                    variant.threshold,

                  severity,

                  source:
                    "DAILY_AUDIT",

                  detectedAt:
                    new Date().toISOString(),
                };
              }
            )
            .filter(
              (
                alert
              ): alert is InventoryAlertEventData =>
                alert !==
                null
            );

        if (
          alerts.length >
          0
        ) {
          /*
           * Fan out one durable event per affected variant.
           */
          await step.sendEvent(
            "fan-out-inventory-alerts",
            alerts.map(
              (alert) => ({
                name:
                  INVENTORY_ALERT_EVENT,

                data:
                  alert,
              })
            )
          );
        }

        logger.info(
          "Daily inventory audit completed.",
          {
            checked:
              variants.length,
            alerts:
              alerts.length,
          }
        );

        return {
          checked:
            variants.length,

          alerts:
            alerts.length,
        };
      }
    );

  /* =======================================================
     3. ALERT JOB

     This is deliberately its own durable job so SMTP,
     database notifications, Slack, etc. can be added here
     later without slowing down stock updates.

     For now the event is recorded and visible in Inngest.
  ======================================================== */

  const inventoryAlertJob =
    inngest.createFunction(
      {
        id:
          "inventory-alert-job",

        name:
          "Inventory alert job",

        triggers: {
          event:
            INVENTORY_ALERT_EVENT,
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
        const alert =
          event.data as InventoryAlertEventData;

        await step.run(
          "record-alert-run",
          async () => {
            /*
             * No new Prisma alert table is required.
             *
             * This run remains visible in Inngest with retries,
             * history and the event payload.
             *
             * When your Notifications/Nodemailer service is ready,
             * this is the exact step where the email/notification
             * call should be added.
             */
            logger.warn(
              alert.severity ===
                "OUT_OF_STOCK"
                ? "Variant is out of stock."
                : "Variant is low on stock.",
              {
                productId:
                  alert.productId,

                variantId:
                  alert.variantId,

                productName:
                  alert.productName,

                size:
                  alert.size,

                sku:
                  alert.sku,

                stock:
                  alert.stock,

                reservedStock:
                  alert.reservedStock,

                availableStock:
                  alert.availableStock,

                threshold:
                  alert.threshold,

                source:
                  alert.source,
              }
            );

            return {
              recorded:
                true,
            };
          }
        );

        return {
          severity:
            alert.severity,

          productName:
            alert.productName,

          size:
            alert.size,

          availableStock:
            alert.availableStock,
        };
      }
    );

  return [
    inventoryStockWatcher,
    dailyInventoryAudit,
    inventoryAlertJob,
  ];
}
