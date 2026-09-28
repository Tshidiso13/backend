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
  PrismaModule,
} from "../prisma/prisma.module";

import {
  CartController,
} from "./cart.controller";

import {
  CartService,
} from "./cart.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConfigModule,
  ],

  controllers: [
    CartController,
  ],

  providers: [
    CartService,
  ],

  exports: [
    CartService,
  ],
})
export class CartModule {}
