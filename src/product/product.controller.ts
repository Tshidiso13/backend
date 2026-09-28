import {
  Controller,
  Get,
  Param,
  Query,
} from "@nestjs/common";

import { ProductsService } from "./product.service";

import { PublicProductQueryDto } from "./dto/product-query.dto";

@Controller("products")
export class ProductsController {
  constructor(
    private readonly productsService:
      ProductsService
  ) {}

  @Get()
  findAll(
    @Query()
    query: PublicProductQueryDto
  ) {
    return this.productsService.findAllPublic(
      query
    );
  }

  @Get(":slug")
  findBySlug(
    @Param("slug")
    slug: string
  ) {
    return this.productsService.findPublicBySlug(
      slug
    );
  }
}