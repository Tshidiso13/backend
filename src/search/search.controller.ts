import {
  Controller,
  Get,
  Query,
} from "@nestjs/common";

import {
  SearchProductsQueryDto,
} from "./dto/search-products-query.dto";

import {
  SearchService,
} from "./search.service";

@Controller(
  "search"
)
export class SearchController {
  constructor(
    private readonly searchService:
      SearchService
  ) {}

  @Get()
  searchProducts(
    @Query()
    query:
      SearchProductsQueryDto
  ) {
    return this.searchService.searchProducts(
      query
    );
  }
}
