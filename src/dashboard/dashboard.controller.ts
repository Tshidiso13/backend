import {
  Controller,
  Get,
  UseGuards,
} from "@nestjs/common";

import {
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";

import {
  RolesGuard,
} from "../common/guards/roles.guard";

import {
  Roles,
} from "../common/decorators/roles.decorator";

import {
  AdminDashboardService,
} from "./dashboard.service";

@Controller("admin/dashboard")
@UseGuards(
  JwtAuthGuard,
  RolesGuard
)
@Roles("ADMIN")
export class AdminDashboardController {
  constructor(
    private readonly adminDashboardService:
      AdminDashboardService
  ) {}

  @Get()
  getOverview() {
    return this.adminDashboardService.getOverview();
  }
}
