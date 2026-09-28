import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ShippingProvider,
} from "../generated/prisma/client";

import {
  inngest,
} from "../inngest/client";

import {
  ORDER_STATUS_CHANGED_EVENT,
} from "../inngest/orders.functions";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  AdminOrderQueryDto,
} from "./dto/admin-order-query.dto";

import {
  UpdateAdminOrderStatusDto,
} from "./dto/update-admin-order-status.dto";

import {
  UpsertShipmentDto,
} from "./dto/upsert-shipment.dto";

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  /* =======================================================
     ADMIN ORDER LIST
  ======================================================== */

  async findAll(
    query:
      AdminOrderQueryDto
  ) {
    const page =
      Math.max(
        1,
        query.page ??
          1
      );

    const limit =
      Math.min(
        100,
        Math.max(
          1,
          query.limit ??
            25
        )
      );

    const search =
      query.search
        ?.trim();

    const where:
      Prisma.OrderWhereInput =
      {
        ...(query.orderStatus
          ? {
              orderStatus:
                query.orderStatus as
                  OrderStatus,
            }
          : {}),

        ...(query.paymentStatus
          ? {
              paymentStatus:
                query.paymentStatus as
                  PaymentStatus,
            }
          : {}),

        ...(query.deliveryMethod
          ? {
              deliveryMethod:
                query.deliveryMethod as
                  ShippingProvider,
            }
          : {}),

        ...(query.customerType ===
        "ACCOUNT"
          ? {
              userId: {
                not:
                  null,
              },
            }
          : {}),

        ...(query.customerType ===
        "GUEST"
          ? {
              userId:
                null,
            }
          : {}),

        ...(search
          ? {
              OR: [
                {
                  orderNumber: {
                    contains:
                      search,
                    mode:
                      "insensitive",
                  },
                },

                {
                  email: {
                    contains:
                      search,
                    mode:
                      "insensitive",
                  },
                },

                {
                  firstName: {
                    contains:
                      search,
                    mode:
                      "insensitive",
                  },
                },

                {
                  lastName: {
                    contains:
                      search,
                    mode:
                      "insensitive",
                  },
                },

                {
                  phone: {
                    contains:
                      search,
                  },
                },

                {
                  items: {
                    some: {
                      OR: [
                        {
                          productName: {
                            contains:
                              search,
                            mode:
                              "insensitive",
                          },
                        },

                        {
                          sku: {
                            contains:
                              search,
                            mode:
                              "insensitive",
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      };

    const [
      orders,
      total,
      summary,
    ] =
      await Promise.all([
        this.prisma.order.findMany(
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

            select: {
              id:
                true,

              orderNumber:
                true,

              userId:
                true,

              email:
                true,

              firstName:
                true,

              lastName:
                true,

              deliveryMethod:
                true,

              paymentMethod:
                true,

              orderStatus:
                true,

              paymentStatus:
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

              items: {
                select: {
                  id:
                    true,

                  productName:
                    true,

                  size:
                    true,

                  quantity:
                    true,

                  imageUrl:
                    true,
                },
              },
            },
          }
        ),

        this.prisma.order.count(
          {
            where,
          }
        ),

        this.getSummary(),
      ]);

    return {
      data:
        orders.map(
          (
            order
          ) => ({
            ...order,

            total:
              Number(
                order.total
              ),

            customerType:
              order.userId
                ? "ACCOUNT"
                : "GUEST",

            customerName:
              `${order.firstName} ${order.lastName}`.trim(),

            itemCount:
              order.items.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.quantity,
                0
              ),
          })
        ),

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

      summary,
    };
  }

  /* =======================================================
     SUMMARY
  ======================================================== */

  async getSummary() {
    const now =
      new Date();

    const startOfDay =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

    const [
      totalOrders,
      ordersToday,
      pendingPayment,
      processing,
      packing,
      readyToShip,
      paidRevenue,
      revenueToday,
    ] =
      await Promise.all([
        this.prisma.order.count(),

        this.prisma.order.count({
          where: {
            createdAt: {
              gte:
                startOfDay,
            },
          },
        }),

        this.prisma.order.count({
          where: {
            orderStatus:
              OrderStatus.PENDING_PAYMENT,
          },
        }),

        this.prisma.order.count({
          where: {
            orderStatus:
              OrderStatus.PROCESSING,
          },
        }),

        this.prisma.order.count({
          where: {
            orderStatus:
              OrderStatus.PACKING,
          },
        }),

        this.prisma.order.count({
          where: {
            orderStatus:
              OrderStatus.READY_FOR_SHIPMENT,
          },
        }),

        this.prisma.order.aggregate({
          where: {
            paymentStatus: {
              in: [
                PaymentStatus.COMPLETE,
                PaymentStatus.PAID,
              ],
            },
          },

          _sum: {
            total:
              true,
          },
        }),

        this.prisma.order.aggregate({
          where: {
            paymentStatus: {
              in: [
                PaymentStatus.COMPLETE,
                PaymentStatus.PAID,
              ],
            },

            paidAt: {
              gte:
                startOfDay,
            },
          },

          _sum: {
            total:
              true,
          },
        }),
      ]);

    return {
      totalOrders,
      ordersToday,
      pendingPayment,
      processing,
      packing,
      readyToShip,

      paidRevenue:
        Number(
          paidRevenue._sum
            .total ??
            0
        ),

      revenueToday:
        Number(
          revenueToday._sum
            .total ??
            0
        ),
    };
  }

  /* =======================================================
     DETAIL
  ======================================================== */

  async findOne(
    orderId:
      string
  ) {
    const value =
      orderId.trim();

    const order =
      await this.prisma.order.findFirst(
        {
          where: {
            OR: [
              {
                id:
                  value,
              },

              {
                orderNumber:
                  value,
              },
            ],
          },

          select: {
            id:
              true,

            orderNumber:
              true,

            userId:
              true,

            email:
              true,

            firstName:
              true,

            lastName:
              true,

            phone:
              true,

            addressLine1:
              true,

            addressLine2:
              true,

            suburb:
              true,

            city:
              true,

            province:
              true,

            postalCode:
              true,

            country:
              true,

            deliveryMethod:
              true,

            paxiPointCode:
              true,

            paxiPointName:
              true,

            paymentMethod:
              true,

            subtotal:
              true,

            shipping:
              true,

            total:
              true,

            currency:
              true,

            orderStatus:
              true,

            paymentStatus:
              true,

            reservationExpiresAt:
              true,

            paidAt:
              true,

            shippedAt:
              true,

            deliveredAt:
              true,

            createdAt:
              true,

            updatedAt:
              true,

            user: {
              select: {
                id:
                  true,

                name:
                  true,

                email:
                  true,

                imageUrl:
                  true,

                status:
                  true,

                createdAt:
                  true,
              },
            },

            items: {
              orderBy: {
                createdAt:
                  "asc",
              },

              select: {
                id:
                  true,

                productId:
                  true,

                variantId:
                  true,

                productName:
                  true,

                family:
                  true,

                concentration:
                  true,

                sku:
                  true,

                size:
                  true,

                imageUrl:
                  true,

                quantity:
                  true,

                unitPrice:
                  true,

                lineTotal:
                  true,

                product: {
                  select: {
                    slug:
                      true,
                  },
                },
              },
            },
          },
        }
      );

    if (
      !order
    ) {
      throw new NotFoundException(
        "Order not found."
      );
    }

    const [
      payment,
      shipment,
      dispute,
    ] =
      await Promise.all([
        this.prisma.payment.findUnique(
          {
            where: {
              orderId:
                order.id,
            },

            select: {
              id:
                true,

              provider:
                true,

              merchantPaymentId:
                true,

              providerPaymentId:
                true,

              amount:
                true,

              currency:
                true,

              status:
                true,

              completedAt:
                true,

              createdAt:
                true,

              updatedAt:
                true,
            },
          }
        ),

        this.prisma.shipment.findUnique(
          {
            where: {
              orderId:
                order.id,
            },

            select: {
              id:
                true,

              provider:
                true,

              service:
                true,

              trackingNumber:
                true,

              collectionPointCode:
                true,

              collectionPointName:
                true,

              status:
                true,

              trackingUrl:
                true,

              externalShipmentId:
                true,

              shippedAt:
                true,

              deliveredAt:
                true,

              createdAt:
                true,

              updatedAt:
                true,
            },
          }
        ),

        this.prisma.dispute.findUnique(
          {
            where: {
              orderId:
                order.id,
            },

            select: {
              id:
                true,

              status:
                true,

              reason:
                true,

              description:
                true,

              evidenceUrls:
                true,

              adminNotes:
                true,

              resolution:
                true,

              createdAt:
                true,

              updatedAt:
                true,

              resolvedAt:
                true,
            },
          }
        ),
      ]);

    return {
      id:
        order.id,

      orderNumber:
        order.orderNumber,

      customerType:
        order.userId
          ? "ACCOUNT"
          : "GUEST",

      account:
        order.user,

      email:
        order.email,

      customer: {
        firstName:
          order.firstName,

        lastName:
          order.lastName,

        phone:
          order.phone,
      },

      deliveryAddress: {
        addressLine1:
          order.addressLine1,

        addressLine2:
          order.addressLine2,

        suburb:
          order.suburb,

        city:
          order.city,

        province:
          order.province,

        postalCode:
          order.postalCode,

        country:
          order.country,
      },

      deliveryMethod:
        order.deliveryMethod,

      paxi: {
        pointCode:
          order.paxiPointCode,

        pointName:
          order.paxiPointName,
      },

      paymentMethod:
        order.paymentMethod,

      subtotal:
        Number(
          order.subtotal
        ),

      shipping:
        Number(
          order.shipping
        ),

      total:
        Number(
          order.total
        ),

      currency:
        order.currency,

      orderStatus:
        order.orderStatus,

      paymentStatus:
        order.paymentStatus,

      reservationExpiresAt:
        order.reservationExpiresAt,

      paidAt:
        order.paidAt,

      shippedAt:
        order.shippedAt,

      deliveredAt:
        order.deliveredAt,

      createdAt:
        order.createdAt,

      updatedAt:
        order.updatedAt,

      itemCount:
        order.items.reduce(
          (
            total,
            item
          ) =>
            total +
            item.quantity,
          0
        ),

      items:
        order.items.map(
          (
            item
          ) => ({
            id:
              item.id,

            productId:
              item.productId,

            variantId:
              item.variantId,

            slug:
              item.product.slug,

            productName:
              item.productName,

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
              Number(
                item.unitPrice
              ),

            lineTotal:
              Number(
                item.lineTotal
              ),
          })
        ),

      payment:
        payment
          ? {
              ...payment,

              amount:
                Number(
                  payment.amount
                ),
            }
          : null,

      shipment:
        shipment ??
        null,

      dispute:
        dispute ??
        null,
    };
  }

  /* =======================================================
     STATUS UPDATE
  ======================================================== */

  async updateStatus(
    orderId:
      string,

    dto:
      UpdateAdminOrderStatusDto,

    actorId:
      string
  ) {
    const current =
      await this.prisma.order.findUnique(
        {
          where: {
            id:
              orderId,
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
          },
        }
      );

    if (
      !current
    ) {
      throw new NotFoundException(
        "Order not found."
      );
    }

    const next =
      dto.orderStatus as
        OrderStatus;

    if (
      next ===
      current.orderStatus
    ) {
      return this.findOne(
        orderId
      );
    }

    this.assertTransitionAllowed(
      current.orderStatus,
      next
    );

    if (
      next ===
        OrderStatus.PROCESSING &&
      current.paymentMethod ===
        PaymentMethod.PAYFAST &&
      !isPaidPaymentStatus(
        current.paymentStatus
      )
    ) {
      throw new BadRequestException(
        "A PayFast order cannot be moved to processing until payment is confirmed."
      );
    }

    if (
      next ===
        OrderStatus.CANCELLED &&
      isPaidPaymentStatus(
        current.paymentStatus
      )
    ) {
      throw new BadRequestException(
        "This order is already paid. Do not cancel it without completing a refund workflow."
      );
    }

    if (
      next ===
      OrderStatus.REFUNDED
    ) {
      throw new BadRequestException(
        "Refunded cannot be set manually. Complete the payment-provider refund workflow first."
      );
    }

    if (
      next ===
      OrderStatus.SHIPPED
    ) {
      const shipment =
        await this.prisma.shipment.findUnique(
          {
            where: {
              orderId:
                current.id,
            },

            select: {
              trackingNumber:
                true,
            },
          }
        );

      if (
        !shipment
          ?.trackingNumber
      ) {
        throw new BadRequestException(
          "Add shipment tracking before marking this order as shipped."
        );
      }
    }

    const now =
      new Date();

    await this.prisma.order.update(
      {
        where: {
          id:
            current.id,
        },

        data: {
          orderStatus:
            next,

          ...(next ===
          OrderStatus.SHIPPED
            ? {
                shippedAt:
                  now,
              }
            : {}),

          ...(next ===
          OrderStatus.DELIVERED
            ? {
                deliveredAt:
                  now,
              }
            : {}),
        },
      }
    );

    if (
      next ===
      OrderStatus.SHIPPED
    ) {
      await this.prisma.shipment.update(
        {
          where: {
            orderId:
              current.id,
          },

          data: {
            status:
              "SHIPPED",

            shippedAt:
              now,
          },
        }
      );
    }

    if (
      next ===
      OrderStatus.DELIVERED
    ) {
      await this.prisma.shipment.updateMany(
        {
          where: {
            orderId:
              current.id,
          },

          data: {
            status:
              "DELIVERED",

            deliveredAt:
              now,
          },
        }
      );
    }

    /*
     * Keep the admin request fast. The customer notification
     * is handled by the existing Inngest order function.
     */
    try {
      await inngest.send({
        name:
          ORDER_STATUS_CHANGED_EVENT,

        data: {
          orderId:
            current.id,

          orderNumber:
            current.orderNumber,

          previousStatus:
            current.orderStatus,

          orderStatus:
            next,

          actorId,

          reason:
            dto.reason ??
            null,

          changedAt:
            now.toISOString(),
        },
      });
    } catch (
      error
    ) {
      console.warn(
        "Unable to send order status Inngest event.",
        error
      );
    }

    return this.findOne(
      orderId
    );
  }

  /* =======================================================
     SHIPMENT
  ======================================================== */

  async upsertShipment(
    orderId:
      string,

    dto:
      UpsertShipmentDto,

    actorId:
      string
  ) {
    const order =
      await this.prisma.order.findUnique(
        {
          where: {
            id:
              orderId,
          },

          select: {
            id:
              true,

            orderNumber:
              true,

            deliveryMethod:
              true,
          },
        }
      );

    if (
      !order
    ) {
      throw new NotFoundException(
        "Order not found."
      );
    }

    if (
      dto.provider !==
      order.deliveryMethod
    ) {
      throw new BadRequestException(
        `Shipment provider must match the order delivery method (${order.deliveryMethod}).`
      );
    }

    const cleanTracking =
      optionalText(
        dto.trackingNumber
      );

    const cleanStatus =
      optionalText(
        dto.status
      ) ??
      "PENDING";

    await this.prisma.shipment.upsert(
      {
        where: {
          orderId:
            order.id,
        },

        create: {
          orderId:
            order.id,

          provider:
            dto.provider as
              ShippingProvider,

          service:
            dto.service.trim(),

          trackingNumber:
            cleanTracking,

          collectionPointCode:
            optionalText(
              dto.collectionPointCode
            ),

          collectionPointName:
            optionalText(
              dto.collectionPointName
            ),

          status:
            cleanStatus,

          trackingUrl:
            optionalText(
              dto.trackingUrl
            ),

          externalShipmentId:
            optionalText(
              dto.externalShipmentId
            ),

          metadata: {
            lastUpdatedBy:
              actorId,
          },
        },

        update: {
          provider:
            dto.provider as
              ShippingProvider,

          service:
            dto.service.trim(),

          trackingNumber:
            cleanTracking,

          collectionPointCode:
            optionalText(
              dto.collectionPointCode
            ),

          collectionPointName:
            optionalText(
              dto.collectionPointName
            ),

          status:
            cleanStatus,

          trackingUrl:
            optionalText(
              dto.trackingUrl
            ),

          externalShipmentId:
            optionalText(
              dto.externalShipmentId
            ),

          metadata: {
            lastUpdatedBy:
              actorId,
          },
        },
      }
    );

    return this.findOne(
      orderId
    );
  }

  /* =======================================================
     TRANSITIONS
  ======================================================== */

  private assertTransitionAllowed(
    current:
      OrderStatus,

    next:
      OrderStatus
  ) {
    const transitions:
      Record<
        OrderStatus,
        OrderStatus[]
      > = {
        /*
         * Legacy values are intentionally kept because the
         * current Prisma enum still contains them for old rows.
         *
         * PENDING and PAYMENT_PENDING behave like the newer
         * PENDING_PAYMENT state.
         */
        PENDING: [
          OrderStatus.PROCESSING,
          OrderStatus.CANCELLED,
        ],

        PAYMENT_PENDING: [
          OrderStatus.PROCESSING,
          OrderStatus.CANCELLED,
        ],

        PENDING_PAYMENT: [
          OrderStatus.PROCESSING,
          OrderStatus.CANCELLED,
        ],

        /*
         * Legacy PAID is an old order-status value. Move it
         * into the current fulfilment workflow through
         * PROCESSING.
         */
        PAID: [
          OrderStatus.PROCESSING,
        ],

        /*
         * DISPUTED is retained only for historical data.
         * Do not allow normal fulfilment transitions from it.
         * Disputes should be resolved through the dispute flow.
         */
        DISPUTED:
          [],

        PROCESSING: [
          OrderStatus.PACKING,
          OrderStatus.CANCELLED,
        ],

        PACKING: [
          OrderStatus.READY_FOR_SHIPMENT,
          OrderStatus.CANCELLED,
        ],

        READY_FOR_SHIPMENT: [
          OrderStatus.SHIPPED,
          OrderStatus.CANCELLED,
        ],

        SHIPPED: [
          OrderStatus.DELIVERED,
        ],

        DELIVERED: [
          OrderStatus.RETURN_REQUESTED,
        ],

        CANCELLED:
          [],

        RETURN_REQUESTED: [
          OrderStatus.RETURNED,
        ],

        RETURNED: [
          OrderStatus.REFUNDED,
        ],

        REFUNDED:
          [],
      };

    if (
      !transitions[
        current
      ].includes(
        next
      )
    ) {
      throw new BadRequestException(
        `Order cannot move from ${current} to ${next}.`
      );
    }
  }
}


function isPaidPaymentStatus(
  status:
    PaymentStatus
) {
  return (
    status ===
      PaymentStatus.COMPLETE ||
    status ===
      PaymentStatus.PAID
  );
}

function optionalText(
  value:
    string |
    undefined
) {
  const clean =
    value?.trim();

  return clean ||
    null;
}
