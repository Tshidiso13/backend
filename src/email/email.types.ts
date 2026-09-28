export type EmailRecipient = {
  email:
    string;

  name?:
    string;
};

export type EmailMessage = {
  to:
    EmailRecipient;

  subject:
    string;

  html:
    string;

  text:
    string;

  replyTo?:
    string;
};

export type OrderEmailData = {
  orderId:
    string;

  orderNumber:
    string;

  firstName:
    string;

  lastName:
    string;

  email:
    string;

  paymentMethod:
    string;

  paymentStatus:
    string;

  orderStatus:
    string;

  deliveryMethod:
    string;

  total:
    number;

  currency:
    string;

  /*
   * Inngest step.run() serializes Date objects to ISO strings.
   * Keep event/step data JSON-safe so the type remains stable
   * before and after an Inngest step boundary.
   */
  createdAt:
    string;

  paidAt?:
    string |
    null;

  shippedAt?:
    string |
    null;

  deliveredAt?:
    string |
    null;

  trackingNumber?:
    string |
    null;

  trackingUrl?:
    string |
    null;

  paxiPointName?:
    string |
    null;
};
