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
  AdminDashboardController,
} from "./dashboard.controller";

import {
  AdminDashboardService,
} from "./dashboard.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],

  controllers: [
    AdminDashboardController,
  ],

  providers: [
    AdminDashboardService,
  ],
})
export class DashboardModule {}
