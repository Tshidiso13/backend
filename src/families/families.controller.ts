import {
  Controller,
  Get,
  Param,
  Query,
} from "@nestjs/common";

import {
  FamilyProductsQueryDto,
} from "./dto/family-products-query.dto";

import {
  FamiliesService,
} from "./families.service";

@Controller("families")
export class FamiliesController {
  constructor(
    private readonly familiesService:
      FamiliesService
  ) {}

  @Get()
  findAll() {
    return this.familiesService.findAll();
  }

  @Get(":slug")
  findBySlug(
    @Param("slug")
    slug: string,

    @Query()
    query: FamilyProductsQueryDto
  ) {
    return this.familiesService.findBySlug(
      slug,
      query
    );
  }
}
