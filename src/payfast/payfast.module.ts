import {
  Module,
} from "@nestjs/common";

import {
  ConfigModule,
} from "@nestjs/config";

import {
  PrismaModule,
} from "../prisma/prisma.module";

import {
  PayfastController,
} from "./payfast.controller";

import {
  PayfastService,
} from "./payfast.service";

/* =========================================================
   PAYFAST MODULE
========================================================= */

@Module({
  imports: [
    /*
     * Gives PayfastService access to:
     *
     * PAYFAST_MERCHANT_ID
     * PAYFAST_MERCHANT_KEY
     * PAYFAST_PASSPHRASE
     * PAYFAST_MODE
     * PAYFAST_VERIFY_SOURCE_IP
     * FRONTEND_URL
     * BACKEND_PUBLIC_URL
     */
    ConfigModule,

    /*
     * Required for:
     *
     * Order lookup
     * Payment lookup/update
     * Inventory reservation consumption/release
     * Cart cleanup
     */
    PrismaModule,
  ],

  controllers: [
    PayfastController,
  ],

  providers: [
    PayfastService,
  ],

  exports: [
    /*
     * CheckoutService imports PayfastModule and uses:
     *
     * payfast.assertConfigured()
     * payfast.createPaymentForm()
     */
    PayfastService,
  ],
})
export class PayfastModule {}
