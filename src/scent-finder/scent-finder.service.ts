import {
  Injectable,
} from "@nestjs/common";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  ScentFinderDto,
  type ScentBudget,
  type ScentMood,
  type ScentOccasion,
  type ScentPersonality,
} from "./dto/scent-finder.dto";

type ProductWithRelations =
  Awaited<
    ReturnType<
      ScentFinderService["loadProducts"]
    >
  >[number];

type MatchResult = {
  score: number;
  reasons: string[];
  matches: {
    occasion: boolean;
    mood: boolean;
    personality: boolean;
    budget: boolean;
  };
  qualifies: boolean;
};

@Injectable()
export class ScentFinderService {
  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  async recommend(
    dto: ScentFinderDto
  ) {
    const limit =
      dto.limit ?? 3;

    const products =
      await this.loadProducts();

    const matched =
      products
        .filter((product) =>
          this.hasPurchasableVariant(
            product
          )
        )
        .map((product) => {
          const match =
            this.matchProduct(
              product,
              dto
            );

          return {
            product:
              this.toPublicProduct(
                product
              ),
            score:
              match.score,
            reasons:
              match.reasons,
            matches:
              match.matches,
            qualifies:
              match.qualifies,
          };
        })
        .filter(
          (item) =>
            item.qualifies
        )
        .sort((a, b) => {
          if (
            b.score !==
            a.score
          ) {
            return (
              b.score -
              a.score
            );
          }

          const aPrice =
            a.product.startingPrice ??
            Number.POSITIVE_INFINITY;

          const bPrice =
            b.product.startingPrice ??
            Number.POSITIVE_INFINITY;

          if (
            aPrice !==
            bPrice
          ) {
            return (
              aPrice -
              bPrice
            );
          }

          return (
            new Date(
              b.product.createdAt
            ).getTime() -
            new Date(
              a.product.createdAt
            ).getTime()
          );
        });

    const recommendations =
      matched
        .slice(
          0,
          limit
        )
        .map(
          ({
            qualifies: _qualifies,
            ...item
          }) => item
        );

    return {
      data:
        recommendations,

      meta: {
        totalCandidates:
          products.length,

        matchedCandidates:
          matched.length,

        returned:
          recommendations.length,

        answers: {
          occasion:
            dto.occasion ??
            null,
          mood:
            dto.mood ??
            null,
          personality:
            dto.personality ??
            null,
          budget:
            dto.budget ??
            null,
        },
      },
    };
  }

  async loadProducts() {
    return this.prisma.product.findMany({
      where: {
        status:
          "ACTIVE",
      },

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

      orderBy: {
        createdAt:
          "desc",
      },

      take: 100,
    });
  }

  private matchProduct(
    product: ProductWithRelations,
    answers: ScentFinderDto
  ): MatchResult {
    const occasionMatch =
      !answers.occasion ||
      product.scentOccasions.includes(
        answers.occasion
      );

    const moodMatch =
      !answers.mood ||
      product.scentMoods.includes(
        answers.mood
      );

    const personalityMatch =
      !answers.personality ||
      product.scentPersonalities.includes(
        answers.personality
      );

    const startingPrice =
      this.getStartingPrice(
        product
      );

    const budgetMatch =
      !answers.budget ||
      answers.budget ===
        "any" ||
      (
        startingPrice !==
          null &&
        this.matchesBudget(
          startingPrice,
          answers.budget
        )
      );

    /*
     * STRICT MATCHING:
     * every selected answer must be supported by the
     * product's admin-configured Scent Finder profile.
     */
    const qualifies =
      occasionMatch &&
      moodMatch &&
      personalityMatch &&
      budgetMatch;

    let score = 0;

    if (
      answers.occasion &&
      occasionMatch
    ) {
      score += 3;
    }

    if (
      answers.mood &&
      moodMatch
    ) {
      score += 4;
    }

    if (
      answers.personality &&
      personalityMatch
    ) {
      score += 3;
    }

    if (
      answers.budget &&
      budgetMatch
    ) {
      score +=
        answers.budget ===
        "any"
          ? 1
          : 4;
    }

    const reasons: string[] = [];

    if (
      answers.occasion &&
      occasionMatch
    ) {
      reasons.push(
        this.getOccasionReason(
          answers.occasion
        )
      );
    }

    if (
      answers.mood &&
      moodMatch
    ) {
      reasons.push(
        this.getMoodReason(
          answers.mood
        )
      );
    }

    if (
      answers.personality &&
      personalityMatch
    ) {
      reasons.push(
        this.getPersonalityReason(
          answers.personality
        )
      );
    }

    if (
      answers.budget &&
      budgetMatch
    ) {
      reasons.push(
        this.getBudgetReason(
          answers.budget
        )
      );
    }

    return {
      score,
      reasons,
      matches: {
        occasion:
          occasionMatch,
        mood:
          moodMatch,
        personality:
          personalityMatch,
        budget:
          budgetMatch,
      },
      qualifies,
    };
  }

  private matchesBudget(
    price: number,
    budget: ScentBudget
  ) {
    if (
      budget ===
      "under-1300"
    ) {
      return price < 1300;
    }

    if (
      budget ===
      "1300-1700"
    ) {
      return (
        price >= 1300 &&
        price <= 1700
      );
    }

    if (
      budget ===
      "1700-plus"
    ) {
      return price >= 1700;
    }

    return true;
  }

  private getStartingPrice(
    product: ProductWithRelations
  ): number | null {
    const prices =
      product.variants
        .map((variant) =>
          Number(
            variant.price
          )
        )
        .filter(
          (price) =>
            Number.isFinite(
              price
            )
        );

    if (
      prices.length === 0
    ) {
      return null;
    }

    return Math.min(
      ...prices
    );
  }

  private hasPurchasableVariant(
    product: ProductWithRelations
  ) {
    return product.variants.some(
      (variant) =>
        variant.active &&
        Math.max(
          0,
          variant.stock -
            (
              variant.reservedStock ??
              0
            )
        ) > 0
    );
  }

  private toPublicProduct(
    product: ProductWithRelations
  ) {
    const totalStock =
      product.variants.reduce(
        (
          total,
          variant
        ) =>
          total +
          variant.stock,
        0
      );

    const totalReservedStock =
      product.variants.reduce(
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

    return {
      ...product,

      variants:
        product.variants.map(
          (variant) => ({
            ...variant,
            price:
              Number(
                variant.price
              ),
          })
        ),

      startingPrice:
        this.getStartingPrice(
          product
        ),

      totalStock,

      totalReservedStock,

      availableStock:
        Math.max(
          0,
          totalStock -
            totalReservedStock
        ),
    };
  }

  private getOccasionReason(
    occasion: ScentOccasion
  ) {
    const values: Record<
      ScentOccasion,
      string
    > = {
      everyday:
        "Selected for everyday wear.",
      office:
        "Selected for office wear.",
      "date-night":
        "Selected for date night.",
      special:
        "Selected for special occasions.",
    };

    return values[
      occasion
    ];
  }

  private getMoodReason(
    mood: ScentMood
  ) {
    const values: Record<
      ScentMood,
      string
    > = {
      fresh:
        "Matches your fresh and clean mood.",
      warm:
        "Matches your warm and seductive mood.",
      dark:
        "Matches your dark and mysterious mood.",
      soft:
        "Matches your soft and romantic mood.",
    };

    return values[
      mood
    ];
  }

  private getPersonalityReason(
    personality:
      ScentPersonality
  ) {
    const values: Record<
      ScentPersonality,
      string
    > = {
      confident:
        "Fits a quietly confident profile.",
      inviting:
        "Fits a warm and inviting profile.",
      mysterious:
        "Fits a mysterious profile.",
      romantic:
        "Fits a soft romantic profile.",
    };

    return values[
      personality
    ];
  }

  private getBudgetReason(
    budget: ScentBudget
  ) {
    const values: Record<
      ScentBudget,
      string
    > = {
      "under-1300":
        "Fits your under R1,300 budget.",
      "1300-1700":
        "Fits your R1,300–R1,700 budget.",
      "1700-plus":
        "Fits your R1,700+ budget.",
      any:
        "Budget left open for exploration.",
    };

    return values[
      budget
    ];
  }
}
