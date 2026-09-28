import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import type {
  Request,
} from "express";

import {
  OptionalJwtAuthGuard,
} from "../auth/guards/optional-jwt-auth.guard";

import {
  CheckoutService,
} from "./checkout.service";

import {
  CheckoutPreviewDto,
  CreateCheckoutDto,
} from "./dto/checkout.dto";

/* =========================================================
   REQUEST TYPE
========================================================= */

type CheckoutAuthenticatedUser = {
  id: string;
  email?: string;
  role?: string;
};

type CheckoutRequest =
  Request & {
    user?:
      | CheckoutAuthenticatedUser
      | null;
  };

/* =========================================================
   CONTROLLER
========================================================= */

@Controller(
  "checkout"
)
export class CheckoutController {
  constructor(
    private readonly checkoutService:
      CheckoutService
  ) {}

  /* =======================================================
     CHECKOUT OPTIONS
  ======================================================== */

  @Get(
    "options"
  )
  getOptions() {
    return this.checkoutService.options();
  }

  /* =======================================================
     CHECKOUT PREVIEW
  ======================================================== */

  @Post(
    "preview"
  )
  preview(
    @Body()
    dto:
      CheckoutPreviewDto
  ) {
    return this.checkoutService.preview(
      dto
    );
  }

  /* =======================================================
     CREATE CHECKOUT
  ======================================================== */

  @Post()
  @UseGuards(
    OptionalJwtAuthGuard
  )
  create(
    @Body()
    dto:
      CreateCheckoutDto,

    @Req()
    request:
      CheckoutRequest
  ) {
    /*
     * Logged-in customer:
     *
     * request.user.id exists
     * ↓
     * Order.userId = user.id
     *
     *
     * Guest customer:
     *
     * request.user = null
     * ↓
     * Order.userId = null
     *
     * The checkout still succeeds using the customer's
     * email address from CreateCheckoutDto.
     */
    return this.checkoutService.create(
      dto,
      request.user?.id ??
        null
    );
  }
}
