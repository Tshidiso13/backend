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
  AddressesController,
} from "./addresses.controller";

import {
  AddressesService,
} from "./addresses.service";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],

  controllers: [
    AddressesController,
  ],

  providers: [
    AddressesService,
  ],

  exports: [
    AddressesService,
  ],
})
export class AddressesModule {}
