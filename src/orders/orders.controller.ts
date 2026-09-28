import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";

import {
  GuestOrderListDto,
  GuestOrderLookupDto,
} from "./dto/guest-order.dto";

import {
  OrderQueryDto,
} from "./dto/order-query.dto";

import {
  OrdersService,
} from "./orders.service";

type AuthenticatedRequest = {
  user: {
    id: string;
  };
};

@Controller(
  "orders"
)
export class OrdersController {
  constructor(
    private readonly ordersService:
      OrdersService
  ) {}

  /* =======================================================
     GUEST ROUTES
     Public, but require order reference + checkout email.
  ======================================================== */

  @Post(
    "guest/lookup"
  )
  findGuestOrder(
    @Body()
    body:
      GuestOrderLookupDto
  ) {
    return this.ordersService.findGuestOrder(
      body
    );
  }

  @Post(
    "guest/list"
  )
  findGuestOrders(
    @Body()
    body:
      GuestOrderListDto
  ) {
    return this.ordersService.findGuestOrders(
      body
    );
  }

  /* =======================================================
     ACCOUNT ROUTES
  ======================================================== */

  @Get()
  @UseGuards(
    JwtAuthGuard
  )
  findMine(
    @Req()
    request:
      AuthenticatedRequest,

    @Query()
    query:
      OrderQueryDto
  ) {
    return this.ordersService.findMine(
      request.user.id,
      query
    );
  }

  @Get(
    ":orderId"
  )
  @UseGuards(
    JwtAuthGuard
  )
  findMineById(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "orderId"
    )
    orderId:
      string
  ) {
    return this.ordersService.findMineById(
      request.user.id,
      orderId
    );
  }
}
