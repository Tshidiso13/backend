import {
  Injectable,
} from "@nestjs/common";

import {
  Prisma,
} from "../generated/prisma/client";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  SearchProductsQueryDto,
} from "./dto/search-products-query.dto";

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  async searchProducts(
    query:
      SearchProductsQueryDto
  ) {
    const term =
      normalizeSearchText(
        query.q ??
          ""
      );

    const terms =
      term
        .split(" ")
        .filter(
          Boolean
        );

    const family =
      query.family
        ?.trim();

    const where:
      Prisma.ProductWhereInput =
      {
        status:
          "ACTIVE",

        ...(family
          ? {
              family: {
                equals:
                  family,
                mode:
                  "insensitive",
              },
            }
          : {}),

        ...(query.audience
          ? {
              audience:
                query.audience,
            }
          : {}),
      };

    /*
     * This is real catalogue data from PostgreSQL.
     *
     * We deliberately load only ACTIVE products and ACTIVE
     * variants. Search matching happens in Nest so array
     * fields such as notes, moods, occasions and personality
     * can be searched case-insensitively as well.
     *
     * For a perfume catalogue this remains simple and fast,
     * while PostgreSQL remains the source of truth.
     */
    const [
      products,
      familyRows,
    ] =
      await Promise.all([
        this.prisma.product.findMany(
          {
            where,

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

                orderBy: [
                  {
                    price:
                      "asc",
                  },
                  {
                    size:
                      "asc",
                  },
                ],
              },
            },

            orderBy: {
              createdAt:
                "desc",
            },
          }
        ),

        this.prisma.product.findMany(
          {
            where: {
              status:
                "ACTIVE",
            },

            select: {
              family:
                true,
            },

            distinct: [
              "family",
            ],

            orderBy: {
              family:
                "asc",
            },
          }
        ),
      ]);

    let matched =
      terms.length ===
      0
        ? products
        : products.filter(
            (
              product
            ) => {
              const searchable =
                normalizeSearchText(
                  [
                    product.name,
                    product.slug,
                    product.badge,
                    product.family,
                    product.concentration,
                    product.audience,
                    product.shortDescription,
                    product.story,
                    product.feeling,
                    product.season,
                    ...product.topNotes,
                    ...product.heartNotes,
                    ...product.baseNotes,
                    ...product.scentMoods,
                    ...product.scentOccasions,
                    ...product.scentPersonalities,
                  ]
                    .filter(
                      Boolean
                    )
                    .join(
                      " "
                    )
                );

              /*
               * Every word must match somewhere.
               *
               * "fresh clean" can therefore match separate
               * mood/note fields on the same product.
               */
              return terms.every(
                (
                  word
                ) =>
                  searchable.includes(
                    word
                  )
              );
            }
          );

    const mapped =
      matched.map(
        (
          product
        ) =>
          this.toSearchProduct(
            product
          )
      );

    if (
      query.sort ===
      "price-low"
    ) {
      mapped.sort(
        comparePriceAscending
      );
    } else if (
      query.sort ===
      "price-high"
    ) {
      mapped.sort(
        comparePriceDescending
      );
    } else if (
      query.sort ===
      "name"
    ) {
      mapped.sort(
        (
          a,
          b
        ) =>
          a.name.localeCompare(
            b.name
          )
      );
    }

    const limited =
      mapped.slice(
        0,
        query.limit
      );

    return {
      data:
        limited,

      total:
        mapped.length,

      facets: {
        families:
          familyRows
            .map(
              (
                row
              ) =>
                row.family
                  ?.trim()
            )
            .filter(
              (
                value
              ): value is string =>
                Boolean(
                  value
                )
            ),
      },
    };
  }

  private toSearchProduct(
    product: {
      id: string;
      slug: string;
      name: string;
      badge: string | null;
      family: string;
      concentration: string;
      audience:
        "WOMEN"
        | "MEN"
        | "UNISEX";
      shortDescription: string | null;
      story: string | null;
      feeling: string | null;
      season: string | null;
      topNotes: string[];
      heartNotes: string[];
      baseNotes: string[];
      scentMoods: string[];
      scentOccasions: string[];
      scentPersonalities: string[];
      createdAt: Date;
      images: Array<{
        id: string;
        publicId: string;
        url: string;
        position: number;
      }>;
      variants: Array<{
        id: string;
        sku: string;
        size: string;
        price:
          Prisma.Decimal;
        stock: number;
        reservedStock: number;
        threshold: number;
        active: boolean;
      }>;
    }
  ) {
    const variants =
      product.variants.map(
        (
          variant
        ) => {
          const stock =
            Number(
              variant.stock
            );

          const reservedStock =
            Number(
              variant.reservedStock
            );

          return {
            id:
              variant.id,

            sku:
              variant.sku,

            size:
              variant.size,

            price:
              Number(
                variant.price
              ),

            stock,

            reservedStock,

            availableStock:
              Math.max(
                0,
                stock -
                  reservedStock
              ),

            threshold:
              variant.threshold,

            active:
              variant.active,
          };
        }
      );

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
      id:
        product.id,

      slug:
        product.slug,

      name:
        product.name,

      badge:
        product.badge,

      family:
        product.family,

      concentration:
        product.concentration,

      audience:
        product.audience,

      shortDescription:
        product.shortDescription,

      story:
        product.story,

      feeling:
        product.feeling,

      season:
        product.season,

      topNotes:
        product.topNotes,

      heartNotes:
        product.heartNotes,

      baseNotes:
        product.baseNotes,

      scentMoods:
        product.scentMoods,

      scentOccasions:
        product.scentOccasions,

      scentPersonalities:
        product.scentPersonalities,

      startingPrice,

      imageUrl:
        product.images[0]
          ?.url ??
        null,

      images:
        product.images,

      variants,

      createdAt:
        product.createdAt,
    };
  }
}

function normalizeSearchText(
  value: string
) {
  return value
    .normalize(
      "NFD"
    )
    .replace(
      /\p{Diacritic}/gu,
      ""
    )
    .toLowerCase()
    .replace(
      /[-_&/]+/g,
      " "
    )
    .replace(
      /[^\p{L}\p{N}\s]+/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function comparePriceAscending(
  a: {
    startingPrice:
      number | null;
  },
  b: {
    startingPrice:
      number | null;
  }
) {
  if (
    a.startingPrice ===
      null &&
    b.startingPrice ===
      null
  ) {
    return 0;
  }

  if (
    a.startingPrice ===
    null
  ) {
    return 1;
  }

  if (
    b.startingPrice ===
    null
  ) {
    return -1;
  }

  return (
    a.startingPrice -
    b.startingPrice
  );
}

function comparePriceDescending(
  a: {
    startingPrice:
      number | null;
  },
  b: {
    startingPrice:
      number | null;
  }
) {
  if (
    a.startingPrice ===
      null &&
    b.startingPrice ===
      null
  ) {
    return 0;
  }

  if (
    a.startingPrice ===
    null
  ) {
    return 1;
  }

  if (
    b.startingPrice ===
    null
  ) {
    return -1;
  }

  return (
    b.startingPrice -
    a.startingPrice
  );
}
