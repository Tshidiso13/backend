import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";

import {
  Roles,
} from "../common/decorators/roles.decorator";

import {
  RolesGuard,
} from "../common/guards/roles.guard";

import {
  InventoryQueryDto,
} from "./dto/inventory-query.dto";

import {
  UpdateInventoryStockDto,
} from "./dto/update-inventory-stock.dto";

import {
  InventoryService,
} from "./inventory.service";

@Controller("admin/inventory")
@UseGuards(
  JwtAuthGuard,
  RolesGuard
)
@Roles("ADMIN")
export class InventoryController {
  constructor(
    private readonly inventoryService:
      InventoryService
  ) {}

  @Get()
  findAll(
    @Query()
    query: InventoryQueryDto
  ) {
    return this.inventoryService.findAll(
      query
    );
  }

  @Patch(":variantId")
  updateStock(
    @Param("variantId")
    variantId: string,

    @Body()
    dto: UpdateInventoryStockDto
  ) {
    return this.inventoryService.updateStock(
      variantId,
      dto
    );
  }
}
