import {
  Module,
} from "@nestjs/common";

import {
  PrismaModule,
} from "../prisma/prisma.module";

import {
  ScentFinderController,
} from "./scent-finder.controller";

import {
  ScentFinderService,
} from "./scent-finder.service";

@Module({
  imports: [
    PrismaModule,
  ],

  controllers: [
    ScentFinderController,
  ],

  providers: [
    ScentFinderService,
  ],

  exports: [
    ScentFinderService,
  ],
})
export class ScentFinderModule {}
