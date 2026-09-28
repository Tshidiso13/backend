import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  PrismaService,
} from "../prisma/prisma.service";

type WishlistProductRecord = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  story: string | null;
  family: string;
  concentration: string;

  audience:
    | "WOMEN"
    | "MEN"
    | "UNISEX";

  badge: string | null;

  status:
    | "DRAFT"
    | "ACTIVE"
    | "ARCHIVED";

  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];

  feeling: string | null;
  longevity: string | null;
  sillage: string | null;
  season: string | null;

  scentOccasions: string[];
  scentMoods: string[];
  scentPersonalities: string[];

  seoTitle: string | null;
  seoDescription: string | null;

  createdAt: Date;
  updatedAt: Date;

  images: Array<{
    id: string;
    productId: string;
    publicId: string;
    url: string;
    position: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

  variants: Array<{
    id: string;
    productId: string;
    size: string;
    sku: string;
    price: unknown;
    stock: number;
    reservedStock: number;
    threshold: number;
    active: boolean;
  }>;
};

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  /* =======================================================
     COUNT
  ======================================================== */

  async count(
    userId: string
  ) {
    const count =
      await this.prisma.wishlistItem.count(
        {
          where: {
            userId,

            product: {
              status:
                "ACTIVE",
            },
          },
        }
      );

    return {
      count,
    };
  }

  /* =======================================================
     LIST
  ======================================================== */

  async findAll(
    userId: string
  ) {
    const items =
      await this.prisma.wishlistItem.findMany(
        {
          where: {
            userId,

            product: {
              status:
                "ACTIVE",
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
                },

                variants: {
                  where: {
                    active:
                      true,
                  },

                  orderBy: {
                    price:
                      "asc",
                  },
                },
              },
            },
          },

          orderBy: {
            createdAt:
              "desc",
          },
        }
      );

    return {
      data:
        items.map(
          (item) => ({
            id:
              item.id,

            createdAt:
              item.createdAt,

            product:
              this.serializeProduct(
                item.product as WishlistProductRecord
              ),
          })
        ),

      total:
        items.length,
    };
  }

  /* =======================================================
     ADD
  ======================================================== */

  async add(
    userId: string,
    productId: string
  ) {
    await this.ensureProductIsAvailable(
      productId
    );

    const item =
      await this.prisma.wishlistItem.upsert(
        {
          where: {
            userId_productId: {
              userId,
              productId,
            },
          },

          update: {},

          create: {
            userId,
            productId,
          },

          include: {
            product: {
              include: {
                images: {
                  orderBy: {
                    position:
                      "asc",
                  },
                },

                variants: {
                  where: {
                    active:
                      true,
                  },

                  orderBy: {
                    price:
                      "asc",
                  },
                },
              },
            },
          },
        }
      );

    return {
      message:
        "Fragrance added to wishlist.",

      item: {
        id:
          item.id,

        createdAt:
          item.createdAt,

        product:
          this.serializeProduct(
            item.product as WishlistProductRecord
          ),
      },
    };
  }

  /* =======================================================
     REMOVE
  ======================================================== */

  async remove(
    userId: string,
    productId: string
  ) {
    await this.prisma.wishlistItem.deleteMany(
      {
        where: {
          userId,
          productId,
        },
      }
    );

    return {
      message:
        "Fragrance removed from wishlist.",
    };
  }

  /* =======================================================
     SYNC LEGACY LOCAL WISHLIST
  ======================================================== */

  async sync(
    userId: string,
    productIds: string[]
  ) {
    const uniqueIds = [
      ...new Set(
        productIds
          .map(
            (value) =>
              value.trim()
          )
          .filter(
            Boolean
          )
      ),
    ];

    if (
      uniqueIds.length >
      0
    ) {
      const products =
        await this.prisma.product.findMany(
          {
            where: {
              id: {
                in:
                  uniqueIds,
              },

              status:
                "ACTIVE",
            },

            select: {
              id:
                true,
            },
          }
        );

      if (
        products.length >
        0
      ) {
        await this.prisma.wishlistItem.createMany(
          {
            data:
              products.map(
                (product) => ({
                  userId,
                  productId:
                    product.id,
                })
              ),

            skipDuplicates:
              true,
          }
        );
      }
    }

    return this.findAll(
      userId
    );
  }

  /* =======================================================
     HELPERS
  ======================================================== */

  private async ensureProductIsAvailable(
    productId: string
  ) {
    const product =
      await this.prisma.product.findFirst(
        {
          where: {
            id:
              productId,

            status:
              "ACTIVE",
          },

          select: {
            id:
              true,
          },
        }
      );

    if (!product) {
      throw new NotFoundException(
        "Fragrance not found or is not available."
      );
    }
  }

  private serializeProduct(
    product: WishlistProductRecord
  ) {
    const variants =
      product.variants.map(
        (variant) => ({
          ...variant,

          price:
            Number(
              variant.price
            ),
        })
      );

    const totalStock =
      variants.reduce(
        (
          total,
          variant
        ) =>
          total +
          variant.stock,
        0
      );

    const totalReservedStock =
      variants.reduce(
        (
          total,
          variant
        ) =>
          total +
          (
            variant.reservedStock ??
            0
          ),
        0
      );

    const availableStock =
      Math.max(
        0,
        totalStock -
          totalReservedStock
      );

    const startingPrice =
      variants.length >
      0
        ? Math.min(
            ...variants.map(
              (variant) =>
                variant.price
            )
          )
        : null;

    return {
      ...product,
      variants,
      totalStock,
      totalReservedStock,
      availableStock,
      startingPrice,
    };
  }
}
