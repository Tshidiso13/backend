import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";

import { ProductsService } from "./product.service";
import { ProductsController } from "./product.controller";
import { AdminProductsController } from "./admin-products.controller";
import { AdminProductImagesController } from "./admin-product-images.controller";

@Module({
  imports: [
    AuthModule,
    CloudinaryModule,
  ],

  controllers: [
    ProductsController,
    AdminProductsController,
    AdminProductImagesController,
  ],

  providers: [
    ProductsService,
  ],

  exports: [
    ProductsService,
  ],
})
export class ProductsModule {}