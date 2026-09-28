import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  inngest,
} from "../inngest/client";

import {
  INVENTORY_STOCK_UPDATED_EVENT,
} from "../inngest/inventory.functions";

import {
  InventoryQueryDto,
} from "./dto/inventory-query.dto";

import {
  UpdateInventoryStockDto,
} from "./dto/update-inventory-stock.dto";

@Injectable()
export class InventoryService {
  private readonly logger =
    new Logger(
      InventoryService.name
    );

  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  /* =======================================================
     INVENTORY LIST
  ======================================================== */

  async findAll(
    query: InventoryQueryDto
  ) {
    const search =
      query.search
        ?.trim();

    const family =
      query.family
        ?.trim();

    const variants =
      await this.prisma.productVariant.findMany(
        {
          where: {
            product: {
              status: {
                not:
                  "ARCHIVED",
              },

              ...(family && {
                family: {
                  equals:
                    family,

                  mode:
                    "insensitive",
                },
              }),
            },

            ...(search && {
              OR: [
                {
                  sku: {
                    contains:
                      search,

                    mode:
                      "insensitive",
                  },
                },

                {
                  size: {
                    contains:
                      search,

                    mode:
                      "insensitive",
                  },
                },

                {
                  product: {
                    OR: [
                      {
                        name: {
                          contains:
                            search,

                          mode:
                            "insensitive",
                        },
                      },

                      {
                        slug: {
                          contains:
                            search,

                          mode:
                            "insensitive",
                        },
                      },

                      {
                        family: {
                          contains:
                            search,

                          mode:
                            "insensitive",
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          },

          include: {
            product: {
              select: {
                id:
                  true,

                name:
                  true,

                slug:
                  true,

                family:
                  true,

                status:
                  true,

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

          orderBy: [
            {
              productId:
                "asc",
            },

            {
              price:
                "asc",
            },
          ],
        }
      );

    const data =
      variants.map(
        (variant) =>
          this.serializeVariant(
            variant
          )
      );

    return {
      data,

      stats:
        this.calculateStats(
          data
        ),
    };
  }

  /* =======================================================
     UPDATE STOCK
  ======================================================== */

  async updateStock(
    variantId: string,
    dto: UpdateInventoryStockDto
  ) {
    const current =
      await this.prisma.productVariant.findUnique(
        {
          where: {
            id:
              variantId,
          },

          include: {
            product: {
              select: {
                id:
                  true,

                name:
                  true,

                slug:
                  true,

                family:
                  true,

                status:
                  true,

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

    if (!current) {
      throw new NotFoundException(
        "Inventory variant not found."
      );
    }

    if (
      dto.stock <
      current.reservedStock
    ) {
      throw new BadRequestException(
        `Stock cannot be lower than the ${current.reservedStock} units currently reserved.`
      );
    }

    const updated =
      await this.prisma.productVariant.update(
        {
          where: {
            id:
              variantId,
          },

          data: {
            stock:
              dto.stock,

            ...(dto.threshold !==
              undefined && {
              threshold:
                dto.threshold,
            }),
          },

          include: {
            product: {
              select: {
                id:
                  true,

                name:
                  true,

                slug:
                  true,

                family:
                  true,

                status:
                  true,

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

    const item =
      this.serializeVariant(
        updated
      );

    /* =====================================================
       BACKGROUND EVENT

       Stock saving does NOT depend on Inngest being online.
       If the event cannot be sent, the database update stays
       successful and the daily audit can catch it later.
    ====================================================== */

    try {
      await inngest.send({
        name:
          INVENTORY_STOCK_UPDATED_EVENT,

        data: {
          variantId:
            item.id,

          productId:
            item.productId,

          productName:
            item.name,

          size:
            item.size,

          sku:
            item.sku,

          stock:
            item.stock,

          reservedStock:
            item.reservedStock,

          availableStock:
            item.availableStock,

          threshold:
            item.threshold,

          changedAt:
            new Date().toISOString(),
        },
      });
    } catch (
      error
    ) {
      this.logger.warn(
        `Inventory was saved, but the Inngest stock event could not be sent for variant ${item.id}.`,
        error instanceof
          Error
          ? error.stack
          : undefined
      );
    }

    return {
      message:
        "Inventory updated successfully.",

      item,
    };
  }

  /* =======================================================
     SERIALIZER
  ======================================================== */

  private serializeVariant(
    variant: {
      id: string;
      productId: string;
      size: string;
      sku: string;
      price: unknown;
      stock: number;
      reservedStock: number;
      threshold: number;
      active: boolean;

      product: {
        id: string;
        name: string;
        slug: string;
        family: string;
        status: string;

        images: Array<{
          url: string;
        }>;
      };
    }
  ) {
    const price =
      Number(
        variant.price
      );

    const availableStock =
      Math.max(
        0,
        variant.stock -
          variant.reservedStock
      );

    return {
      id:
        variant.id,

      productId:
        variant.productId,

      slug:
        variant.product.slug,

      name:
        variant.product.name,

      family:
        variant.product.family,

      productStatus:
        variant.product.status,

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

      active:
        variant.active,

      price:
        Number.isFinite(
          price
        )
          ? price
          : 0,

      imageUrl:
        variant.product
          .images[0]
          ?.url ??
        null,
    };
  }

  /* =======================================================
     STATS
  ======================================================== */

  private calculateStats(
    items: Array<{
      stock: number;
      reservedStock: number;
      availableStock: number;
      threshold: number;
      price: number;
    }>
  ) {
    return {
      totalVariants:
        items.length,

      totalUnits:
        items.reduce(
          (
            total,
            item
          ) =>
            total +
            item.stock,
          0
        ),

      reservedUnits:
        items.reduce(
          (
            total,
            item
          ) =>
            total +
            item.reservedStock,
          0
        ),

      availableUnits:
        items.reduce(
          (
            total,
            item
          ) =>
            total +
            item.availableStock,
          0
        ),

      inventoryValue:
        items.reduce(
          (
            total,
            item
          ) =>
            total +
            item.stock *
              item.price,
          0
        ),

      lowStockCount:
        items.filter(
          (item) =>
            item.availableStock >
              0 &&
            item.availableStock <=
              item.threshold
        ).length,

      outOfStockCount:
        items.filter(
          (item) =>
            item.availableStock <=
            0
        ).length,
    };
  }
}
