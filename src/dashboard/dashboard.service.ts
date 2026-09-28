import {
  Injectable,
} from "@nestjs/common";

import {
  PaymentStatus,
} from "../generated/prisma/client";

import {
  PrismaService,
} from "../prisma/prisma.service";

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  async getOverview() {
    const [
      paidRevenue,
      ordersCount,
      productsCount,
      recentOrders,
      variants,
      openDisputes,
    ] =
      await Promise.all([
        /* =====================================================
           PAID REVENUE

           Support both:
           - COMPLETE = current PayFast success status
           - PAID     = legacy compatibility status
        ====================================================== */

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

        /* =====================================================
           TOTAL ORDERS
        ====================================================== */

        this.prisma.order.count(),

        /* =====================================================
           ACTIVE / NON-ARCHIVED PRODUCTS
        ====================================================== */

        this.prisma.product.count({
          where: {
            status: {
              not:
                "ARCHIVED",
            },
          },
        }),

        /* =====================================================
           RECENT ORDERS

           Your current Order model does NOT contain:
           - customerName
           - customerEmail
           - status

           Current fields are:
           - firstName
           - lastName
           - email
           - orderStatus
        ====================================================== */

        this.prisma.order.findMany({
          orderBy: {
            createdAt:
              "desc",
          },

          take:
            5,

          select: {
            id:
              true,

            orderNumber:
              true,

            userId:
              true,

            firstName:
              true,

            lastName:
              true,

            email:
              true,

            orderStatus:
              true,

            paymentStatus:
              true,

            paymentMethod:
              true,

            deliveryMethod:
              true,

            total:
              true,

            currency:
              true,

            createdAt:
              true,
          },
        }),

        /* =====================================================
           INVENTORY
        ====================================================== */

        this.prisma.productVariant.findMany({
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

                slug:
                  true,
              },
            },
          },
        }),

        /* =====================================================
           OPEN DISPUTES
        ====================================================== */

        this.prisma.dispute.count({
          where: {
            status: {
              in: [
                "OPEN",
                "UNDER_REVIEW",
              ],
            },
          },
        }),
      ]);

    /* =========================================================
       INVENTORY NORMALIZATION
    ========================================================= */

    const inventory =
      variants.map(
        (
          variant
        ) => ({
          ...variant,

          availableStock:
            Math.max(
              0,
              variant.stock -
                variant.reservedStock
            ),
        })
      );

    /* =========================================================
       LOW STOCK
    ========================================================= */

    const lowStockItems =
      inventory
        .filter(
          (
            variant
          ) =>
            variant.availableStock >
              0 &&
            variant.availableStock <=
              variant.threshold
        )
        .sort(
          (
            a,
            b
          ) =>
            a.availableStock -
            b.availableStock
        )
        .slice(
          0,
          5
        )
        .map(
          (
            variant
          ) => ({
            id:
              variant.id,

            productId:
              variant.productId,

            slug:
              variant.product.slug,

            name:
              variant.product.name,

            size:
              variant.size,

            sku:
              variant.sku,

            stock:
              variant.stock,

            reservedStock:
              variant.reservedStock,

            availableStock:
              variant.availableStock,

            threshold:
              variant.threshold,
          })
        );

    const lowStockCount =
      inventory.filter(
        (
          variant
        ) =>
          variant.availableStock >
            0 &&
          variant.availableStock <=
            variant.threshold
      ).length;

    const outOfStockCount =
      inventory.filter(
        (
          variant
        ) =>
          variant.availableStock <=
          0
      ).length;

    /* =========================================================
       RESPONSE

       Keep frontend-friendly names:
       customerName / customerEmail / status

       while Prisma uses the real current schema fields.
    ========================================================= */

    return {
      stats: {
        revenue:
          Number(
            paidRevenue._sum
              .total ??
              0
          ),

        orders:
          ordersCount,

        products:
          productsCount,

        lowStock:
          lowStockCount,

        outOfStock:
          outOfStockCount,

        openDisputes,
      },

      recentOrders:
        recentOrders.map(
          (
            order
          ) => ({
            id:
              order.id,

            orderNumber:
              order.orderNumber,

            customerName:
              `${order.firstName} ${order.lastName}`.trim(),

            customerEmail:
              order.email,

            customerType:
              order.userId
                ? "ACCOUNT"
                : "GUEST",

            status:
              order.orderStatus,

            orderStatus:
              order.orderStatus,

            paymentStatus:
              order.paymentStatus,

            paymentMethod:
              order.paymentMethod,

            deliveryMethod:
              order.deliveryMethod,

            total:
              Number(
                order.total
              ),

            currency:
              order.currency,

            createdAt:
              order.createdAt,
          })
        ),

      lowStockItems,
    };
  }
}
