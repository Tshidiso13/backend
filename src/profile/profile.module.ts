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
  ProfileController,
} from "./profile.controller";

import {
  ProfileService,
} from "./profile.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],

  controllers: [
    ProfileController,
  ],

  providers: [
    ProfileService,
  ],

  exports: [
    ProfileService,
  ],
})
export class ProfileModule {}
