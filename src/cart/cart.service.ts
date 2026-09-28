import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import {
  ConfigService,
} from "@nestjs/config";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  inngest,
} from "../inngest/client";

import {
  CART_CHANGED_EVENT,
  type CartChangedAction,
} from "../inngest/cart.functions";

import {
  AddCartItemDto,
} from "./dto/add-cart-item.dto";

import {
  SyncCartDto,
} from "./dto/sync-cart.dto";

import {
  UpdateCartItemDto,
} from "./dto/update-cart-item.dto";

type CartRecord = {
  id: string;
  userId: string;
  variantId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;

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
      shortDescription: string;
      family: string;
      concentration: string;
      status:
        | "DRAFT"
        | "ACTIVE"
        | "ARCHIVED";

      images: Array<{
        url: string;
      }>;
    };
  };
};

@Injectable()
export class CartService {
  private readonly logger =
    new Logger(
      CartService.name
    );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly config:
      ConfigService
  ) {}

  /* =======================================================
     CART COUNT
  ======================================================== */

  async count(
    userId: string
  ) {
    const aggregate =
      await this.prisma.cartItem.aggregate(
        {
          where: {
            userId,

            variant: {
              active:
                true,

              product: {
                status:
                  "ACTIVE",
              },
            },
          },

          _sum: {
            quantity:
              true,
          },
        }
      );

    return {
      count:
        aggregate._sum
          .quantity ??
        0,
    };
  }

  /* =======================================================
     GET CART
  ======================================================== */

  async findAll(
    userId: string
  ) {
    const rows =
      await this.prisma.cartItem.findMany(
        {
          where: {
            userId,
          },

          include: {
            variant: {
              include: {
                product: {
                  select: {
                    id:
                      true,

                    name:
                      true,

                    slug:
                      true,

                    shortDescription:
                      true,

                    family:
                      true,

                    concentration:
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

                      select: {
                        url:
                          true,
                      },
                    },
                  },
                },
              },
            },
          },

          orderBy: {
            createdAt:
              "asc",
          },
        }
      );

    const data =
      rows.map(
        (row) =>
          this.serializeItem(
            row as CartRecord
          )
      );

    const subtotal =
      data.reduce(
        (
          total,
          item
        ) =>
          total +
          item.lineTotal,
        0
      );

    const itemCount =
      data.reduce(
        (
          total,
          item
        ) =>
          total +
          item.quantity,
        0
      );

    const freeDeliveryThreshold =
      this.getFreeDeliveryThreshold();

    return {
      data,

      summary: {
        itemCount,

        subtotal,

        freeDeliveryThreshold,

        amountUntilFreeDelivery:
          Math.max(
            0,
            freeDeliveryThreshold -
              subtotal
          ),

        freeDeliveryUnlocked:
          subtotal >=
          freeDeliveryThreshold,
      },
    };
  }

  /* =======================================================
     ADD ITEM
  ======================================================== */

  async add(
    userId: string,
    dto: AddCartItemDto
  ) {
    const variant =
      await this.getPurchasableVariant(
        dto.variantId
      );

    const availableStock =
      this.availableStock(
        variant.stock,
        variant.reservedStock
      );

    const existing =
      await this.prisma.cartItem.findUnique(
        {
          where: {
            userId_variantId: {
              userId,
              variantId:
                dto.variantId,
            },
          },

          select: {
            id:
              true,

            quantity:
              true,
          },
        }
      );

    const nextQuantity =
      (
        existing?.quantity ??
        0
      ) +
      dto.quantity;

    if (
      nextQuantity >
      availableStock
    ) {
      throw new BadRequestException(
        this.stockMessage(
          availableStock
        )
      );
    }

    await this.prisma.cartItem.upsert(
      {
        where: {
          userId_variantId: {
            userId,

            variantId:
              dto.variantId,
          },
        },

        update: {
          quantity:
            nextQuantity,
        },

        create: {
          userId,

          variantId:
            dto.variantId,

          quantity:
            dto.quantity,
        },
      }
    );

    await this.emitCartChanged(
      userId,
      "ADDED",
      dto.variantId
    );

    return {
      message:
        "Fragrance added to your bag.",

      ...(await this.findAll(
        userId
      )),
    };
  }

  /* =======================================================
     UPDATE QUANTITY
  ======================================================== */

  async update(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto
  ) {
    const item =
      await this.prisma.cartItem.findFirst(
        {
          where: {
            id:
              itemId,

            userId,
          },

          include: {
            variant: {
              select: {
                id:
                  true,

                stock:
                  true,

                reservedStock:
                  true,

                active:
                  true,

                product: {
                  select: {
                    status:
                      true,
                  },
                },
              },
            },
          },
        }
      );

    if (!item) {
      throw new NotFoundException(
        "Cart item not found."
      );
    }

    if (
      !item.variant.active ||
      item.variant.product.status !==
        "ACTIVE"
    ) {
      throw new BadRequestException(
        "This fragrance is no longer available."
      );
    }

    const availableStock =
      this.availableStock(
        item.variant.stock,
        item.variant.reservedStock
      );

    if (
      dto.quantity >
      availableStock
    ) {
      throw new BadRequestException(
        this.stockMessage(
          availableStock
        )
      );
    }

    await this.prisma.cartItem.update(
      {
        where: {
          id:
            item.id,
        },

        data: {
          quantity:
            dto.quantity,
        },
      }
    );

    await this.emitCartChanged(
      userId,
      "UPDATED",
      item.variant.id
    );

    return {
      message:
        "Bag updated.",

      ...(await this.findAll(
        userId
      )),
    };
  }

  /* =======================================================
     REMOVE ITEM
  ======================================================== */

  async remove(
    userId: string,
    itemId: string
  ) {
    const result =
      await this.prisma.cartItem.deleteMany(
        {
          where: {
            id:
              itemId,

            userId,
          },
        }
      );

    if (
      result.count ===
      0
    ) {
      throw new NotFoundException(
        "Cart item not found."
      );
    }

    await this.emitCartChanged(
      userId,
      "REMOVED"
    );

    return {
      message:
        "Fragrance removed from your bag.",

      ...(await this.findAll(
        userId
      )),
    };
  }

  /* =======================================================
     CLEAR CART
  ======================================================== */

  async clear(
    userId: string
  ) {
    await this.prisma.cartItem.deleteMany(
      {
        where: {
          userId,
        },
      }
    );

    await this.emitCartChanged(
      userId,
      "CLEARED"
    );

    return {
      message:
        "Your bag has been cleared.",

      ...(await this.findAll(
        userId
      )),
    };
  }

  /* =======================================================
     MOVE TO WISHLIST

     Database transaction:
     1. Add Product to Wishlist
     2. Delete CartItem
  ======================================================== */

  async moveToWishlist(
    userId: string,
    itemId: string
  ) {
    const item =
      await this.prisma.cartItem.findFirst(
        {
          where: {
            id:
              itemId,

            userId,
          },

          include: {
            variant: {
              select: {
                id:
                  true,

                productId:
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
            },
          },
        }
      );

    if (!item) {
      throw new NotFoundException(
        "Cart item not found."
      );
    }

    if (
      item.variant.product.status !==
      "ACTIVE"
    ) {
      throw new BadRequestException(
        "This fragrance can no longer be added to your wishlist."
      );
    }

    await this.prisma.$transaction(
      [
        this.prisma.wishlistItem.upsert(
          {
            where: {
              userId_productId: {
                userId,

                productId:
                  item.variant.productId,
              },
            },

            update: {},

            create: {
              userId,

              productId:
                item.variant.productId,
            },
          }
        ),

        this.prisma.cartItem.delete(
          {
            where: {
              id:
                item.id,
            },
          }
        ),
      ]
    );

    await this.emitCartChanged(
      userId,
      "MOVED_TO_WISHLIST",
      item.variant.id
    );

    return {
      message:
        `${item.variant.product.name} moved to your wishlist.`,

      ...(await this.findAll(
        userId
      )),
    };
  }

  /* =======================================================
     SYNC LEGACY LOCAL CART

     This lets the existing storefront localStorage cart move
     into Neon the first time the authenticated customer opens
     the new backend cart.
  ======================================================== */

  async sync(
    userId: string,
    dto: SyncCartDto
  ) {
    const merged =
      new Map<
        string,
        number
      >();

    for (
      const item of
      dto.items
    ) {
      merged.set(
        item.variantId,
        Math.min(
          99,
          (
            merged.get(
              item.variantId
            ) ??
            0
          ) +
            item.quantity
        )
      );
    }

    let imported =
      0;

    let ignored =
      0;

    for (
      const [
        variantId,
        quantity,
      ] of merged
    ) {
      const variant =
        await this.prisma.productVariant.findUnique(
          {
            where: {
              id:
                variantId,
            },

            select: {
              id:
                true,

              stock:
                true,

              reservedStock:
                true,

              active:
                true,

              product: {
                select: {
                  status:
                    true,
                },
              },
            },
          }
        );

      if (
        !variant ||
        !variant.active ||
        variant.product.status !==
          "ACTIVE"
      ) {
        ignored +=
          1;

        continue;
      }

      const availableStock =
        this.availableStock(
          variant.stock,
          variant.reservedStock
        );

      if (
        availableStock <=
        0
      ) {
        ignored +=
          1;

        continue;
      }

      const existing =
        await this.prisma.cartItem.findUnique(
          {
            where: {
              userId_variantId: {
                userId,
                variantId,
              },
            },

            select: {
              id:
                true,

              quantity:
                true,
            },
          }
        );

      const safeQuantity =
        Math.min(
          availableStock,
          Math.max(
            existing?.quantity ??
              0,
            quantity
          )
        );

      /*
       * IMPORTANT:
       * Use an atomic upsert here instead of:
       *
       *   findUnique() -> create()
       *
       * In development React can trigger the initial cart sync more than
       * once, and two requests can reach this code at almost the same time.
       * With create(), both requests may see "no row" and then both try to
       * insert the same (userId, variantId), causing Prisma P2002.
       *
       * The unique compound key is exactly what makes this upsert safe.
       */
      await this.prisma.cartItem.upsert(
        {
          where: {
            userId_variantId: {
              userId,
              variantId,
            },
          },

          update: {
            quantity:
              safeQuantity,
          },

          create: {
            userId,
            variantId,
            quantity:
              safeQuantity,
          },
        }
      );

      imported +=
        1;
    }

    if (
      imported >
      0
    ) {
      await this.emitCartChanged(
        userId,
        "SYNCED"
      );
    }

    return {
      imported,
      ignored,

      ...(await this.findAll(
        userId
      )),
    };
  }

  /* =======================================================
     HELPERS
  ======================================================== */

  private async emitCartChanged(
    userId: string,
    action: CartChangedAction,
    variantId?: string
  ) {
    try {
      await inngest.send({
        name:
          CART_CHANGED_EVENT,

        data: {
          userId,
          action,

          ...(variantId && {
            variantId,
          }),

          changedAt:
            new Date().toISOString(),
        },
      });
    } catch (
      error
    ) {
      /*
       * The cart database operation is already complete.
       * Inngest must never make add/update/remove fail.
       */
      this.logger.warn(
        `Cart was updated, but the Inngest event could not be sent for user ${userId}.`,
        error instanceof
          Error
          ? error.stack
          : undefined
      );
    }
  }

  private async getPurchasableVariant(
    variantId: string
  ) {
    const variant =
      await this.prisma.productVariant.findUnique(
        {
          where: {
            id:
              variantId,
          },

          select: {
            id:
              true,

            stock:
              true,

            reservedStock:
              true,

            active:
              true,

            product: {
              select: {
                status:
                  true,
              },
            },
          },
        }
      );

    if (
      !variant ||
      !variant.active ||
      variant.product.status !==
        "ACTIVE"
    ) {
      throw new NotFoundException(
        "Fragrance variant not found or unavailable."
      );
    }

    const availableStock =
      this.availableStock(
        variant.stock,
        variant.reservedStock
      );

    if (
      availableStock <=
      0
    ) {
      throw new BadRequestException(
        "This fragrance is currently out of stock."
      );
    }

    return variant;
  }

  private serializeItem(
    row: CartRecord
  ) {
    const price =
      Number(
        row.variant.price
      );

    const safePrice =
      Number.isFinite(
        price
      )
        ? price
        : 0;

    const availableStock =
      this.availableStock(
        row.variant.stock,
        row.variant.reservedStock
      );

    const canPurchase =
      row.variant.active &&
      row.variant.product.status ===
        "ACTIVE" &&
      availableStock >
        0;

    return {
      id:
        row.id,

      variantId:
        row.variant.id,

      productId:
        row.variant.productId,

      slug:
        row.variant.product.slug,

      name:
        row.variant.product.name,

      shortDescription:
        row.variant.product.shortDescription,

      family:
        row.variant.product.family,

      concentration:
        row.variant.product.concentration,

      size:
        row.variant.size,

      sku:
        row.variant.sku,

      price:
        safePrice,

      quantity:
        row.quantity,

      lineTotal:
        safePrice *
        row.quantity,

      imageUrl:
        row.variant.product
          .images[0]
          ?.url ??
        null,

      stock:
        row.variant.stock,

      reservedStock:
        row.variant.reservedStock,

      availableStock,

      active:
        row.variant.active,

      productStatus:
        row.variant.product.status,

      canPurchase:
        canPurchase &&
        row.quantity <=
          availableStock,

      createdAt:
        row.createdAt,

      updatedAt:
        row.updatedAt,
    };
  }

  private availableStock(
    stock: number,
    reservedStock: number
  ) {
    return Math.max(
      0,
      stock -
        reservedStock
    );
  }

  private stockMessage(
    availableStock: number
  ) {
    if (
      availableStock <=
      0
    ) {
      return "This fragrance is currently out of stock.";
    }

    return `Only ${availableStock} ${
      availableStock ===
      1
        ? "unit is"
        : "units are"
    } currently available.`;
  }

  private getFreeDeliveryThreshold() {
    const configured =
      Number(
        this.config.get<string>(
          "FREE_DELIVERY_THRESHOLD"
        )
      );

    return Number.isFinite(
      configured
    ) &&
      configured >
        0
      ? configured
      : 2500;
  }
}
