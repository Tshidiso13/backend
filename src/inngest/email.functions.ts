import type {
  PrismaService,
} from "../prisma/prisma.service";

import {
  EmailService,
} from "../email/email.service";

import {
  emailTemplates,
} from "../email/email.templates";

import type {
  OrderEmailData,
} from "../email/email.types";

import {
  inngest,
} from "./client";

import {
  CHECKOUT_CREATED_EVENT,
  COD_ORDER_PLACED_EVENT,
  ORDER_PAID_EVENT,
} from "./checkout.functions";

import {
  ORDER_STATUS_CHANGED_EVENT,
} from "./orders.functions";

export function createEmailFunctions(
  prisma:
    PrismaService,

  email:
    EmailService,

  frontendUrl:
    string
) {
  const cleanFrontendUrl =
    frontendUrl.replace(
      /\/+$/,
      ""
    );

  /* =======================================================
     1. NEW PAYFAST ORDER
  ======================================================== */

  const checkoutCreatedEmail =
    inngest.createFunction(
      {
        id:
          "elan-email-checkout-created",

        name:
          "ÉLAN email · checkout created",

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
      }) => {
        const data =
          event.data as {
            orderId:
              string;
          };

        const order =
          await step.run(
            "load-order",
            () =>
              loadOrderEmailData(
                prisma,
                data.orderId
              )
          );

        if (
          !order
        ) {
          return {
            skipped:
              "ORDER_NOT_FOUND",
          };
        }

        const customerTemplate =
          emailTemplates.orderCreated(
            order,
            cleanFrontendUrl
          );

        const adminTemplate =
          emailTemplates.adminNewOrder(
            order,
            cleanFrontendUrl
          );

        const [
          customer,
          admin,
        ] =
          await Promise.all([
            step.run(
              "send-customer-email",
              () =>
                email.sendCustomer({
                  email:
                    order.email,

                  name:
                    `${order.firstName} ${order.lastName}`.trim(),

                  ...customerTemplate,
                })
            ),

            step.run(
              "send-admin-email",
              () =>
                email.sendAdmin(
                  adminTemplate
                )
            ),
          ]);

        return {
          customer,
          admin,
        };
      }
    );

  /* =======================================================
     2. CASH ON DELIVERY ORDER
  ======================================================== */

  const codOrderEmail =
    inngest.createFunction(
      {
        id:
          "elan-email-cod-order",

        name:
          "ÉLAN email · COD order",

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
      }) => {
        const data =
          event.data as {
            orderId:
              string;
          };

        const order =
          await step.run(
            "load-order",
            () =>
              loadOrderEmailData(
                prisma,
                data.orderId
              )
          );

        if (
          !order
        ) {
          return {
            skipped:
              "ORDER_NOT_FOUND",
          };
        }

        const customerTemplate =
          emailTemplates.orderCreated(
            order,
            cleanFrontendUrl
          );

        const adminTemplate =
          emailTemplates.adminNewOrder(
            order,
            cleanFrontendUrl
          );

        const [
          customer,
          admin,
        ] =
          await Promise.all([
            step.run(
              "send-customer-email",
              () =>
                email.sendCustomer({
                  email:
                    order.email,

                  name:
                    `${order.firstName} ${order.lastName}`.trim(),

                  ...customerTemplate,
                })
            ),

            step.run(
              "send-admin-email",
              () =>
                email.sendAdmin(
                  adminTemplate
                )
            ),
          ]);

        return {
          customer,
          admin,
        };
      }
    );

  /* =======================================================
     3. PAYFAST PAYMENT CONFIRMED
  ======================================================== */

  const paymentConfirmedEmail =
    inngest.createFunction(
      {
        id:
          "elan-email-payment-confirmed",

        name:
          "ÉLAN email · payment confirmed",

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
      }) => {
        const data =
          event.data as {
            orderId:
              string;
          };

        const order =
          await step.run(
            "load-order",
            () =>
              loadOrderEmailData(
                prisma,
                data.orderId
              )
          );

        if (
          !order
        ) {
          return {
            skipped:
              "ORDER_NOT_FOUND",
          };
        }

        const customerTemplate =
          emailTemplates.paymentConfirmed(
            order,
            cleanFrontendUrl
          );

        const adminTemplate =
          emailTemplates.adminPaymentConfirmed(
            order,
            cleanFrontendUrl
          );

        const [
          customer,
          admin,
        ] =
          await Promise.all([
            step.run(
              "send-customer-email",
              () =>
                email.sendCustomer({
                  email:
                    order.email,

                  name:
                    `${order.firstName} ${order.lastName}`.trim(),

                  ...customerTemplate,
                })
            ),

            step.run(
              "send-admin-email",
              () =>
                email.sendAdmin(
                  adminTemplate
                )
            ),
          ]);

        return {
          customer,
          admin,
        };
      }
    );

  /* =======================================================
     4. ORDER STATUS CHANGED

     Always email the customer (account OR guest) because the
     order stores the checkout email snapshot.

     Admin only receives email for important operational
     states where an inbox alert is actually useful.
  ======================================================== */

  const orderStatusEmail =
    inngest.createFunction(
      {
        id:
          "elan-email-order-status",

        name:
          "ÉLAN email · order status changed",

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
      }) => {
        const data =
          event.data as {
            orderId:
              string;

            orderStatus:
              string;
          };

        const order =
          await step.run(
            "load-order",
            () =>
              loadOrderEmailData(
                prisma,
                data.orderId
              )
          );

        if (
          !order
        ) {
          return {
            skipped:
              "ORDER_NOT_FOUND",
          };
        }

        const customerTemplate =
          emailTemplates.orderStatusChanged(
            order,
            cleanFrontendUrl
          );

        const customer =
          await step.run(
            "send-customer-email",
            () =>
              email.sendCustomer({
                email:
                  order.email,

                name:
                  `${order.firstName} ${order.lastName}`.trim(),

                ...customerTemplate,
              })
          );

        let admin:
          unknown =
          null;

        if (
          shouldEmailAdminForStatus(
            order.orderStatus
          )
        ) {
          const adminTemplate =
            emailTemplates.adminImportantStatus(
              order,
              cleanFrontendUrl
            );

          admin =
            await step.run(
              "send-admin-email",
              () =>
                email.sendAdmin(
                  adminTemplate
                )
            );
        }

        return {
          customer,
          admin,
        };
      }
    );

  return [
    checkoutCreatedEmail,
    codOrderEmail,
    paymentConfirmedEmail,
    orderStatusEmail,
  ];
}

/* =========================================================
   ORDER LOADER
========================================================= */

async function loadOrderEmailData(
  prisma:
    PrismaService,

  orderId:
    string
):
  Promise<OrderEmailData | null> {
  const order =
    await prisma.order.findUnique({
      where: {
        id:
          orderId,
      },

      select: {
        id:
          true,

        orderNumber:
          true,

        firstName:
          true,

        lastName:
          true,

        email:
          true,

        paymentMethod:
          true,

        paymentStatus:
          true,

        orderStatus:
          true,

        deliveryMethod:
          true,

        total:
          true,

        currency:
          true,

        createdAt:
          true,

        paidAt:
          true,

        shippedAt:
          true,

        deliveredAt:
          true,

        paxiPointName:
          true,
      },
    });

  if (
    !order
  ) {
    return null;
  }

  const shipment =
    await prisma.shipment.findUnique({
      where: {
        orderId:
          order.id,
      },

      select: {
        trackingNumber:
          true,

        trackingUrl:
          true,
      },
    });

  return {
    orderId:
      order.id,

    orderNumber:
      order.orderNumber,

    firstName:
      order.firstName,

    lastName:
      order.lastName,

    email:
      order.email,

    paymentMethod:
      order.paymentMethod,

    paymentStatus:
      order.paymentStatus,

    orderStatus:
      order.orderStatus,

    deliveryMethod:
      order.deliveryMethod,

    total:
      Number(
        order.total
      ),

    currency:
      order.currency,

    /*
     * Inngest step results are JSON serialized. Return ISO
     * strings here deliberately so TypeScript and runtime data
     * agree on both sides of step.run().
     */
    createdAt:
      order.createdAt.toISOString(),

    paidAt:
      order.paidAt
        ?.toISOString() ??
      null,

    shippedAt:
      order.shippedAt
        ?.toISOString() ??
      null,

    deliveredAt:
      order.deliveredAt
        ?.toISOString() ??
      null,

    trackingNumber:
      shipment?.trackingNumber ??
      null,

    trackingUrl:
      shipment?.trackingUrl ??
      null,

    paxiPointName:
      order.paxiPointName,
  };
}

/* =========================================================
   ADMIN STATUS EMAIL POLICY
========================================================= */

function shouldEmailAdminForStatus(
  status:
    string
) {
  return [
    "DELIVERED",
    "CANCELLED",
    "RETURN_REQUESTED",
    "RETURNED",
    "REFUNDED",
  ].includes(
    status
  );
}
