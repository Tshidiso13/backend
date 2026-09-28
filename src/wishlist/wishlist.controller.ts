import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  WishlistService,
} from "./wishlist.service";

import {
  SyncWishlistDto,
} from "./dto/sync-wishlist.dto";

import {
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";

import {
  CurrentUser,
} from "../common/decorators/current-user.decorator";

import type {
  AuthenticatedUser,
} from "../auth/auth.types";

@Controller("wishlist")
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(
    private readonly wishlistService:
      WishlistService
  ) {}

  @Get("count")
  count(
    @CurrentUser()
    user: AuthenticatedUser
  ) {
    return this.wishlistService.count(
      user.id
    );
  }

  @Get()
  findAll(
    @CurrentUser()
    user: AuthenticatedUser
  ) {
    return this.wishlistService.findAll(
      user.id
    );
  }

  @Post("sync")
  sync(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: SyncWishlistDto
  ) {
    return this.wishlistService.sync(
      user.id,
      dto.productIds
    );
  }

  @Post(":productId")
  add(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param("productId")
    productId: string
  ) {
    return this.wishlistService.add(
      user.id,
      productId
    );
  }

  @Delete(":productId")
  remove(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param("productId")
    productId: string
  ) {
    return this.wishlistService.remove(
      user.id,
      productId
    );
  }
}
