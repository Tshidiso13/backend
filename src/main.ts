import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";

import cookieParser from "cookie-parser";
import { serve } from "inngest/express";

import { AppModule } from "./app.module";

import { EmailService } from "./email/email.service";

import { inngest } from "./inngest/client";
import { createCartFunctions } from "./inngest/cart.functions";
import { createCheckoutFunctions } from "./inngest/checkout.functions";
import { createEmailFunctions } from "./inngest/email.functions";
import { createInventoryFunctions } from "./inngest/inventory.functions";
import { createOrderFunctions } from "./inngest/orders.functions";

import { PrismaService } from "./prisma/prisma.service";

async function bootstrap() {
  /* =======================================================
     CREATE APPLICATION
  ======================================================== */

  const app =
    await NestFactory.create<NestExpressApplication>(
      AppModule,
      {
        bodyParser: true,
      }
    );

  const config = app.get(ConfigService);

  /* =======================================================
     ENVIRONMENT
  ======================================================== */

  const nodeEnv =
    config.get<string>("NODE_ENV") ??
    "development";

  const isProduction =
    nodeEnv === "production";

  /* =======================================================
     PORT
  ======================================================== */

  const port = Number(
    config.get<string>("PORT") ??
      "5000"
  );

  /* =======================================================
     FRONTEND URLS
  ======================================================== */

  const configuredFrontendUrls =
    config
      .get<string>("FRONTEND_URL")
      ?.split(",")
      .map((url) =>
        url.trim()
      )
      .filter(Boolean) ??
    [];

  /*
   * Always allow localhost during development.
   *
   * Production URLs come from FRONTEND_URL.
   *
   * Example:
   *
   * FRONTEND_URL=https://elan.vercel.app
   *
   * or:
   *
   * FRONTEND_URL=https://elan.vercel.app,https://www.elan.co.za
   */
  const frontendUrls = [
    ...new Set([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      ...configuredFrontendUrls,
    ]),
  ];

  /* =======================================================
     BACKEND URL
  ======================================================== */

  /*
   * Development:
   *
   * http://localhost:5000
   *
   * Production:
   *
   * BACKEND_URL=https://your-api.onrender.com
   */
  const backendUrl =
    config.get<string>(
      "BACKEND_URL"
    )?.replace(/\/$/, "") ??
    `http://localhost:${port}`;

  /* =======================================================
     GLOBAL API PREFIX
  ======================================================== */

  app.setGlobalPrefix(
    "api"
  );

  /* =======================================================
     CORS
  ======================================================== */

  app.enableCors({
    origin: (
      origin,
      callback
    ) => {
      /*
       * Requests without Origin include:
       *
       * - Postman
       * - server-to-server requests
       * - Inngest
       * - webhooks
       */
      if (!origin) {
        callback(
          null,
          true
        );

        return;
      }

      if (
        frontendUrls.includes(
          origin
        )
      ) {
        callback(
          null,
          true
        );

        return;
      }

      callback(
        new Error(
          `CORS blocked origin: ${origin}`
        ),
        false
      );
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  });

  /* =======================================================
     COOKIES
  ======================================================== */

  app.use(
    cookieParser()
  );

  /* =======================================================
     BODY PARSERS
  ======================================================== */

  /*
   * Standard JSON requests.
   */
  app.useBodyParser(
    "json",
    {
      limit: "10mb",
    }
  );

  /*
   * PayFast ITN requests use:
   *
   * application/x-www-form-urlencoded
   */
  app.useBodyParser(
    "urlencoded",
    {
      extended: true,
      limit: "2mb",
    }
  );

  /* =======================================================
     GLOBAL VALIDATION
  ======================================================== */

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,

      forbidNonWhitelisted:
        true,

      transform: true,

      transformOptions: {
        enableImplicitConversion:
          true,
      },
    })
  );

  /* =======================================================
     SHUTDOWN HOOKS
  ======================================================== */

  app.enableShutdownHooks();

  /* =======================================================
     SERVICES
  ======================================================== */

  const prisma =
    app.get(
      PrismaService
    );

  const emailService =
    app.get(
      EmailService
    );

  /* =======================================================
     INNGEST FUNCTIONS
  ======================================================== */

  const inventoryFunctions =
    createInventoryFunctions(
      prisma
    );

  const cartFunctions =
    createCartFunctions(
      prisma
    );

  const checkoutFunctions =
    createCheckoutFunctions(
      prisma
    );

  const orderFunctions =
    createOrderFunctions(
      prisma
    );

  const emailFunctions =
    createEmailFunctions(
      prisma,
      emailService,
      configuredFrontendUrls[0] ??
        "http://localhost:3000"
    );

  const inngestFunctions = [
    ...inventoryFunctions,
    ...cartFunctions,
    ...checkoutFunctions,
    ...orderFunctions,
    ...emailFunctions,
  ];

  /* =======================================================
     INNGEST ENDPOINT
  ======================================================== */

  /*
   * This endpoint works for both:
   *
   * Development:
   * http://localhost:5000/api/inngest
   *
   * Production:
   * https://your-api.onrender.com/api/inngest
   *
   * In development the Inngest Dev Server can discover it.
   *
   * In production Inngest Cloud calls the same endpoint.
   */
  app.use(
    "/api/inngest",
    serve({
      client: inngest,

      functions:
        inngestFunctions,
    })
  );

  /* =======================================================
     START SERVER
  ======================================================== */

  await app.listen(
    port,
    "0.0.0.0"
  );

  /* =======================================================
     STARTUP INFORMATION
  ======================================================== */

  console.log(
    "======================================"
  );

  console.log(
    `ÉLAN API started`
  );

  console.log(
    `Environment: ${nodeEnv}`
  );

  console.log(
    `Port: ${port}`
  );

  console.log(
    `API: ${backendUrl}/api`
  );

  console.log(
    `PayFast ITN: ${backendUrl}/api/payfast/notify`
  );

  console.log(
    `Inngest: ${backendUrl}/api/inngest`
  );

  console.log(
    `Allowed frontends: ${frontendUrls.join(", ")}`
  );

  console.log(
    `Production mode: ${isProduction}`
  );

  console.log(
    "--------------------------------------"
  );

  console.log(
    `Inventory functions: ${inventoryFunctions.length}`
  );

  console.log(
    `Cart functions: ${cartFunctions.length}`
  );

  console.log(
    `Checkout functions: ${checkoutFunctions.length}`
  );

  console.log(
    `Order functions: ${orderFunctions.length}`
  );

  console.log(
    `Email functions: ${emailFunctions.length}`
  );

  console.log(
    `Total Inngest functions: ${inngestFunctions.length}`
  );

  console.log(
    "======================================"
  );
}

void bootstrap();