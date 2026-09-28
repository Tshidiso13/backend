import type {
  OrderEmailData,
} from "./email.types";

const money =
  new Intl.NumberFormat(
    "en-ZA",
    {
      style:
        "currency",

      currency:
        "ZAR",

      minimumFractionDigits:
        0,

      maximumFractionDigits:
        0,
    }
  );

const date =
  new Intl.DateTimeFormat(
    "en-ZA",
    {
      day:
        "2-digit",

      month:
        "long",

      year:
        "numeric",
    }
  );

export const emailTemplates = {
  orderCreated(
    order:
      OrderEmailData,

    frontendUrl:
      string
  ) {
    const title =
      order.paymentMethod ===
      "PAYFAST"
        ? "Your order has been created"
        : "Your order has been received";

    const intro =
      order.paymentMethod ===
      "PAYFAST"
        ? "Your order is waiting for payment confirmation. Once PayFast confirms the payment, we’ll begin preparing your fragrance."
        : "Your order has been received and will now move into preparation.";

    return customerOrderTemplate({
      eyebrow:
        "Order received",

      title,

      intro,

      order,

      frontendUrl,
    });
  },

  paymentConfirmed(
    order:
      OrderEmailData,

    frontendUrl:
      string
  ) {
    return customerOrderTemplate({
      eyebrow:
        "Payment confirmed",

      title:
        "Your payment is confirmed.",

      intro:
        "Thank you. Your payment has been confirmed and your fragrance will now move into preparation.",

      order,

      frontendUrl,
    });
  },

  orderStatusChanged(
    order:
      OrderEmailData,

    frontendUrl:
      string
  ) {
    const copy =
      statusCopy(
        order.orderStatus
      );

    return customerOrderTemplate({
      eyebrow:
        copy.eyebrow,

      title:
        copy.title,

      intro:
        copy.message,

      order,

      frontendUrl,
    });
  },

  adminNewOrder(
    order:
      OrderEmailData,

    adminUrl:
      string
  ) {
    return adminOrderTemplate({
      eyebrow:
        "New order",

      title:
        `${order.orderNumber} needs attention.`,

      intro:
        `${order.firstName} ${order.lastName} placed a ${order.paymentMethod === "PAYFAST" ? "PayFast" : "cash-on-delivery"} order.`,

      order,

      adminUrl,
    });
  },

  adminPaymentConfirmed(
    order:
      OrderEmailData,

    adminUrl:
      string
  ) {
    return adminOrderTemplate({
      eyebrow:
        "Payment",

      title:
        `Payment confirmed for ${order.orderNumber}.`,

      intro:
        "The order can now continue through fulfilment.",

      order,

      adminUrl,
    });
  },

  adminImportantStatus(
    order:
      OrderEmailData,

    adminUrl:
      string
  ) {
    const copy =
      statusCopy(
        order.orderStatus
      );

    return adminOrderTemplate({
      eyebrow:
        "Order update",

      title:
        `${order.orderNumber}: ${copy.adminTitle}`,

      intro:
        copy.message,

      order,

      adminUrl,
    });
  },
};

/* =========================================================
   CUSTOMER TEMPLATE
========================================================= */

function customerOrderTemplate(
  input: {
    eyebrow:
      string;

    title:
      string;

    intro:
      string;

    order:
      OrderEmailData;

    frontendUrl:
      string;
  }
) {
  const {
    order,
  } =
    input;

  const href =
    `${trimTrailingSlash(
      input.frontendUrl
    )}/account/orders/${encodeURIComponent(
      order.orderId
    )}`;

  const text = [
    "ÉLAN PARFUMS",
    "",
    input.title,
    "",
    `Hi ${order.firstName},`,
    input.intro,
    "",
    `Order: ${order.orderNumber}`,
    `Total: ${money.format(order.total)}`,
    `Order status: ${formatEnum(order.orderStatus)}`,
    `Payment status: ${formatEnum(order.paymentStatus)}`,
    `Delivery: ${formatEnum(order.deliveryMethod)}`,
    "",
    `View order: ${href}`,
  ].join(
    "\n"
  );

  return {
    subject:
      `${input.title} · ${order.orderNumber}`,

    text,

    html:
      emailShell({
        eyebrow:
          input.eyebrow,

        title:
          input.title,

        body:
          `
            <p style="margin:0 0 22px;color:#74645e;font-size:14px;line-height:1.7;">
              Hi ${escapeHtml(order.firstName)},
            </p>

            <p style="margin:0 0 28px;color:#74645e;font-size:14px;line-height:1.7;">
              ${escapeHtml(input.intro)}
            </p>

            ${orderDetails(order)}

            <div style="margin-top:30px;">
              <a
                href="${escapeAttribute(href)}"
                style="display:inline-block;background:#541627;color:#ffffff;text-decoration:none;padding:14px 22px;font-size:12px;letter-spacing:.03em;"
              >
                View your order
              </a>
            </div>
          `,
      }),
  };
}

/* =========================================================
   ADMIN TEMPLATE
========================================================= */

function adminOrderTemplate(
  input: {
    eyebrow:
      string;

    title:
      string;

    intro:
      string;

    order:
      OrderEmailData;

    adminUrl:
      string;
  }
) {
  const {
    order,
  } =
    input;

  const href =
    `${trimTrailingSlash(
      input.adminUrl
    )}/admin/orders/${encodeURIComponent(
      order.orderId
    )}`;

  const text = [
    "ÉLAN PARFUMS — BACK OFFICE",
    "",
    input.title,
    "",
    input.intro,
    "",
    `Customer: ${order.firstName} ${order.lastName}`,
    `Email: ${order.email}`,
    `Order: ${order.orderNumber}`,
    `Total: ${money.format(order.total)}`,
    `Order status: ${formatEnum(order.orderStatus)}`,
    `Payment status: ${formatEnum(order.paymentStatus)}`,
    "",
    `Open order: ${href}`,
  ].join(
    "\n"
  );

  return {
    subject:
      `[ÉLAN Admin] ${input.title}`,

    text,

    html:
      emailShell({
        eyebrow:
          input.eyebrow,

        title:
          input.title,

        dark:
          true,

        body:
          `
            <p style="margin:0 0 24px;color:#d8c9c3;font-size:14px;line-height:1.7;">
              ${escapeHtml(input.intro)}
            </p>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              ${infoRow("Customer", `${order.firstName} ${order.lastName}`, true)}
              ${infoRow("Email", order.email, true)}
              ${infoRow("Order", order.orderNumber, true)}
              ${infoRow("Total", money.format(order.total), true)}
              ${infoRow("Order status", formatEnum(order.orderStatus), true)}
              ${infoRow("Payment", formatEnum(order.paymentStatus), true)}
            </table>

            <div style="margin-top:30px;">
              <a
                href="${escapeAttribute(href)}"
                style="display:inline-block;background:#f8eee7;color:#35101c;text-decoration:none;padding:14px 22px;font-size:12px;letter-spacing:.03em;"
              >
                Open in back office
              </a>
            </div>
          `,
      }),
  };
}

/* =========================================================
   SHARED HTML
========================================================= */

function orderDetails(
  order:
    OrderEmailData
) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #e7ded8;">
      ${infoRow("Order", order.orderNumber)}
      ${infoRow("Placed", formatEmailDate(order.createdAt))}
      ${infoRow("Total", money.format(order.total))}
      ${infoRow("Payment", formatEnum(order.paymentStatus))}
      ${infoRow("Status", formatEnum(order.orderStatus))}
      ${infoRow("Delivery", formatEnum(order.deliveryMethod))}
      ${
        order.trackingNumber
          ? infoRow(
              "Tracking",
              order.trackingNumber
            )
          : ""
      }
      ${
        order.paxiPointName
          ? infoRow(
              "PAXI point",
              order.paxiPointName
            )
          : ""
      }
    </table>
  `;
}

function infoRow(
  label:
    string,

  value:
    string,

  dark =
    false
) {
  const border =
    dark
      ? "#5d3440"
      : "#e7ded8";

  const labelColor =
    dark
      ? "#c6aaa9"
      : "#9c8880";

  const valueColor =
    dark
      ? "#f8eee7"
      : "#45332f";

  return `
    <tr>
      <td style="padding:13px 0;border-bottom:1px solid ${border};font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${labelColor};">
        ${escapeHtml(label)}
      </td>

      <td align="right" style="padding:13px 0;border-bottom:1px solid ${border};font-size:12px;color:${valueColor};">
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
}

function emailShell(
  input: {
    eyebrow:
      string;

    title:
      string;

    body:
      string;

    dark?:
      boolean;
  }
) {
  const dark =
    input.dark ??
    false;

  const background =
    dark
      ? "#35101c"
      : "#fbfaf7";

  const titleColor =
    dark
      ? "#f8eee7"
      : "#342725";

  const eyebrowColor =
    dark
      ? "#d5afb5"
      : "#9a756c";

  return `
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#efeae5;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#efeae5;padding:28px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:${background};">
                <tr>
                  <td style="padding:34px 38px;border-bottom:1px solid ${dark ? "#5d3440" : "#e3dad4"};">
                    <div style="font-family:Georgia,'Times New Roman',serif;font-size:25px;letter-spacing:.12em;color:${titleColor};">
                      ÉLAN PARFUMS
                    </div>

                    <div style="margin-top:7px;font-size:9px;letter-spacing:.24em;color:${eyebrowColor};text-transform:uppercase;">
                      SCENTS WORTH REMEMBERING
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:38px;">
                    <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${eyebrowColor};">
                      ${escapeHtml(input.eyebrow)}
                    </div>

                    <h1 style="margin:12px 0 26px;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.05;font-weight:400;color:${titleColor};">
                      ${escapeHtml(input.title)}
                    </h1>

                    ${input.body}
                  </td>
                </tr>

                <tr>
                  <td style="padding:24px 38px;border-top:1px solid ${dark ? "#5d3440" : "#e3dad4"};font-size:10px;line-height:1.6;color:${dark ? "#b8939b" : "#9a8982"};">
                    ÉLAN Parfums · South Africa<br/>
                    This is a transactional email about your order.
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
        eyebrow:
          "Order confirmed",

        title:
          "We’re preparing your fragrance.",

        adminTitle:
          "Processing",

        message:
          "Your order is now being prepared.",
      };

    case "PACKING":
      return {
        eyebrow:
          "Packing",

        title:
          "Your order is being packed.",

        adminTitle:
          "Packing",

        message:
          "Your fragrances are being carefully packed for dispatch.",
      };

    case "READY_FOR_SHIPMENT":
      return {
        eyebrow:
          "Ready to leave",

        title:
          "Ready for shipment.",

        adminTitle:
          "Ready for shipment",

        message:
          "Your order is packed and ready to leave ÉLAN.",
      };

    case "SHIPPED":
      return {
        eyebrow:
          "On the way",

        title:
          "Your fragrance is on its way.",

        adminTitle:
          "Shipped",

        message:
          "Your order has been handed to the delivery partner.",
      };

    case "DELIVERED":
      return {
        eyebrow:
          "Delivered",

        title:
          "Your order has arrived.",

        adminTitle:
          "Delivered",

        message:
          "Your ÉLAN order has been marked as delivered.",
      };

    case "CANCELLED":
      return {
        eyebrow:
          "Order update",

        title:
          "Your order was cancelled.",

        adminTitle:
          "Cancelled",

        message:
          "Your order has been cancelled.",
      };

    case "RETURN_REQUESTED":
      return {
        eyebrow:
          "Return",

        title:
          "We received your return request.",

        adminTitle:
          "Return requested",

        message:
          "Your return request has been received and is awaiting review.",
      };

    case "RETURNED":
      return {
        eyebrow:
          "Return",

        title:
          "Your return has been received.",

        adminTitle:
          "Returned",

        message:
          "Your returned order has been received.",
      };

    case "REFUNDED":
      return {
        eyebrow:
          "Refund",

        title:
          "Your refund has been processed.",

        adminTitle:
          "Refunded",

        message:
          "Your order has been marked as refunded.",
      };

    default:
      return {
        eyebrow:
          "Order update",

        title:
          "There’s an update on your order.",

        adminTitle:
          formatEnum(
            status
          ),

        message:
          "There is a new update on your order.",
      };
  }
}

/* =========================================================
   HELPERS
========================================================= */

function formatEnum(
  value:
    string
) {
  return value
    .replaceAll(
      "_",
      " "
    )
    .toLowerCase()
    .replace(
      /\b\w/g,
      (
        letter
      ) =>
        letter.toUpperCase()
    );
}

function formatEmailDate(
  value:
    string
) {
  const parsed =
    new Date(
      value
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return value;
  }

  return date.format(
    parsed
  );
}

function trimTrailingSlash(
  value:
    string
) {
  return value.replace(
    /\/+$/,
    ""
  );
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

function escapeAttribute(
  value:
    string
) {
  return escapeHtml(
    value
  );
}
