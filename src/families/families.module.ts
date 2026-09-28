import {
  Module,
} from "@nestjs/common";

import {
  PrismaModule,
} from "../prisma/prisma.module";

import {
  ProductsModule,
} from "../product/product.module";

import {
  FamiliesController,
} from "./families.controller";

import {
  FamiliesService,
} from "./families.service";

@Module({
  imports: [
    PrismaModule,
    ProductsModule,
  ],

  controllers: [
    FamiliesController,
  ],

  providers: [
    FamiliesService,
  ],

  exports: [
    FamiliesService,
  ],
})
export class FamiliesModule {}
