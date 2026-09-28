import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";

import type {
  AuthenticatedUser,
} from "../auth/auth.types";

import {
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";

import {
  CurrentUser,
} from "../common/decorators/current-user.decorator";

import {
  Roles,
} from "../common/decorators/roles.decorator";

import {
  RolesGuard,
} from "../common/guards/roles.guard";

import {
  AdminOrdersService,
} from "./admin-orders.service";

import {
  AdminOrderQueryDto,
} from "./dto/admin-order-query.dto";

import {
  UpdateAdminOrderStatusDto,
} from "./dto/update-admin-order-status.dto";

import {
  UpsertShipmentDto,
} from "./dto/upsert-shipment.dto";

@Controller(
  "admin/orders"
)
@UseGuards(
  JwtAuthGuard,
  RolesGuard
)
@Roles(
  "ADMIN"
)
export class AdminOrdersController {
  constructor(
    private readonly adminOrdersService:
      AdminOrdersService
  ) {}

  @Get()
  findAll(
    @Query()
    query:
      AdminOrderQueryDto
  ) {
    return this.adminOrdersService.findAll(
      query
    );
  }

  @Get(
    "summary"
  )
  summary() {
    return this.adminOrdersService.getSummary();
  }

  @Get(
    ":orderId"
  )
  findOne(
    @Param(
      "orderId"
    )
    orderId:
      string
  ) {
    return this.adminOrdersService.findOne(
      orderId
    );
  }

  @Patch(
    ":orderId/status"
  )
  updateStatus(
    @Param(
      "orderId"
    )
    orderId:
      string,

    @Body()
    dto:
      UpdateAdminOrderStatusDto,

    @CurrentUser()
    user:
      AuthenticatedUser
  ) {
    return this.adminOrdersService.updateStatus(
      orderId,
      dto,
      user.id
    );
  }

  @Patch(
    ":orderId/shipment"
  )
  upsertShipment(
    @Param(
      "orderId"
    )
    orderId:
      string,

    @Body()
    dto:
      UpsertShipmentDto,

    @CurrentUser()
    user:
      AuthenticatedUser
  ) {
    return this.adminOrdersService.upsertShipment(
      orderId,
      dto,
      user.id
    );
  }
}
