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
  SecurityController,
} from "./security.controller";

import {
  SecurityService,
} from "./security.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],

  controllers: [
    SecurityController,
  ],

  providers: [
    SecurityService,
  ],

  exports: [
    SecurityService,
  ],
})
export class SecurityModule {}
