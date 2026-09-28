import {
  Module,
} from "@nestjs/common";

import {
  AuthModule,
} from "../auth/auth.module";

import {
  EmailModule,
} from "../email/email.module";

import {
  PrismaModule,
} from "../prisma/prisma.module";

import {
  AccountSupportController,
  AdminSupportController,
} from "./support.controller";

import {
  SupportService,
} from "./support.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    EmailModule,
  ],

  controllers: [
    AccountSupportController,
    AdminSupportController,
  ],

  providers: [
    SupportService,
  ],

  exports: [
    SupportService,
  ],
})
export class SupportModule {}
