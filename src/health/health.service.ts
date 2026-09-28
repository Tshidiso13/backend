import {
  Injectable,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService
  ) {}

  async check() {
    const startedAt = Date.now();

    let database:
      | "connected"
      | "disconnected" =
      "disconnected";

    try {
      await this.prisma.$queryRaw`
        SELECT 1
      `;

      database = "connected";
    } catch {
      database = "disconnected";
    }

    return {
      status:
        database === "connected"
          ? "ok"
          : "degraded",

      service: "ÉLAN Parfums API",

      database,

      uptime: process.uptime(),

      responseTime: `${Date.now() - startedAt}ms`,

      environment:
        process.env.NODE_ENV ??
        "development",

      timestamp:
        new Date().toISOString(),
    };
  }
}