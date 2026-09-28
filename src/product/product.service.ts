import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { PrismaService } from "../prisma/prisma.service";

import {
  CreateProductDto,
  ProductAudienceInput,
  ProductStatusInput,
} from "./dto/create-product.dto";

import { UpdateProductDto } from "./dto/update-product.dto";

import {
  AdminProductQueryDto,
  PublicProductQueryDto,
} from "./dto/product-query.dto";

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService
  ) { }

  /* =======================================================
     CREATE PRODUCT
  ======================================================== */

  async create(
    dto: CreateProductDto,
    actorId: string
  ) {
    const slug =
      this.normalizeSlug(dto.slug);

    await this.ensureSlugAvailable(
      slug
    );

    this.validateVariants(
      dto.variants
    );

    const normalizedVariants =
      dto.variants.map(
        (variant) => ({
          size:
            variant.size
              .trim()
              .toUpperCase(),

          price:
            variant.price,

          stock:
            Number.parseInt(
              variant.stock,
              10
            ),

          reservedStock: 0,

          sku:
            variant.sku?.trim()
              ? this.normalizeSku(
                variant.sku
              )
              : this.generateSku(
                slug,
                variant.size
              ),

          active: true,
        })
      );

    await this.ensureSkusAvailable(
      normalizedVariants.map(
        (variant) =>
          variant.sku
      )
    );

    try {
      const product =
        await this.prisma.$transaction(
          async (tx) => {
            const created =
              await tx.product.create({
                data: {
                  name:
                    dto.name.trim(),

                  slug,

                  shortDescription:
                    dto.shortDescription.trim(),

                  story:
                    this.optionalString(
                      dto.story
                    ),

                  family:
                    dto.family.trim(),

                  concentration:
                    dto.concentration.trim(),

                  audience:
                    this.mapAudience(
                      dto.audience
                    ),

                  badge:
                    this.optionalString(
                      dto.badge
                    ),

                  status:
                    this.mapStatus(
                      dto.status
                    ),

                  /* ===============================
                     PRODUCT IMAGES
                  ================================ */

                  images: {
                    create:
                      (
                        dto.images ??
                        []
                      ).map(
                        (
                          image,
                          index
                        ) => ({
                          publicId:
                            image.publicId,

                          url:
                            image.url,

                          position:
                            index,
                        })
                      ),
                  },

                  /* ===============================
                     NOTES
                  ================================ */

                  topNotes:
                    this.cleanArray(
                      dto.notes.top
                    ),

                  heartNotes:
                    this.cleanArray(
                      dto.notes.heart
                    ),

                  baseNotes:
                    this.cleanArray(
                      dto.notes.base
                    ),

                  scentOccasions:
                    this.cleanArray(
                      dto.scentOccasions
                    ),

                  scentMoods:
                    this.cleanArray(
                      dto.scentMoods
                    ),

                  scentPersonalities:
                    this.cleanArray(
                      dto.scentPersonalities
                    ),

                  feeling:
                    this.optionalString(
                      dto.feeling
                    ),

                  longevity:
                    this.optionalString(
                      dto.longevity
                    ),

                  sillage:
                    this.optionalString(
                      dto.sillage
                    ),

                  season:
                    this.optionalString(
                      dto.season
                    ),

                  seoTitle:
                    this.optionalString(
                      dto.seoTitle
                    ),

                  seoDescription:
                    this.optionalString(
                      dto.seoDescription
                    ),

                  /* ===============================
                     VARIANTS
                  ================================ */

                  variants: {
                    create:
                      normalizedVariants,
                  },
                },

                include: {
                  variants: {
                    orderBy: {
                      price: "asc",
                    },
                  },

                  images: {
                    orderBy: {
                      position:
                        "asc",
                    },
                  },
                },
              });

            /* ===============================
               OPENING STOCK MOVEMENTS
            ================================ */

            const movements =
              created.variants
                .filter(
                  (variant) =>
                    variant.stock >
                    0
                )
                .map(
                  (variant) => ({
                    variantId:
                      variant.id,

                    actorId,

                    type:
                      "RESTOCK" as const,

                    quantity:
                      variant.stock,

                    reason:
                      "Opening stock when product was created",
                  })
                );

            if (
              movements.length >
              0
            ) {
              await tx.inventoryMovement.createMany(
                {
                  data:
                    movements,
                }
              );
            }

            return created;
          }
        );

      return this.serializeProduct(
        product
      );
    } catch (error) {
      this.handlePrismaError(
        error
      );
    }
  }

  /* =======================================================
     ADMIN LIST
  ======================================================== */

  async findAllAdmin(
    query: AdminProductQueryDto
  ) {
    const page =
      query.page ?? 1;

    const limit =
      query.limit ?? 20;

    const skip =
      (page - 1) *
      limit;

    const search =
      query.search?.trim();

    const where = {
      ...(query.status && {
        status:
          query.status,
      }),

      ...(query.audience && {
        audience:
          query.audience,
      }),

      ...(query.family && {
        family: {
          equals:
            query.family,

          mode:
            "insensitive" as const,
        },
      }),

      ...(search && {
        OR: [
          {
            name: {
              contains:
                search,

              mode:
                "insensitive" as const,
            },
          },

          {
            slug: {
              contains:
                search,

              mode:
                "insensitive" as const,
            },
          },

          {
            family: {
              contains:
                search,

              mode:
                "insensitive" as const,
            },
          },

          {
            variants: {
              some: {
                sku: {
                  contains:
                    search,

                  mode:
                    "insensitive" as const,
                },
              },
            },
          },
        ],
      }),
    };

    const [
      products,
      total,
    ] =
      await Promise.all([
        this.prisma.product.findMany(
          {
            where,

            include: {
              variants: {
                orderBy: {
                  price:
                    "asc",
                },
              },

              images: {
                orderBy: {
                  position:
                    "asc",
                },
              },
            },

            orderBy: {
              createdAt:
                "desc",
            },

            skip,
            take:
              limit,
          }
        ),

        this.prisma.product.count(
          {
            where,
          }
        ),
      ]);

    return {
      data:
        products.map(
          (product) =>
            this.serializeProduct(
              product
            )
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

  /* =======================================================
     ADMIN PRODUCT DETAIL
  ======================================================== */

  async findOneAdmin(
    productId: string
  ) {
    const product =
      await this.prisma.product.findUnique(
        {
          where: {
            id:
              productId,
          },

          include: {
            variants: {
              orderBy: {
                price:
                  "asc",
              },
            },

            images: {
              orderBy: {
                position:
                  "asc",
              },
            },
          },
        }
      );

    if (!product) {
      throw new NotFoundException(
        "Product not found."
      );
    }

    return this.serializeProduct(
      product
    );
  }

  /* =======================================================
     PUBLIC PRODUCT LIST
  ======================================================== */

  async findAllPublic(
    query: PublicProductQueryDto
  ) {
    const page =
      query.page ?? 1;

    const limit =
      query.limit ?? 24;

    const skip =
      (page - 1) *
      limit;

    const search =
      query.search?.trim();

    const where = {
  status:
    "ACTIVE" as const,

  ...(query.audience && {
    audience:
      query.audience,
  }),

  ...(query.family && {
    family: {
      equals:
        query.family,

      mode:
        "insensitive" as const,
    },
  }),

  ...(query.mood && {
    scentMoods: {
      has:
        query.mood,
    },
  }),

  ...(search && {
    OR: [
      {
        name: {
          contains:
            search,

          mode:
            "insensitive" as const,
        },
      },

      {
        family: {
          contains:
            search,

          mode:
            "insensitive" as const,
        },
      },

      {
        shortDescription: {
          contains:
            search,

          mode:
            "insensitive" as const,
        },
      },
    ],
  }),
};

    const [
      products,
      total,
    ] =
      await Promise.all([
        this.prisma.product.findMany(
          {
            where,

            include: {
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

              images: {
                orderBy: {
                  position:
                    "asc",
                },
              },
            },

            orderBy: {
              createdAt:
                "desc",
            },

            skip,
            take:
              limit,
          }
        ),

        this.prisma.product.count(
          {
            where,
          }
        ),
      ]);

    return {
      data:
        products.map(
          (product) =>
            this.serializeProduct(
              product
            )
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

  /* =======================================================
     PUBLIC PRODUCT DETAIL
  ======================================================== */

  async findPublicBySlug(
    slug: string
  ) {
    const product =
      await this.prisma.product.findFirst(
        {
          where: {
            slug:
              this.normalizeSlug(
                slug
              ),

            status:
              "ACTIVE",
          },

          include: {
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

            images: {
              orderBy: {
                position:
                  "asc",
              },
            },
          },
        }
      );

    if (!product) {
      throw new NotFoundException(
        "Fragrance not found."
      );
    }

    return this.serializeProduct(
      product
    );
  }

  /* =======================================================
     UPDATE PRODUCT
  ======================================================== */

  async update(
    productId: string,
    dto: UpdateProductDto,
    actorId: string
  ) {
    const existing =
      await this.prisma.product.findUnique(
        {
          where: {
            id:
              productId,
          },

          include: {
            variants:
              true,

            images: {
              orderBy: {
                position:
                  "asc",
              },
            },
          },
        }
      );

    if (!existing) {
      throw new NotFoundException(
        "Product not found."
      );
    }

    let slug =
      existing.slug;

    if (dto.slug) {
      slug =
        this.normalizeSlug(
          dto.slug
        );

      if (
        slug !==
        existing.slug
      ) {
        await this.ensureSlugAvailable(
          slug,
          productId
        );
      }
    }

    if (dto.variants) {
      this.validateVariants(
        dto.variants
      );

      /* ===============================
         CHECK DUPLICATE SKUS IN PAYLOAD
      ================================ */

      const normalizedSkus =
        dto.variants
          .map(
            (variant) =>
              variant.sku?.trim()
                ? this.normalizeSku(
                  variant.sku
                )
                : this.generateSku(
                  slug,
                  variant.size
                )
          );

      if (
        new Set(
          normalizedSkus
        ).size !==
        normalizedSkus.length
      ) {
        throw new BadRequestException(
          "Each product variant must have a unique SKU."
        );
      }
    }

    try {
      const result =
        await this.prisma.$transaction(
          async (tx) => {
            /* ===============================
               PRODUCT DATA
            ================================ */

            await tx.product.update({
              where: {
                id:
                  productId,
              },

              data: {
                ...(dto.name !==
                  undefined && {
                  name:
                    dto.name.trim(),
                }),

                ...(dto.slug !==
                  undefined && {
                  slug,
                }),

                ...(dto.shortDescription !==
                  undefined && {
                  shortDescription:
                    dto.shortDescription.trim(),
                }),

                ...(dto.story !==
                  undefined && {
                  story:
                    this.optionalString(
                      dto.story
                    ),
                }),

                ...(dto.family !==
                  undefined && {
                  family:
                    dto.family.trim(),
                }),

                ...(dto.concentration !==
                  undefined && {
                  concentration:
                    dto.concentration.trim(),
                }),

                ...(dto.audience !==
                  undefined && {
                  audience:
                    this.mapAudience(
                      dto.audience
                    ),
                }),

                ...(dto.badge !==
                  undefined && {
                  badge:
                    this.optionalString(
                      dto.badge
                    ),
                }),

                ...(dto.status !==
                  undefined && {
                  status:
                    this.mapStatus(
                      dto.status
                    ),
                }),

                /*
                 * Images are intentionally NOT
                 * updated here anymore.
                 *
                 * ProductImage has its own
                 * endpoints.
                 */

                ...(dto.notes !==
                  undefined && {
                  topNotes:
                    this.cleanArray(
                      dto.notes.top
                    ),

                  heartNotes:
                    this.cleanArray(
                      dto.notes.heart
                    ),

                  baseNotes:
                    this.cleanArray(
                      dto.notes.base
                    ),
                }),

                ...(dto.scentOccasions !== undefined && {
                  scentOccasions:
                    this.cleanArray(
                      dto.scentOccasions
                    ),
                }),

                ...(dto.scentMoods !== undefined && {
                  scentMoods:
                    this.cleanArray(
                      dto.scentMoods
                    ),
                }),

                ...(dto.scentPersonalities !== undefined && {
                  scentPersonalities:
                    this.cleanArray(
                      dto.scentPersonalities
                    ),
                }),

                ...(dto.feeling !==
                  undefined && {
                  feeling:
                    this.optionalString(
                      dto.feeling
                    ),
                }),

                ...(dto.longevity !==
                  undefined && {
                  longevity:
                    this.optionalString(
                      dto.longevity
                    ),
                }),

                ...(dto.sillage !==
                  undefined && {
                  sillage:
                    this.optionalString(
                      dto.sillage
                    ),
                }),

                ...(dto.season !==
                  undefined && {
                  season:
                    this.optionalString(
                      dto.season
                    ),
                }),

                ...(dto.seoTitle !==
                  undefined && {
                  seoTitle:
                    this.optionalString(
                      dto.seoTitle
                    ),
                }),

                ...(dto.seoDescription !==
                  undefined && {
                  seoDescription:
                    this.optionalString(
                      dto.seoDescription
                    ),
                }),
              },
            });

            /* ===============================
               VARIANTS
            ================================ */

            if (dto.variants) {
              const suppliedIds =
                new Set(
                  dto.variants
                    .map(
                      (variant) =>
                        variant.id
                    )
                    .filter(
                      (
                        id
                      ): id is string =>
                        Boolean(
                          id
                        )
                    )
                );

              for (
                const variant of
                dto.variants
              ) {
                const stock =
                  Number.parseInt(
                    variant.stock,
                    10
                  );

                const sku =
                  variant.sku?.trim()
                    ? this.normalizeSku(
                      variant.sku
                    )
                    : this.generateSku(
                      slug,
                      variant.size
                    );

                /* ===========================
                   EXISTING VARIANT
                ============================ */

                if (
                  variant.id
                ) {
                  const oldVariant =
                    existing.variants.find(
                      (item) =>
                        item.id ===
                        variant.id
                    );

                  if (
                    !oldVariant
                  ) {
                    throw new BadRequestException(
                      `Variant ${variant.id} does not belong to this product.`
                    );
                  }

                  const duplicateSku =
                    await tx.productVariant.findFirst(
                      {
                        where: {
                          sku,

                          id: {
                            not:
                              variant.id,
                          },
                        },

                        select: {
                          id:
                            true,

                          sku:
                            true,
                        },
                      }
                    );

                  if (
                    duplicateSku
                  ) {
                    throw new ConflictException(
                      `SKU ${sku} already exists.`
                    );
                  }

                  const difference =
                    stock -
                    oldVariant.stock;

                  await tx.productVariant.update(
                    {
                      where: {
                        id:
                          variant.id,
                      },

                      data: {
                        size:
                          variant.size
                            .trim()
                            .toUpperCase(),

                        price:
                          variant.price,

                        sku,

                        stock,

                        active:
                          true,
                      },
                    }
                  );

                  if (
                    difference !==
                    0
                  ) {
                    await tx.inventoryMovement.create(
                      {
                        data: {
                          variantId:
                            variant.id,

                          actorId,

                          type:
                            "ADJUSTMENT",

                          quantity:
                            difference,

                          reason:
                            "Stock changed while editing product",
                        },
                      }
                    );
                  }
                } else {
                  /* =========================
                     NEW VARIANT
                  ========================== */

                  const duplicateSku =
                    await tx.productVariant.findUnique(
                      {
                        where: {
                          sku,
                        },

                        select: {
                          id:
                            true,
                        },
                      }
                    );

                  if (
                    duplicateSku
                  ) {
                    throw new ConflictException(
                      `SKU ${sku} already exists.`
                    );
                  }

                  const createdVariant =
                    await tx.productVariant.create(
                      {
                        data: {
                          productId,

                          size:
                            variant.size
                              .trim()
                              .toUpperCase(),

                          price:
                            variant.price,

                          stock,

                          reservedStock:
                            0,

                          sku,

                          active:
                            true,
                        },
                      }
                    );

                  if (
                    stock > 0
                  ) {
                    await tx.inventoryMovement.create(
                      {
                        data: {
                          variantId:
                            createdVariant.id,

                          actorId,

                          type:
                            "RESTOCK",

                          quantity:
                            stock,

                          reason:
                            "Opening stock for newly added variant",
                        },
                      }
                    );
                  }
                }
              }

              /* ===============================
                 DISABLE REMOVED VARIANTS
              ================================ */

              const variantIdsToDisable =
                existing.variants
                  .filter(
                    (variant) =>
                      !suppliedIds.has(
                        variant.id
                      )
                  )
                  .map(
                    (variant) =>
                      variant.id
                  );

              if (
                variantIdsToDisable.length >
                0
              ) {
                await tx.productVariant.updateMany(
                  {
                    where: {
                      id: {
                        in:
                          variantIdsToDisable,
                      },
                    },

                    data: {
                      active:
                        false,
                    },
                  }
                );
              }
            }

            /* ===============================
               RETURN UPDATED PRODUCT
            ================================ */

            return tx.product.findUnique(
              {
                where: {
                  id:
                    productId,
                },

                include: {
                  variants: {
                    orderBy: {
                      price:
                        "asc",
                    },
                  },

                  images: {
                    orderBy: {
                      position:
                        "asc",
                    },
                  },
                },
              }
            );
          }
        );

      if (!result) {
        throw new NotFoundException(
          "Product not found."
        );
      }

      return this.serializeProduct(
        result
      );
    } catch (error) {
      this.handlePrismaError(
        error
      );
    }
  }

  /* =======================================================
     ARCHIVE PRODUCT
  ======================================================== */

  async archive(
    productId: string
  ) {
    const product =
      await this.prisma.product.findUnique(
        {
          where: {
            id:
              productId,
          },

          select: {
            id:
              true,
          },
        }
      );

    if (!product) {
      throw new NotFoundException(
        "Product not found."
      );
    }

    await this.prisma.$transaction(
      [
        this.prisma.product.update(
          {
            where: {
              id:
                productId,
            },

            data: {
              status:
                "ARCHIVED",
            },
          }
        ),

        this.prisma.productVariant.updateMany(
          {
            where: {
              productId,
            },

            data: {
              active:
                false,
            },
          }
        ),
      ]
    );

    return {
      message:
        "Product archived successfully.",
    };
  }

  /* =======================================================
     ADD PRODUCT IMAGE
  ======================================================== */

  async addImage(
    productId: string,
    image: {
      publicId: string;
      url: string;
    }
  ) {
    const product =
      await this.prisma.product.findUnique(
        {
          where: {
            id:
              productId,
          },

          select: {
            id:
              true,

            _count: {
              select: {
                images:
                  true,
              },
            },
          },
        }
      );

    if (!product) {
      throw new NotFoundException(
        "Product not found."
      );
    }

    if (
      product._count.images >=
      10
    ) {
      throw new BadRequestException(
        "A product can have a maximum of 10 images."
      );
    }

    const existingImage =
      await this.prisma.productImage.findUnique(
        {
          where: {
            publicId:
              image.publicId,
          },

          select: {
            id:
              true,
          },
        }
      );

    if (existingImage) {
      throw new ConflictException(
        "This Cloudinary image is already attached to a product."
      );
    }

    const lastImage =
      await this.prisma.productImage.findFirst(
        {
          where: {
            productId,
          },

          orderBy: {
            position:
              "desc",
          },

          select: {
            position:
              true,
          },
        }
      );

    try {
      return await this.prisma.productImage.create(
        {
          data: {
            productId,

            publicId:
              image.publicId.trim(),

            url:
              image.url.trim(),

            position:
              (
                lastImage?.position ??
                -1
              ) + 1,
          },
        }
      );
    } catch (error) {
      this.handlePrismaError(
        error
      );
    }
  }

  /* =======================================================
     DELETE PRODUCT IMAGE
  ======================================================== */

  async deleteImage(
    productId: string,
    imageId: string
  ) {
    const image =
      await this.prisma.productImage.findFirst(
        {
          where: {
            id:
              imageId,

            productId,
          },
        }
      );

    if (!image) {
      throw new NotFoundException(
        "Product image not found."
      );
    }

    /*
     * Delete actual Cloudinary
     * asset first.
     */
    const cloudinaryResult =
      await this.cloudinaryService.deleteImage(
        image.publicId
      );

    if (
      cloudinaryResult.result !==
      "ok" &&
      cloudinaryResult.result !==
      "not found"
    ) {
      throw new BadRequestException(
        "Cloudinary did not confirm image deletion."
      );
    }

    /*
     * Delete corresponding Neon
     * ProductImage row.
     */
    await this.prisma.productImage.delete(
      {
        where: {
          id:
            image.id,
        },
      }
    );

    /*
     * Recalculate ordering so
     * positions always remain:
     *
     * 0, 1, 2, 3...
     */
    const remaining =
      await this.prisma.productImage.findMany(
        {
          where: {
            productId,
          },

          orderBy: {
            position:
              "asc",
          },

          select: {
            id:
              true,
          },
        }
      );

    if (
      remaining.length >
      0
    ) {
      await this.prisma.$transaction(
        remaining.map(
          (
            item,
            index
          ) =>
            this.prisma.productImage.update(
              {
                where: {
                  id:
                    item.id,
                },

                data: {
                  position:
                    index,
                },
              }
            )
        )
      );
    }

    return {
      message:
        "Product image deleted successfully.",
    };
  }

  /* =======================================================
     HELPERS
  ======================================================== */

  private async ensureSlugAvailable(
    slug: string,
    ignoreProductId?: string
  ) {
    const existing =
      await this.prisma.product.findFirst(
        {
          where: {
            slug,

            ...(ignoreProductId && {
              id: {
                not:
                  ignoreProductId,
              },
            }),
          },

          select: {
            id:
              true,
          },
        }
      );

    if (existing) {
      throw new ConflictException(
        "A product with this slug already exists."
      );
    }
  }

  /* =======================================================
     SKU AVAILABILITY
  ======================================================== */

  private async ensureSkusAvailable(
    skus: string[]
  ) {
    if (
      new Set(
        skus
      ).size !==
      skus.length
    ) {
      throw new BadRequestException(
        "Each product variant must have a unique SKU."
      );
    }

    const existing =
      await this.prisma.productVariant.findFirst(
        {
          where: {
            sku: {
              in:
                skus,
            },
          },

          select: {
            sku:
              true,
          },
        }
      );

    if (existing) {
      throw new ConflictException(
        `SKU ${existing.sku} already exists.`
      );
    }
  }

  /* =======================================================
     VARIANT VALIDATION
  ======================================================== */

  private validateVariants(
    variants: {
      size: string;
      price: string;
      stock: string;
      sku?: string;
    }[]
  ) {
    if (!variants.length) {
      throw new BadRequestException(
        "Add at least one product variant."
      );
    }

    const sizes =
      variants.map(
        (variant) =>
          variant.size
            .trim()
            .toUpperCase()
      );

    if (
      new Set(
        sizes
      ).size !==
      sizes.length
    ) {
      throw new BadRequestException(
        "A product cannot contain duplicate sizes."
      );
    }

    for (
      const variant of
      variants
    ) {
      const price =
        Number(
          variant.price
        );

      const stock =
        Number(
          variant.stock
        );

      if (
        !Number.isFinite(
          price
        ) ||
        price <= 0
      ) {
        throw new BadRequestException(
          "Variant price must be greater than zero."
        );
      }

      if (
        !Number.isInteger(
          stock
        ) ||
        stock < 0
      ) {
        throw new BadRequestException(
          "Variant stock must be zero or greater."
        );
      }
    }
  }

  /* =======================================================
     AUDIENCE MAPPING
  ======================================================== */

  private mapAudience(
    audience: ProductAudienceInput
  ):
    | "WOMEN"
    | "MEN"
    | "UNISEX" {
    const values = {
      Women:
        "WOMEN",

      Men:
        "MEN",

      Unisex:
        "UNISEX",
    } as const;

    return values[
      audience
    ];
  }

  /* =======================================================
     STATUS MAPPING
  ======================================================== */

  private mapStatus(
    status: ProductStatusInput
  ):
    | "DRAFT"
    | "ACTIVE" {
    return status ===
      "Active"
      ? "ACTIVE"
      : "DRAFT";
  }

  /* =======================================================
     NORMALIZE SLUG
  ======================================================== */

  private normalizeSlug(
    value: string
  ) {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );
  }

  /* =======================================================
     NORMALIZE SKU
  ======================================================== */

  private normalizeSku(
    value: string
  ) {
    return value
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );
  }

  /* =======================================================
     GENERATE SKU
  ======================================================== */

  private generateSku(
    slug: string,
    size: string
  ) {
    const productPart =
      slug
        .replace(
          /-/g,
          ""
        )
        .slice(
          0,
          12
        )
        .toUpperCase();

    const sizePart =
      size
        .toUpperCase()
        .replace(
          /[^A-Z0-9]+/g,
          ""
        );

    return `ELAN-${productPart}-${sizePart}`;
  }

  /* =======================================================
     OPTIONAL STRING
  ======================================================== */

  private optionalString(
    value:
      | string
      | undefined
  ) {
    const result =
      value?.trim();

    return result || null;
  }

  /* =======================================================
     CLEAN ARRAY
  ======================================================== */

  private cleanArray(
    values: string[]
  ) {
    return [
      ...new Set(
        values
          .map(
            (value) =>
              value.trim()
          )
          .filter(
            Boolean
          )
      ),
    ];
  }

  /* =======================================================
     SERIALIZE PRODUCT
  ======================================================== */

  private serializeProduct<
    T extends {
      variants?: Array<{
        price:
        unknown;

        stock:
        number;

        reservedStock?:
        number;

        [key: string]:
        unknown;
      }>;

      images?: Array<{
        id:
        string;

        productId:
        string;

        publicId:
        string;

        url:
        string;

        position:
        number;

        createdAt:
        Date;

        updatedAt:
        Date;

        [key: string]:
        unknown;
      }>;

      [key: string]:
      unknown;
    },
  >(product: T) {
    const variants =
      product.variants?.map(
        (variant) => ({
          ...variant,

          /*
           * Prisma Decimal ->
           * JavaScript number.
           */
          price:
            Number(
              variant.price
            ),
        })
      ) ?? [];

    const images =
      product.images?.map(
        (image) => ({
          ...image,
        })
      ) ?? [];

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
      totalStock -
      totalReservedStock;

    const startingPrice =
      variants.length >
        0
        ? Math.min(
          ...variants.map(
            (
              variant
            ) =>
              variant.price
          )
        )
        : null;

    return {
      ...product,

      images,

      variants,

      totalStock,

      totalReservedStock,

      availableStock,

      startingPrice,
    };
  }

  /* =======================================================
     PRISMA ERROR HANDLER
  ======================================================== */

  private handlePrismaError(
    error: unknown
  ): never {
    if (
      typeof error ===
      "object" &&
      error !== null &&
      "code" in
      error
    ) {
      const prismaError =
        error as {
          code?: string;
        };

      if (
        prismaError.code ===
        "P2002"
      ) {
        throw new ConflictException(
          "A product with one of these unique values already exists."
        );
      }

      if (
        prismaError.code ===
        "P2025"
      ) {
        throw new NotFoundException(
          "The requested product record was not found."
        );
      }
    }

    throw error;
  }
}