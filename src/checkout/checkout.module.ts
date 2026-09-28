import {
  Module,
} from "@nestjs/common";

import {
  ConfigModule,
} from "@nestjs/config";

import {
  AuthModule,
} from "../auth/auth.module";

import {
  OptionalJwtAuthGuard,
} from "../auth/guards/optional-jwt-auth.guard";

import {
  PayfastModule,
} from "../payfast/payfast.module";

import {
  PrismaModule,
} from "../prisma/prisma.module";

import {
  CheckoutController,
} from "./checkout.controller";

import {
  CheckoutService,
} from "./checkout.service";

/* =========================================================
   CHECKOUT MODULE
========================================================= */

@Module({
  imports: [
    /*
     * Environment/config values:
     *
     * FREE_DELIVERY_THRESHOLD
     * ARAMEX_FLAT_RATE
     * PAXI_FLAT_RATE
     * CHECKOUT_RESERVATION_MINUTES
     */
    ConfigModule,

    /*
     * Prisma / Neon database access.
     */
    PrismaModule,

    /*
     * Required so OptionalJwtAuthGuard can use your existing
     * JWT strategy when a customer is signed in.
     *
     * Guests are still allowed through the optional guard.
     */
    AuthModule,

    /*
     * PayFast signature/payment-form creation.
     */
    PayfastModule,
  ],

  controllers: [
    CheckoutController,
  ],

  providers: [
    CheckoutService,

    /*
     * Checkout supports both:
     *
     * authenticated customer
     * request.user.id -> Order.userId
     *
     * guest customer
     * request.user = null -> Order.userId = null
     */
    OptionalJwtAuthGuard,
  ],

  exports: [
    CheckoutService,
  ],
})
export class CheckoutModule {}
