import {
  Module,
} from "@nestjs/common";

import {
  AuthModule,
} from "../auth/auth.module";

import {
  PrismaModule,
} from "../prisma/prisma.module";

import {
  AdminOrdersController,
} from "./admin-orders.controller";

import {
  AdminOrdersService,
} from "./admin-orders.service";

import {
  OrdersController,
} from "./orders.controller";

import {
  OrdersService,
} from "./orders.service";

@Module({
  imports: [
    AuthModule,
    PrismaModule,
  ],

  controllers: [
    OrdersController,
    AdminOrdersController,
  ],

  providers: [
    OrdersService,
    AdminOrdersService,
  ],

  exports: [
    OrdersService,
    AdminOrdersService,
  ],
})
export class OrdersModule {}
