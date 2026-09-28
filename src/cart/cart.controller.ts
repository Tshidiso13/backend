import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";

import {
  CurrentUser,
} from "../common/decorators/current-user.decorator";

import type {
  AuthenticatedUser,
} from "../auth/auth.types";

import {
  AddCartItemDto,
} from "./dto/add-cart-item.dto";

import {
  SyncCartDto,
} from "./dto/sync-cart.dto";

import {
  UpdateCartItemDto,
} from "./dto/update-cart-item.dto";

import {
  CartService,
} from "./cart.service";

@Controller("cart")
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(
    private readonly cartService:
      CartService
  ) {}

  @Get("count")
  count(
    @CurrentUser()
    user: AuthenticatedUser
  ) {
    return this.cartService.count(
      user.id
    );
  }

  @Get()
  findAll(
    @CurrentUser()
    user: AuthenticatedUser
  ) {
    return this.cartService.findAll(
      user.id
    );
  }

  @Post()
  add(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: AddCartItemDto
  ) {
    return this.cartService.add(
      user.id,
      dto
    );
  }

  @Post("sync")
  sync(
    @CurrentUser()
    user: AuthenticatedUser,

    @Body()
    dto: SyncCartDto
  ) {
    return this.cartService.sync(
      user.id,
      dto
    );
  }

  @Patch(":itemId")
  update(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param("itemId")
    itemId: string,

    @Body()
    dto: UpdateCartItemDto
  ) {
    return this.cartService.update(
      user.id,
      itemId,
      dto
    );
  }

  @Post(":itemId/move-to-wishlist")
  moveToWishlist(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param("itemId")
    itemId: string
  ) {
    return this.cartService.moveToWishlist(
      user.id,
      itemId
    );
  }

  @Delete(":itemId")
  remove(
    @CurrentUser()
    user: AuthenticatedUser,

    @Param("itemId")
    itemId: string
  ) {
    return this.cartService.remove(
      user.id,
      itemId
    );
  }

  @Delete()
  clear(
    @CurrentUser()
    user: AuthenticatedUser
  ) {
    return this.cartService.clear(
      user.id
    );
  }
}
