import {
  Body,
  Controller,
  Post,
} from "@nestjs/common";

import {
  ScentFinderDto,
} from "./dto/scent-finder.dto";

import {
  ScentFinderService,
} from "./scent-finder.service";

@Controller("scent-finder")
export class ScentFinderController {
  constructor(
    private readonly scentFinderService:
      ScentFinderService
  ) {}

  @Post("recommendations")
  recommend(
    @Body()
    dto: ScentFinderDto
  ) {
    return this.scentFinderService.recommend(
      dto
    );
  }
}
