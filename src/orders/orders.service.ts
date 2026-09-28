import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  Prisma,
} from "../generated/prisma/client";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  GuestOrderListDto,
  GuestOrderLookupDto,
} from "./dto/guest-order.dto";

import {
  OrderQueryDto,
} from "./dto/order-query.dto";

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  /* =======================================================
     ACCOUNT ORDERS
  ======================================================== */

  async findMine(
    userId: string,
    query: OrderQueryDto
  ) {
    const page =
      Math.max(
        1,
        query.page ?? 1
      );

    const limit =
      Math.min(
        50,
        Math.max(
          1,
          query.limit ?? 12
        )
      );

    const where:
      Prisma.OrderWhereInput = {
        userId,

        ...(query.status
          ? {
              orderStatus:
                query.status,
            }
          : {}),
      };

    const [
      orders,
      total,
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

            select:
              listSelect,
          }
        ),

        this.prisma.order.count({
          where,
        }),
      ]);

    return {
      data:
        orders.map(
          serializeListOrder
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
    };
  }

  async findMineById(
    userId: string,
    orderId: string
  ) {
    const order =
      await this.findOrderDetail(
        {
          userId,

          OR: [
            {
              id:
                orderId.trim(),
            },

            {
              orderNumber:
                orderId.trim(),
            },
          ],
        }
      );

    if (
      !order
    ) {
      throw new NotFoundException(
        "Order not found."
      );
    }

    return order;
  }

  /* =======================================================
     GUEST ORDERS

     A guest must prove knowledge of BOTH:
       1. order id/order number
       2. checkout email

     Only orders that still have userId = null are available
     through the guest route. Once a verified account claims
     the order, it is available through the authenticated
     account route instead.
  ======================================================== */

  async findGuestOrder(
    input:
      GuestOrderLookupDto
  ) {
    const orderId =
      input.orderId.trim();

    const email =
      normalizeEmail(
        input.email
      );

    const order =
      await this.findOrderDetail(
        {
          userId:
            null,

          email,

          OR: [
            {
              id:
                orderId,
            },

            {
              orderNumber:
                orderId,
            },
          ],
        }
      );

    if (
      !order
    ) {
      /*
       * Keep this generic so the endpoint does not reveal
       * whether the order number or the email was wrong.
       */
      throw new NotFoundException(
        "We could not verify that guest order."
      );
    }

    return order;
  }

  async findGuestOrders(
    input:
      GuestOrderListDto
  ) {
    const unique =
      dedupeGuestRefs(
        input.orders
      );

    if (
      unique.length ===
      0
    ) {
      return {
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          pages: 1,
        },
      };
    }

    const rows =
      await Promise.all(
        unique.map(
          async (
            ref
          ) => {
            const orderId =
              ref.orderId.trim();

            const email =
              normalizeEmail(
                ref.email
              );

            return this.prisma.order.findFirst(
              {
                where: {
                  userId:
                    null,

                  email,

                  OR: [
                    {
                      id:
                        orderId,
                    },

                    {
                      orderNumber:
                        orderId,
                    },
                  ],
                },

                select:
                  listSelect,
              }
            );
          }
        )
      );

    const orders =
      rows
        .filter(
          (
            order
          ): order is NonNullable<
            typeof order
          > =>
            Boolean(
              order
            )
        )
        .sort(
          (
            a,
            b
          ) =>
            b.createdAt.getTime() -
            a.createdAt.getTime()
        );

    return {
      data:
        orders.map(
          serializeListOrder
        ),

      pagination: {
        page: 1,
        limit: 20,
        total:
          orders.length,
        pages: 1,
      },
    };
  }

  /* =======================================================
     DETAIL LOADER
  ======================================================== */

  private async findOrderDetail(
    where:
      Prisma.OrderWhereInput
  ) {
    const order =
      await this.prisma.order.findFirst(
        {
          where,

          select: {
            id:
              true,

            orderNumber:
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
      return null;
    }

    const [
      payment,
      shipment,
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
      ]);

    return {
      id:
        order.id,

      orderNumber:
        order.orderNumber,

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
    };
  }
}

/* =========================================================
   LIST SELECT / SERIALIZER
========================================================= */

const listSelect = {
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

  deliveryMethod:
    true,

  subtotal:
    true,

  shipping:
    true,

  total:
    true,

  currency:
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
    },
  },
} satisfies Prisma.OrderSelect;

function serializeListOrder(
  order:
    Prisma.OrderGetPayload<{
      select:
        typeof listSelect;
    }>
) {
  return {
    id:
      order.id,

    orderNumber:
      order.orderNumber,

    orderStatus:
      order.orderStatus,

    paymentStatus:
      order.paymentStatus,

    paymentMethod:
      order.paymentMethod,

    deliveryMethod:
      order.deliveryMethod,

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
          ...item,

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
  };
}

function normalizeEmail(
  email:
    string
) {
  return email
    .trim()
    .toLowerCase();
}

function dedupeGuestRefs(
  refs:
    GuestOrderLookupDto[]
) {
  const seen =
    new Set<string>();

  return refs.filter(
    (
      ref
    ) => {
      const key =
        `${ref.orderId.trim().toLowerCase()}::${normalizeEmail(
          ref.email
        )}`;

      if (
        seen.has(
          key
        )
      ) {
        return false;
      }

      seen.add(
        key
      );

      return true;
    }
  );
}
