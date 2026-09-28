import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";

import { envValidationSchema } from "./config/env.validation";
import { ProductsModule } from './product/product.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { ScentFinderModule } from "./scent-finder/scent-finder.module";
import { WishlistModule } from './wishlist/wishlist.module';
import { InventoryModule } from './inventory/inventory.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FamiliesController } from './families/families.controller';
import { FamiliesService } from './families/families.service';
import { FamiliesModule } from './families/families.module';
import { CartController } from './cart/cart.controller';
import { CartModule } from './cart/cart.module';
import { CheckoutController } from './checkout/checkout.controller';
import { CheckoutModule } from './checkout/checkout.module';
import { PayfastController } from './payfast/payfast.controller';
import { PayfastModule } from './payfast/payfast.module';
import { OrdersModule } from './orders/orders.module';
import { SearchModule } from "./search/search.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { EmailModule } from "./email/email.module";
import { ProfileModule } from "./profile/profile.module";
import { SecurityModule } from "./security/security.module";
import { AddressesModule } from "./addresses/addresses.module";
import { SupportModule } from "./support/support.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
    }),

    PrismaModule,
    AuthModule,
    HealthModule,
    ProductsModule,
    CloudinaryModule,
    ScentFinderModule,
    WishlistModule,
    InventoryModule,
    DashboardModule,
    FamiliesModule,
    CartModule,
    CheckoutModule,
    PayfastModule,
    OrdersModule,
    SearchModule,
    NotificationsModule,
    EmailModule,
    ProfileModule,
    SecurityModule,
    AddressesModule,
    SupportModule,
  ],
  controllers: [FamiliesController, CartController, CheckoutController, PayfastController],
  providers: [FamiliesService],
})
export class AppModule {}