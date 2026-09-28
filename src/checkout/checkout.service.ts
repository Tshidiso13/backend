import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from "@nestjs/common";

import {
  ConfigService,
} from "@nestjs/config";

import {
  Prisma,
} from "../generated/prisma/client";

import {
  randomBytes,
} from "node:crypto";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  PayfastService,
} from "../payfast/payfast.service";

import {
  inngest,
} from "../inngest/client";

import {
  CHECKOUT_CREATED_EVENT,
  COD_ORDER_PLACED_EVENT,
} from "../inngest/checkout.functions";

import {
  CheckoutLineDto,
  CheckoutPreviewDto,
  CreateCheckoutDto,
  DeliveryMethodInput,
} from "./dto/checkout.dto";

/* =========================================================
   INTERNAL TYPES
========================================================= */

type QuoteItem = {
  productId: string;
  variantId: string;

  slug: string;
  name: string;

  family: string;
  concentration: string;

  size: string;
  sku: string;

  imageUrl: string | null;

  price: number;
  quantity: number;
  lineTotal: number;

  availableStock: number;
};

type CheckoutQuote = {
  items: QuoteItem[];

  subtotal: number;
  shipping: number;
  total: number;

  currency: "ZAR";

  freeDeliveryThreshold: number;
  amountUntilFreeDelivery: number;
  freeDeliveryUnlocked: boolean;
};

/* =========================================================
   SERVICE
========================================================= */

@Injectable()
export class CheckoutService {
  private readonly logger =
    new Logger(
      CheckoutService.name
    );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly config:
      ConfigService,

    private readonly payfast:
      PayfastService
  ) {}

  /* =======================================================
     PUBLIC CHECKOUT OPTIONS
  ======================================================== */

  options() {
    return {
      currency:
        "ZAR" as const,

      guestCheckout:
        true,

      paymentMethods: [
        "PAYFAST",
        "CASH_ON_DELIVERY",
      ] as const,

      shipping: {
        ARAMEX:
          this.shippingRate(
            "ARAMEX"
          ),

        PAXI:
          this.shippingRate(
            "PAXI"
          ),
      },

      freeDeliveryThreshold:
        this.freeDeliveryThreshold(),
    };
  }

  /* =======================================================
     QUOTE / PREVIEW
  ======================================================== */

  async preview(
    dto: CheckoutPreviewDto
  ) {
    return this.buildQuote(
      dto.items,
      dto.deliveryMethod
    );
  }

  /* =======================================================
     CREATE CHECKOUT / ORDER
  ======================================================== */

  async create(
    dto: CreateCheckoutDto,
    authenticatedUserId:
      | string
      | null
  ) {
    if (
      dto.paymentMethod ===
      "PAYFAST"
    ) {
      this.payfast.assertConfigured();
    }

    /*
     * Never trust prices, totals, shipping or stock
     * from the frontend.
     *
     * The backend reconstructs the order from variant IDs.
     */
    const quote =
      await this.buildQuote(
        dto.items,
        dto.deliveryMethod
      );

    const orderNumber =
      this.createOrderNumber();

    const normalizedEmail =
      dto.email
        .trim()
        .toLowerCase();

    /*
     * IMPORTANT:
     *
     * Guest checkout:
     *   userId = null
     *   email  = checkout email
     *
     * Signed-in checkout:
     *   userId = authenticated user's ID
     *
     * We DO NOT attach guest checkout to an account merely
     * because an account exists with the same email.
     *
     * Historical guest orders should only be claimed after
     * email ownership is proven by email verification or a
     * verified Google identity.
     */
    const userId =
      authenticatedUserId ??
      null;

    const reservationExpiresAt =
      dto.paymentMethod ===
      "PAYFAST"
        ? new Date(
            Date.now() +
              this.reservationMinutes() *
                60_000
          )
        : null;

    const order =
      await this.prisma.$transaction(
        async (tx) => {
          /*
           * PAYFAST:
           * Reserve inventory while the customer leaves
           * the site to complete payment.
           *
           * CASH ON DELIVERY:
           * The order is immediately accepted, therefore
           * stock is deducted immediately.
           */
          for (
            const item
            of quote.items
          ) {
            const affected =
              dto.paymentMethod ===
              "PAYFAST"
                ? await tx.$executeRaw(
                    Prisma.sql`
                      UPDATE "ProductVariant"
                      SET "reservedStock" =
                        "reservedStock" + ${item.quantity}
                      WHERE "id" = ${item.variantId}
                        AND "active" = true
                        AND (
                          "stock" - "reservedStock"
                        ) >= ${item.quantity}
                    `
                  )
                : await tx.$executeRaw(
                    Prisma.sql`
                      UPDATE "ProductVariant"
                      SET "stock" =
                        "stock" - ${item.quantity}
                      WHERE "id" = ${item.variantId}
                        AND "active" = true
                        AND (
                          "stock" - "reservedStock"
                        ) >= ${item.quantity}
                    `
                  );

            if (
              affected !==
              1
            ) {
              throw new ConflictException(
                `${item.name} no longer has enough stock in ${item.size}. Please review your bag.`
              );
            }
          }

          const createdOrder =
            await tx.order.create(
              {
                data: {
                  orderNumber,

                  ...(userId
                    ? {
                        userId,
                      }
                    : {}),

                  /*
                   * Always retain the order email snapshot,
                   * even after a guest order is later linked
                   * to a User.
                   */
                  email:
                    normalizedEmail,

                  firstName:
                    dto.firstName.trim(),

                  lastName:
                    dto.lastName.trim(),

                  phone:
                    dto.phone.trim(),

                  addressLine1:
                    dto.address.trim(),

                  addressLine2:
                    dto.addressExtra
                      ?.trim() ||
                    null,

                  suburb:
                    dto.suburb.trim(),

                  city:
                    dto.city.trim(),

                  province:
                    dto.province.trim(),

                  postalCode:
                    dto.postalCode.trim(),

                  country:
                    "South Africa",

                  deliveryMethod:
                    dto.deliveryMethod,

                  paxiPointCode:
                    dto.paxiPointCode
                      ?.trim() ||
                    null,

                  paxiPointName:
                    dto.paxiPointName
                      ?.trim() ||
                    null,

                  paymentMethod:
                    dto.paymentMethod,

                  subtotal:
                    this.toDecimal(
                      quote.subtotal
                    ),

                  shipping:
                    this.toDecimal(
                      quote.shipping
                    ),

                  total:
                    this.toDecimal(
                      quote.total
                    ),

                  currency:
                    "ZAR",

                  orderStatus:
                    dto.paymentMethod ===
                    "PAYFAST"
                      ? "PENDING_PAYMENT"
                      : "PROCESSING",

                  paymentStatus:
                    "PENDING",

                  reservationExpiresAt,

                  items: {
                    create:
                      quote.items.map(
                        (
                          item
                        ) => ({
                          productId:
                            item.productId,

                          variantId:
                            item.variantId,

                          productName:
                            item.name,

                          family:
                            item.family,

                          concentration:
                            item.concentration,

                          sku:
                            item.sku,

                          size:
                            item.size,

                          imageUrl:
                            item.imageUrl,

                          quantity:
                            item.quantity,

                          unitPrice:
                            this.toDecimal(
                              item.price
                            ),

                          lineTotal:
                            this.toDecimal(
                              item.lineTotal
                            ),
                        })
                      ),
                  },
                },
              }
            );

          /* -----------------------------------------------
             PAYFAST PAYMENT + RESERVATIONS
          ------------------------------------------------ */

          if (
            dto.paymentMethod ===
              "PAYFAST" &&
            reservationExpiresAt
          ) {
            await tx.inventoryReservation.createMany(
              {
                data:
                  quote.items.map(
                    (
                      item
                    ) => ({
                      orderId:
                        createdOrder.id,

                      variantId:
                        item.variantId,

                      quantity:
                        item.quantity,

                      expiresAt:
                        reservationExpiresAt,

                      status:
                        "ACTIVE",
                    })
                  ),
              }
            );

            await tx.payment.create(
              {
                data: {
                  orderId:
                    createdOrder.id,

                  provider:
                    "PAYFAST",

                  merchantPaymentId:
                    createdOrder.orderNumber,

                  amount:
                    this.toDecimal(
                      quote.total
                    ),

                  currency:
                    "ZAR",

                  status:
                    "PENDING",
                },
              }
            );
          }

          /* -----------------------------------------------
             AUTHENTICATED COD CART CLEANUP
          ------------------------------------------------ */

          if (
            dto.paymentMethod ===
              "CASH_ON_DELIVERY" &&
            userId
          ) {
            await tx.cartItem.deleteMany(
              {
                where: {
                  userId,
                },
              }
            );
          }

          return createdOrder;
        }
      );

    /* =====================================================
       PAYFAST RESPONSE
    ===================================================== */

    if (
      dto.paymentMethod ===
      "PAYFAST" &&
      reservationExpiresAt
    ) {
      await this.emitEvent(
        CHECKOUT_CREATED_EVENT,
        {
          orderId:
            order.id,

          orderNumber:
            order.orderNumber,

          reservationExpiresAt:
            reservationExpiresAt.toISOString(),

          createdAt:
            order.createdAt.toISOString(),
        }
      );

      const paymentForm =
        this.payfast.createPaymentForm(
          {
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

            phone:
              order.phone,

            amount:
              quote.total,
          }
        );

      return {
        kind:
          "PAYFAST" as const,

        order: {
          id:
            order.id,

          orderNumber:
            order.orderNumber,

          orderStatus:
            order.orderStatus,

          paymentStatus:
            order.paymentStatus,
        },

        quote,

        payfast:
          paymentForm,
      };
    }

    /* =====================================================
       CASH ON DELIVERY RESPONSE
    ===================================================== */

    await this.emitEvent(
      COD_ORDER_PLACED_EVENT,
      {
        orderId:
          order.id,

        orderNumber:
          order.orderNumber,

        userId,

        guest:
          !userId,

        email:
          order.email,

        total:
          quote.total,

        placedAt:
          order.createdAt.toISOString(),
      }
    );

    return {
      kind:
        "COD" as const,

      order: {
        id:
          order.id,

        orderNumber:
          order.orderNumber,

        orderStatus:
          order.orderStatus,

        paymentStatus:
          order.paymentStatus,
      },

      quote,

      redirectUrl:
        `/checkout/success?order=${encodeURIComponent(
          order.orderNumber
        )}&method=cod`,
    };
  }

  /* =======================================================
     BUILD AUTHORITATIVE QUOTE
  ======================================================== */

  private async buildQuote(
    rawItems:
      CheckoutLineDto[],

    deliveryMethod:
      DeliveryMethodInput
  ): Promise<CheckoutQuote> {
    const requestedItems =
      this.normalizeLines(
        rawItems
      );

    if (
      requestedItems.length ===
      0
    ) {
      throw new BadRequestException(
        "Your bag is empty."
      );
    }

    const variants =
      await this.prisma.productVariant.findMany(
        {
          where: {
            id: {
              in:
                requestedItems.map(
                  (
                    item
                  ) =>
                    item.variantId
                ),
            },
          },

          include: {
            product: {
              include: {
                images: {
                  orderBy: {
                    position:
                      "asc",
                  },

                  take:
                    1,
                },
              },
            },
          },
        }
      );

    const variantsById =
      new Map(
        variants.map(
          (
            variant
          ) => [
            variant.id,
            variant,
          ]
        )
      );

    const quoteItems:
      QuoteItem[] =
      requestedItems.map(
        (
          requested
        ) => {
          const variant =
            variantsById.get(
              requested.variantId
            );

          if (
            !variant ||
            !variant.active ||
            variant.product.status !==
              "ACTIVE"
          ) {
            throw new BadRequestException(
              "One of the fragrances in your bag is no longer available."
            );
          }

          const availableStock =
            Math.max(
              0,
              variant.stock -
                variant.reservedStock
            );

          if (
            requested.quantity >
            availableStock
          ) {
            throw new ConflictException(
              `${variant.product.name} only has ${availableStock} available in ${variant.size}.`
            );
          }

          const price =
            Number(
              variant.price
            );

          if (
            !Number.isFinite(
              price
            )
          ) {
            throw new BadRequestException(
              `${variant.product.name} does not have a valid price.`
            );
          }

          return {
            productId:
              variant.product.id,

            variantId:
              variant.id,

            slug:
              variant.product.slug,

            name:
              variant.product.name,

            family:
              variant.product.family,

            concentration:
              variant.product.concentration,

            size:
              variant.size,

            sku:
              variant.sku,

            imageUrl:
              variant.product
                .images[0]
                ?.url ??
              null,

            price:
              this.money(
                price
              ),

            quantity:
              requested.quantity,

            lineTotal:
              this.money(
                price *
                  requested.quantity
              ),

            availableStock,
          };
        }
      );

    const subtotal =
      this.money(
        quoteItems.reduce(
          (
            total,
            item
          ) =>
            total +
            item.lineTotal,
          0
        )
      );

    const threshold =
      this.freeDeliveryThreshold();

    const freeDeliveryUnlocked =
      threshold >
        0 &&
      subtotal >=
        threshold;

    const shipping =
      freeDeliveryUnlocked
        ? 0
        : this.shippingRate(
            deliveryMethod
          );

    const total =
      this.money(
        subtotal +
          shipping
      );

    return {
      items:
        quoteItems,

      subtotal,

      shipping,

      total,

      currency:
        "ZAR",

      freeDeliveryThreshold:
        threshold,

      amountUntilFreeDelivery:
        threshold >
        0
          ? this.money(
              Math.max(
                0,
                threshold -
                  subtotal
              )
            )
          : 0,

      freeDeliveryUnlocked,
    };
  }

  /* =======================================================
     NORMALIZE CART LINES
  ======================================================== */

  private normalizeLines(
    rawItems:
      CheckoutLineDto[]
  ) {
    const merged =
      new Map<
        string,
        number
      >();

    for (
      const item
      of rawItems
    ) {
      const variantId =
        item.variantId
          .trim();

      if (
        !variantId
      ) {
        continue;
      }

      const quantity =
        Math.min(
          99,
          Math.max(
            1,
            Number(
              item.quantity
            ) ||
              1
          )
        );

      merged.set(
        variantId,
        Math.min(
          99,
          (
            merged.get(
              variantId
            ) ??
            0
          ) +
            quantity
        )
      );
    }

    return Array.from(
      merged.entries()
    ).map(
      ([
        variantId,
        quantity,
      ]) => ({
        variantId,
        quantity,
      })
    );
  }

  /* =======================================================
     SHIPPING
  ======================================================== */

  private shippingRate(
    method:
      DeliveryMethodInput
  ) {
    const envName =
      method ===
      "ARAMEX"
        ? "ARAMEX_FLAT_RATE"
        : "PAXI_FLAT_RATE";

    const fallback =
      method ===
      "ARAMEX"
        ? 99
        : 69;

    const configured =
      Number(
        this.config.get<string>(
          envName
        ) ??
          fallback
      );

    return this.money(
      Number.isFinite(
        configured
      )
        ? Math.max(
            0,
            configured
          )
        : fallback
    );
  }

  private freeDeliveryThreshold() {
    const configured =
      Number(
        this.config.get<string>(
          "FREE_DELIVERY_THRESHOLD"
        ) ??
          2500
      );

    return this.money(
      Number.isFinite(
        configured
      )
        ? Math.max(
            0,
            configured
          )
        : 2500
    );
  }

  /* =======================================================
     RESERVATION SETTINGS
  ======================================================== */

  private reservationMinutes() {
    const configured =
      Number(
        this.config.get<string>(
          "CHECKOUT_RESERVATION_MINUTES"
        ) ??
          15
      );

    if (
      !Number.isFinite(
        configured
      )
    ) {
      return 15;
    }

    return Math.min(
      60,
      Math.max(
        5,
        Math.floor(
          configured
        )
      )
    );
  }

  /* =======================================================
     ORDER NUMBER
  ======================================================== */

  private createOrderNumber() {
    const now =
      new Date();

    const date =
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

    return `ELN-${date}-${suffix}`;
  }

  /* =======================================================
     MONEY HELPERS
  ======================================================== */

  private toDecimal(
    value: number
  ) {
    return new Prisma.Decimal(
      this.money(
        value
      ).toFixed(
        2
      )
    );
  }

  private money(
    value: number
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

  /* =======================================================
     INNGEST
  ======================================================== */

  private async emitEvent(
    name: string,
    data: Record<
      string,
      unknown
    >
  ) {
    try {
      await inngest.send({
        name,
        data,
      });
    } catch (
      error
    ) {
      /*
       * Checkout must remain successful even if a background
       * event cannot be delivered immediately.
       *
       * Reservation cleanup also has a cron safety net.
       */
      this.logger.warn(
        `Unable to send Inngest event ${name}.`,
        error instanceof
          Error
          ? error.stack
          : undefined
      );
    }
  }
}
