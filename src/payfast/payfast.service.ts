import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";

import {
  ConfigService,
} from "@nestjs/config";

import {
  Prisma,
} from "../generated/prisma/client";

import {
  createHash,
} from "node:crypto";

import {
  lookup,
} from "node:dns/promises";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  inngest,
} from "../inngest/client";

import {
  ORDER_PAID_EVENT,
} from "../inngest/checkout.functions";

/* =========================================================
   TYPES
========================================================= */

export type CreatePayfastPaymentInput = {
  orderId: string;
  orderNumber: string;

  firstName: string;
  lastName: string;

  email: string;
  phone: string;

  amount: number;
};

type PayfastPayload =
  Record<
    string,
    string
  >;

/* =========================================================
   SERVICE
========================================================= */

@Injectable()
export class PayfastService {
  private readonly logger =
    new Logger(
      PayfastService.name
    );

  constructor(
    private readonly config:
      ConfigService,

    private readonly prisma:
      PrismaService
  ) {}

  /* =======================================================
     CONFIGURATION
  ======================================================== */

  assertConfigured() {
    this.config.getOrThrow<string>(
      "PAYFAST_MERCHANT_ID"
    );

    this.config.getOrThrow<string>(
      "PAYFAST_MERCHANT_KEY"
    );

    this.config.getOrThrow<string>(
      "FRONTEND_URL"
    );

    this.config.getOrThrow<string>(
      "BACKEND_PUBLIC_URL"
    );
  }

  isSandbox() {
    return (
      (
        this.config.get<string>(
          "PAYFAST_MODE"
        ) ??
        "sandbox"
      )
        .trim()
        .toLowerCase() !==
      "live"
    );
  }

  private paymentUrl() {
    return this.isSandbox()
      ? "https://sandbox.payfast.co.za/eng/process"
      : "https://www.payfast.co.za/eng/process";
  }

  private validationUrl() {
    return this.isSandbox()
      ? "https://sandbox.payfast.co.za/eng/query/validate"
      : "https://www.payfast.co.za/eng/query/validate";
  }

  /* =======================================================
     CREATE PAYFAST FORM
  ======================================================== */

  createPaymentForm(
    input:
      CreatePayfastPaymentInput
  ) {
    this.assertConfigured();

    const merchantId =
      this.config.getOrThrow<string>(
        "PAYFAST_MERCHANT_ID"
      );

    const merchantKey =
      this.config.getOrThrow<string>(
        "PAYFAST_MERCHANT_KEY"
      );

    const frontendUrl =
      this.firstFrontendUrl();

    const backendUrl =
      this.config
        .getOrThrow<string>(
          "BACKEND_PUBLIC_URL"
        )
        .trim()
        .replace(
          /\/+$/,
          ""
        );

    /*
     * Keep the field insertion order stable.
     *
     * The same ordering is used when generating the
     * PayFast signature.
     */
    const fields:
      PayfastPayload =
      {
        merchant_id:
          merchantId,

        merchant_key:
          merchantKey,

        return_url:
          `${frontendUrl}/checkout/success?order=${encodeURIComponent(
            input.orderNumber
          )}&method=payfast`,

        cancel_url:
          `${frontendUrl}/checkout?payment=cancelled&order=${encodeURIComponent(
            input.orderNumber
          )}`,

        notify_url:
          `${backendUrl}/api/payfast/notify`,

        name_first:
          input.firstName,

        name_last:
          input.lastName,

        email_address:
          input.email,

        cell_number:
          input.phone,

        m_payment_id:
          input.orderNumber,

        amount:
          this.money(
            input.amount
          ).toFixed(
            2
          ),

        item_name:
          `ÉLAN order ${input.orderNumber}`,

        item_description:
          "ÉLAN Parfums order",
      };

    fields.signature =
      this.generateSignature(
        fields
      );

    return {
      action:
        this.paymentUrl(),

      method:
        "POST" as const,

      fields,
    };
  }

  /* =======================================================
     PAYFAST ITN
  ======================================================== */

  async processItn(
    payload:
      PayfastPayload,

    requestIp:
      | string
      | undefined
  ) {
    this.assertConfigured();

    if (
      !payload ||
      Object.keys(
        payload
      ).length ===
        0
    ) {
      throw new BadRequestException(
        "Empty PayFast notification."
      );
    }

    /* -------------------------------------------------------
       1. SIGNATURE
    -------------------------------------------------------- */

    if (
      !this.validSignature(
        payload
      )
    ) {
      throw new UnauthorizedException(
        "Invalid PayFast signature."
      );
    }

    /* -------------------------------------------------------
       2. MERCHANT
    -------------------------------------------------------- */

    const merchantId =
      this.config.getOrThrow<string>(
        "PAYFAST_MERCHANT_ID"
      );

    if (
      payload.merchant_id !==
      merchantId
    ) {
      throw new UnauthorizedException(
        "Invalid PayFast merchant."
      );
    }

    /* -------------------------------------------------------
       3. SOURCE IP
    -------------------------------------------------------- */

    if (
      this.shouldVerifySourceIp()
    ) {
      const validSource =
        await this.isValidSourceIp(
          requestIp
        );

      if (
        !validSource
      ) {
        throw new UnauthorizedException(
          "PayFast notification source could not be verified."
        );
      }
    }

    /* -------------------------------------------------------
       4. SERVER-TO-SERVER VALIDATION
    -------------------------------------------------------- */

    const validRemote =
      await this.validateWithPayfast(
        payload
      );

    if (
      !validRemote
    ) {
      throw new UnauthorizedException(
        "PayFast rejected the notification."
      );
    }

    /* -------------------------------------------------------
       5. ORDER
    -------------------------------------------------------- */

    const orderNumber =
      payload.m_payment_id
        ?.trim();

    if (
      !orderNumber
    ) {
      throw new BadRequestException(
        "Missing PayFast order reference."
      );
    }

    const order =
      await this.prisma.order.findUnique(
        {
          where: {
            orderNumber,
          },

          include: {
            payment:
              true,
          },
        }
      );

    if (
      !order ||
      !order.payment
    ) {
      throw new BadRequestException(
        "PayFast order could not be found."
      );
    }

    /* -------------------------------------------------------
       6. PAYMENT REFERENCE
    -------------------------------------------------------- */

    if (
      order.payment.merchantPaymentId !==
      orderNumber
    ) {
      throw new BadRequestException(
        "PayFast payment reference does not match the order."
      );
    }

    /* -------------------------------------------------------
       7. AMOUNT
    -------------------------------------------------------- */

    const receivedAmount =
      Number(
        payload.amount_gross
      );

    const expectedAmount =
      Number(
        order.total
      );

    if (
      !Number.isFinite(
        receivedAmount
      ) ||
      Math.abs(
        receivedAmount -
          expectedAmount
      ) >
        0.01
    ) {
      throw new BadRequestException(
        "PayFast amount does not match the order total."
      );
    }

    /* -------------------------------------------------------
       8. STATUS
    -------------------------------------------------------- */

    const paymentStatus =
      payload.payment_status
        ?.trim()
        .toUpperCase();

    if (
      paymentStatus ===
      "COMPLETE"
    ) {
      return this.completePayment(
        order.id,
        payload
      );
    }

    if (
      paymentStatus ===
        "FAILED" ||
      paymentStatus ===
        "CANCELLED"
    ) {
      return this.failPayment(
        order.id,
        payload,
        paymentStatus
      );
    }

    this.logger.warn(
      `Unhandled PayFast status "${paymentStatus ?? "UNKNOWN"}" for order ${orderNumber}.`
    );

    return {
      ok:
        true,

      status:
        paymentStatus ??
        "UNKNOWN",

      orderNumber,
    };
  }

  /* =======================================================
     COMPLETE PAYMENT
  ======================================================== */

  private async completePayment(
    orderId:
      string,

    payload:
      PayfastPayload
  ) {
    const now =
      new Date();

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const order =
            await tx.order.findUnique(
              {
                where: {
                  id:
                    orderId,
                },

                include: {
                  payment:
                    true,

                  reservations: {
                    where: {
                      status:
                        "ACTIVE",
                    },
                  },
                },
              }
            );

          if (
            !order ||
            !order.payment
          ) {
            throw new BadRequestException(
              "Payment order no longer exists."
            );
          }

          /*
           * PayFast may send the same ITN more than once.
           *
           * If we already completed it, return successfully
           * without touching stock a second time.
           */
          if (
            order.payment.status ===
              "COMPLETE" ||
            order.paymentStatus ===
              "COMPLETE"
          ) {
            return {
              alreadyComplete:
                true,

              order,
            };
          }

          /* -------------------------------------------------
             CONSUME RESERVED INVENTORY
          -------------------------------------------------- */

          for (
            const reservation
            of order.reservations
          ) {
            /*
             * The reservation was already included in
             * reservedStock during checkout.
             *
             * Payment confirmation converts:
             *
             * stock -= quantity
             * reservedStock -= quantity
             */
            const changed =
              await tx.$executeRaw(
                Prisma.sql`
                  UPDATE "ProductVariant"
                  SET
                    "stock" =
                      "stock" - ${reservation.quantity},
                    "reservedStock" = GREATEST(
                      0,
                      "reservedStock" - ${reservation.quantity}
                    )
                  WHERE "id" = ${reservation.variantId}
                    AND "stock" >= ${reservation.quantity}
                `
              );

            if (
              changed !==
              1
            ) {
              throw new BadRequestException(
                "Reserved inventory could not be committed."
              );
            }
          }

          await tx.inventoryReservation.updateMany(
            {
              where: {
                orderId:
                  order.id,

                status:
                  "ACTIVE",
              },

              data: {
                status:
                  "CONSUMED",
              },
            }
          );

          /* -------------------------------------------------
             PAYMENT
          -------------------------------------------------- */

          const providerPaymentId =
            payload.pf_payment_id
              ?.trim() ||
            null;

          if (
            providerPaymentId
          ) {
            const duplicate =
              await tx.payment.findFirst(
                {
                  where: {
                    providerPaymentId,

                    NOT: {
                      id:
                        order.payment.id,
                    },
                  },

                  select: {
                    id:
                      true,
                  },
                }
              );

            if (
              duplicate
            ) {
              throw new BadRequestException(
                "This PayFast transaction has already been used."
              );
            }
          }

          await tx.payment.update(
            {
              where: {
                id:
                  order.payment.id,
              },

              data: {
                status:
                  "COMPLETE",

                providerPaymentId,

                completedAt:
                  now,

                rawResponse:
                  payload as Prisma.InputJsonValue,
              },
            }
          );

          /* -------------------------------------------------
             ORDER
          -------------------------------------------------- */

          const updatedOrder =
            await tx.order.update(
              {
                where: {
                  id:
                    order.id,
                },

                data: {
                  paymentStatus:
                    "COMPLETE",

                  orderStatus:
                    "PROCESSING",

                  paidAt:
                    now,

                  reservationExpiresAt:
                    null,
                },
              }
            );

          /* -------------------------------------------------
             AUTHENTICATED CUSTOMER CART
          -------------------------------------------------- */

          if (
            order.userId
          ) {
            await tx.cartItem.deleteMany(
              {
                where: {
                  userId:
                    order.userId,
                },
              }
            );
          }

          return {
            alreadyComplete:
              false,

            order:
              updatedOrder,
          };
        }
      );

    /* -------------------------------------------------------
       BACKGROUND WORK
    -------------------------------------------------------- */

    if (
      !result.alreadyComplete
    ) {
      try {
        await inngest.send({
          name:
            ORDER_PAID_EVENT,

          data: {
            orderId:
              result.order.id,

            orderNumber:
              result.order.orderNumber,

            paidAt:
              now.toISOString(),
          },
        });
      } catch (
        error
      ) {
        /*
         * Never roll back a verified successful payment
         * merely because background processing is down.
         */
        this.logger.warn(
          `Order ${result.order.orderNumber} was paid, but the Inngest order-paid event failed.`,
          error instanceof
            Error
            ? error.stack
            : undefined
        );
      }
    }

    return {
      ok:
        true,

      status:
        "COMPLETE",

      alreadyComplete:
        result.alreadyComplete,

      orderNumber:
        result.order.orderNumber,
    };
  }

  /* =======================================================
     FAILED / CANCELLED PAYMENT
  ======================================================== */

  private async failPayment(
    orderId:
      string,

    payload:
      PayfastPayload,

    payfastStatus:
      "FAILED"
      | "CANCELLED"
  ) {
    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const order =
            await tx.order.findUnique(
              {
                where: {
                  id:
                    orderId,
                },

                include: {
                  payment:
                    true,

                  reservations: {
                    where: {
                      status:
                        "ACTIVE",
                    },
                  },
                },
              }
            );

          if (
            !order ||
            !order.payment
          ) {
            throw new BadRequestException(
              "Payment order no longer exists."
            );
          }

          /*
           * Never downgrade a payment that was already
           * successfully completed.
           */
          if (
            order.paymentStatus ===
              "COMPLETE" ||
            order.payment.status ===
              "COMPLETE"
          ) {
            return {
              ignored:
                true,

              order,
            };
          }

          /* -------------------------------------------------
             RELEASE STOCK RESERVATIONS
          -------------------------------------------------- */

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

          await tx.inventoryReservation.updateMany(
            {
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
            }
          );

          /* -------------------------------------------------
             PAYMENT + ORDER
          -------------------------------------------------- */

          const nextPaymentStatus =
            payfastStatus ===
            "CANCELLED"
              ? "CANCELLED"
              : "FAILED";

          await tx.payment.update(
            {
              where: {
                id:
                  order.payment.id,
              },

              data: {
                status:
                  nextPaymentStatus,

                providerPaymentId:
                  payload.pf_payment_id
                    ?.trim() ||
                  order.payment.providerPaymentId,

                rawResponse:
                  payload as Prisma.InputJsonValue,
              },
            }
          );

          const updatedOrder =
            await tx.order.update(
              {
                where: {
                  id:
                    order.id,
                },

                data: {
                  paymentStatus:
                    nextPaymentStatus,

                  orderStatus:
                    "CANCELLED",

                  reservationExpiresAt:
                    null,
                },
              }
            );

          return {
            ignored:
              false,

            order:
              updatedOrder,
          };
        }
      );

    return {
      ok:
        true,

      status:
        result.ignored
          ? "COMPLETE"
          : payfastStatus,

      ignored:
        result.ignored,

      orderNumber:
        result.order.orderNumber,
    };
  }

  /* =======================================================
     SIGNATURE
  ======================================================== */

  private generateSignature(
    fields:
      PayfastPayload
  ) {
    /*
     * PayFast's passphrase is OPTIONAL for ordinary once-off
     * custom checkout payments.
     *
     * IMPORTANT:
     * If PAYFAST_PASSPHRASE is present here, it must be
     * exactly the same value configured on the SAME PayFast
     * sandbox/live merchant account. Otherwise PayFast will
     * reject the payment with a signature mismatch.
     */
    const configuredPassphrase =
      this.config.get<string>(
        "PAYFAST_PASSPHRASE"
      );

    const passphrase =
      configuredPassphrase
        ?.trim() ||
      null;

    /*
     * Outgoing form fields do not contain "signature" yet.
     * Incoming ITN fields do.
     *
     * For outgoing fields PayFast's reference implementation
     * trims values before URL encoding.
     *
     * For incoming ITNs we preserve the posted field values.
     */
    const isIncomingItn =
      Object.prototype.hasOwnProperty.call(
        fields,
        "signature"
      );

    const parameterString =
      this.parameterString(
        fields,
        !isIncomingItn,
        isIncomingItn
      );

    const stringToHash =
      passphrase
        ? `${parameterString}&passphrase=${this.payfastEncode(
            passphrase
          )}`
        : parameterString;

    return createHash(
      "md5"
    )
      .update(
        stringToHash
      )
      .digest(
        "hex"
      );
  }

  private validSignature(
    payload:
      PayfastPayload
  ) {
    const received =
      payload.signature
        ?.trim()
        .toLowerCase();

    if (
      !received
    ) {
      return false;
    }

    const expected =
      this.generateSignature(
        payload
      )
        .trim()
        .toLowerCase();

    const valid =
      received ===
      expected;

    if (
      !valid
    ) {
      /*
       * Safe diagnostic:
       * - does not log the passphrase
       * - does not log the merchant key
       * - does not log customer values
       *
       * PayFast ITNs contain several blank custom fields.
       * Those blank fields MUST remain part of the ITN
       * parameter string used for signature verification.
       */
      this.logger.warn(
        `PayFast ITN signature mismatch. Received fields: ${Object.keys(
          payload
        ).join(", ")}`
      );
    }

    return valid;
  }

  /* =======================================================
     REMOTE VALIDATION
  ======================================================== */

  private async validateWithPayfast(
    payload:
      PayfastPayload
  ) {
    /*
     * PayFast expects the original posted values excluding
     * the signature.
     */
    const body =
      this.parameterString(
        payload,
        false,
        true
      );

    let response:
      Response;

    try {
      response =
        await fetch(
          this.validationUrl(),
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",
            },

            body,
          }
        );
    } catch (
      error
    ) {
      this.logger.error(
        "Unable to validate PayFast notification with PayFast.",
        error instanceof
          Error
          ? error.stack
          : undefined
      );

      return false;
    }

    if (
      !response.ok
    ) {
      this.logger.warn(
        `PayFast validation endpoint returned ${response.status}.`
      );

      return false;
    }

    const result =
      (
        await response.text()
      )
        .trim()
        .toUpperCase();

    return (
      result ===
      "VALID"
    );
  }

  /* =======================================================
     SOURCE IP
  ======================================================== */

  private shouldVerifySourceIp() {
    const configured =
      this.config.get<string>(
        "PAYFAST_VERIFY_SOURCE_IP"
      );

    if (
      configured !==
      undefined
    ) {
      return (
        configured
          .trim()
          .toLowerCase() ===
        "true"
      );
    }

    /*
     * Default:
     *
     * production -> verify
     * development -> do not block local tunnel testing
     */
    return (
      (
        this.config.get<string>(
          "NODE_ENV"
        ) ??
        "development"
      )
        .trim()
        .toLowerCase() ===
      "production"
    );
  }

  private async isValidSourceIp(
    rawIp:
      | string
      | undefined
  ) {
    if (
      !rawIp
    ) {
      return false;
    }

    const requestIp =
      this.normalizeIp(
        rawIp
      );

    const hosts =
      this.isSandbox()
        ? [
            "sandbox.payfast.co.za",
          ]
        : [
            "www.payfast.co.za",
            "w1w.payfast.co.za",
            "w2w.payfast.co.za",
          ];

    const allowedIps =
      new Set<string>();

    for (
      const host
      of hosts
    ) {
      try {
        const addresses =
          await lookup(
            host,
            {
              all:
                true,
            }
          );

        for (
          const address
          of addresses
        ) {
          allowedIps.add(
            this.normalizeIp(
              address.address
            )
          );
        }
      } catch (
        error
      ) {
        this.logger.warn(
          `Unable to resolve PayFast host ${host}.`,
          error instanceof
            Error
            ? error.message
            : undefined
        );
      }
    }

    return allowedIps.has(
      requestIp
    );
  }

  private normalizeIp(
    value:
      string
  ) {
    let ip =
      value
        .trim()
        .replace(
          /^::ffff:/,
          ""
        );

    /*
     * Handle values such as ::1 or [IPv6].
     */
    if (
      ip.startsWith(
        "["
      ) &&
      ip.endsWith(
        "]"
      )
    ) {
      ip =
        ip.slice(
          1,
          -1
        );
    }

    return ip;
  }

  /* =======================================================
     PARAMETER STRING
  ======================================================== */

  private parameterString(
    fields:
      PayfastPayload,

    trimValues:
      boolean,

    includeEmptyValues =
      false
  ) {
    const parameters:
      string[] =
      [];

    for (
      const [
        key,
        rawValue,
      ]
      of Object.entries(
        fields
      )
    ) {
      /*
       * Never include PayFast's supplied signature itself
       * when rebuilding the parameter string.
       *
       * Use `continue`, not `break`, so every other posted
       * field is retained even if a parser ever changes the
       * key position.
       */
      if (
        key ===
        "signature"
      ) {
        continue;
      }

      if (
        rawValue ===
          undefined ||
        rawValue ===
          null
      ) {
        continue;
      }

      const raw =
        String(
          rawValue
        );

      const value =
        trimValues
          ? raw.trim()
          : raw;

      /*
       * IMPORTANT:
       *
       * OUTGOING CUSTOM PAYMENT SIGNATURE
       * PayFast says blank variables are omitted.
       *
       * INCOMING ITN SIGNATURE
       * PayFast posts many blank fields such as custom_str1,
       * custom_int1, etc. Their ITN example includes every
       * posted field except `signature`, including blanks.
       *
       * Omitting those blank ITN fields changes the MD5 hash
       * and causes every real PayFast callback to return 401.
       */
      if (
        !includeEmptyValues &&
        value ===
          ""
      ) {
        continue;
      }

      parameters.push(
        `${key}=${this.payfastEncode(
          value
        )}`
      );
    }

    return parameters.join(
      "&"
    );
  }

  /* =======================================================
     PAYFAST URL ENCODING
  ======================================================== */

  private payfastEncode(
    value:
      string
  ) {
    /*
     * Make encodeURIComponent closer to PHP urlencode(),
     * which PayFast's signature examples are based on:
     *
     * spaces -> +
     * encode ! ' ( ) * ~
     */
    return encodeURIComponent(
      value
    )
      .replace(
        /[!'()*~]/g,
        (
          character
        ) =>
          `%${character
            .charCodeAt(
              0
            )
            .toString(
              16
            )
            .toUpperCase()}`
      )
      .replace(
        /%20/g,
        "+"
      );
  }

  /* =======================================================
     SAFE SIGNATURE DIAGNOSTIC
  ======================================================== */

  /**
   * Useful while debugging sandbox signature mismatches.
   *
   * This intentionally does NOT return the merchant key or
   * PayFast passphrase.
   */
  signatureDebug(
    fields:
      PayfastPayload
  ) {
    const copy: PayfastPayload =
      {
        ...fields,
      };

    delete copy.signature;

    const passphrase =
      this.config
        .get<string>(
          "PAYFAST_PASSPHRASE"
        )
        ?.trim() ||
      null;

    return {
      mode:
        this.isSandbox()
          ? "sandbox"
          : "live",

      merchantId:
        copy.merchant_id ??
        null,

      hasMerchantKey:
        Boolean(
          copy.merchant_key
        ),

      hasPassphrase:
        Boolean(
          passphrase
        ),

      fieldOrder:
        Object.keys(
          copy
        ),

      signature:
        this.generateSignature(
          copy
        ),
    };
  }

  /* =======================================================
     HELPERS
  ======================================================== */

  private firstFrontendUrl() {
    return this.config
      .getOrThrow<string>(
        "FRONTEND_URL"
      )
      .split(
        ","
      )[0]
      .trim()
      .replace(
        /\/+$/,
        ""
      );
  }

  private money(
    value:
      number
  ) {
    return (
      Math.round(
        (
          value +
          Number.EPSILON
        ) *
          100
      ) /
      100
    );
  }
}
