import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  ProductImageDto,
} from "./dto/product-image.dto";

import { ProductsService } from "./product.service";

import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { AdminProductQueryDto } from "./dto/product-query.dto";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

import { RolesGuard } from "../common/guards/roles.guard";

import { Roles } from "../common/decorators/roles.decorator";

import { CurrentUser } from "../common/decorators/current-user.decorator";

import type { AuthenticatedUser } from "../auth/auth.types";

@Controller("admin/products")
@UseGuards(
  JwtAuthGuard,
  RolesGuard
)
@Roles("ADMIN")
export class AdminProductsController {
  constructor(
    private readonly productsService:
      ProductsService
  ) {}

  /* =======================================================
     CREATE
  ======================================================== */

  @Post()
  create(
    @Body()
    dto: CreateProductDto,

    @CurrentUser()
    user: AuthenticatedUser
  ) {
    return this.productsService.create(
      dto,
      user.id
    );
  }


  @Post(
  ":productId/images"
)
addImage(
  @Param("productId")
  productId: string,

  @Body()
  dto: ProductImageDto
) {
  return this.productsService.addImage(
    productId,
    dto
  );
}


@Delete(
  ":productId/images/:imageId"
)
deleteImage(
  @Param("productId")
  productId: string,

  @Param("imageId")
  imageId: string
) {
  return this.productsService.deleteImage(
    productId,
    imageId
  );
}

  /* =======================================================
     LIST
  ======================================================== */

  @Get()
  findAll(
    @Query()
    query: AdminProductQueryDto
  ) {
    return this.productsService.findAllAdmin(
      query
    );
  }

  /* =======================================================
     DETAIL
  ======================================================== */

  @Get(":productId")
  findOne(
    @Param("productId")
    productId: string
  ) {
    return this.productsService.findOneAdmin(
      productId
    );
  }

  /* =======================================================
     UPDATE
  ======================================================== */

  @Patch(":productId")
  update(
    @Param("productId")
    productId: string,

    @Body()
    dto: UpdateProductDto,

    @CurrentUser()
    user: AuthenticatedUser
  ) {
    return this.productsService.update(
      productId,
      dto,
      user.id
    );
  }

  /* =======================================================
     ARCHIVE
  ======================================================== */

  @Delete(":productId")
  archive(
    @Param("productId")
    productId: string
  ) {
    return this.productsService.archive(
      productId
    );
  }
}