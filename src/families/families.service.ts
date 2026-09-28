import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  ProductsService,
} from "../product/product.service";

import {
  FamilyProductsQueryDto,
} from "./dto/family-products-query.dto";

@Injectable()
export class FamiliesService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly productsService:
      ProductsService
  ) {}

  async findAll() {
    const groups =
      await this.prisma.product.groupBy(
        {
          by: [
            "family",
          ],

          where: {
            status:
              "ACTIVE",
          },

          _count: {
            _all:
              true,
          },

          orderBy: {
            family:
              "asc",
          },
        }
      );

    return {
      data:
        groups.map(
          (group) => ({
            name:
              group.family,

            slug:
              this.slugify(
                group.family
              ),

            productCount:
              group._count._all,
          })
        ),
    };
  }

  async findBySlug(
    slug: string,
    query: FamilyProductsQueryDto
  ) {
    const familyName =
      await this.resolveFamilyName(
        slug
      );

    const products =
      await this.productsService.findAllPublic(
        {
          search:
            query.search,

          family:
            familyName,

          audience:
            query.audience,

          page:
            query.page,

          limit:
            query.limit,
        }
      );

    return {
      family: {
        name:
          familyName,

        slug:
          this.slugify(
            familyName
          ),

        productCount:
          products.pagination.total,
      },

      data:
        products.data,

      pagination:
        products.pagination,
    };
  }

  private async resolveFamilyName(
    requestedSlug: string
  ) {
    const families =
      await this.prisma.product.findMany(
        {
          where: {
            status:
              "ACTIVE",
          },

          distinct: [
            "family",
          ],

          select: {
            family:
              true,
          },
        }
      );

    const match =
      families.find(
        (item) =>
          this.slugify(
            item.family
          ) ===
          this.slugify(
            requestedSlug
          )
      );

    if (!match) {
      throw new NotFoundException(
        "Fragrance family not found."
      );
    }

    return match.family;
  }

  private slugify(
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
}
