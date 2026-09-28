import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import type {
  UserRole,
} from "../generated/prisma/client";

import {
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";

import {
  Roles,
} from "../common/decorators/roles.decorator";

import {
  RolesGuard,
} from "../common/guards/roles.guard";

import {
  GuestNotificationQueryDto,
} from "./dto/guest-notification-query.dto";

import {
  NotificationQueryDto,
} from "./dto/notification-query.dto";

import {
  NotificationsService,
} from "./notifications.service";

type AuthenticatedRequest = {
  user: {
    id: string;
    role?: UserRole;
  };
};

@Controller(
  "notifications"
)
export class NotificationsController {
  constructor(
    private readonly notificationsService:
      NotificationsService
  ) {}

  /* =======================================================
     GUEST

     Public route, but every requested order must still be
     verified with its checkout email in the service.
  ======================================================== */

  @Post(
    "guest"
  )
  guestNotifications(
    @Body()
    body:
      GuestNotificationQueryDto
  ) {
    return this.notificationsService.findGuestNotifications(
      body
    );
  }

  /* =======================================================
     ADMIN BADGES
  ======================================================== */

  @Get(
    "admin-badges"
  )
  @UseGuards(
    JwtAuthGuard,
    RolesGuard
  )
  @Roles(
    "ADMIN"
  )
  adminBadges(
    @Req()
    request:
      AuthenticatedRequest
  ) {
    return this.notificationsService.getAdminBadges(
      request.user
    );
  }

  @Patch(
    "admin-orders/read"
  )
  @UseGuards(
    JwtAuthGuard,
    RolesGuard
  )
  @Roles(
    "ADMIN"
  )
  markAdminOrderAlertsRead(
    @Req()
    request:
      AuthenticatedRequest
  ) {
    return this.notificationsService.markAdminOrderAlertsRead(
      request.user
    );
  }

  /* =======================================================
     ACCOUNT / ADMIN
  ======================================================== */

  @Get()
  @UseGuards(
    JwtAuthGuard
  )
  findMine(
    @Req()
    request:
      AuthenticatedRequest,

    @Query()
    query:
      NotificationQueryDto
  ) {
    return this.notificationsService.findMine(
      request.user,
      query
    );
  }

  @Get(
    "unread-count"
  )
  @UseGuards(
    JwtAuthGuard
  )
  unreadCount(
    @Req()
    request:
      AuthenticatedRequest
  ) {
    return this.notificationsService.unreadCount(
      request.user
    );
  }

  @Patch(
    "read-all"
  )
  @UseGuards(
    JwtAuthGuard
  )
  markAllRead(
    @Req()
    request:
      AuthenticatedRequest
  ) {
    return this.notificationsService.markAllRead(
      request.user
    );
  }

  @Patch(
    ":notificationId/read"
  )
  @UseGuards(
    JwtAuthGuard
  )
  markRead(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "notificationId"
    )
    notificationId:
      string
  ) {
    return this.notificationsService.markRead(
      request.user,
      notificationId
    );
  }

  @Patch(
    ":notificationId/unread"
  )
  @UseGuards(
    JwtAuthGuard
  )
  markUnread(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "notificationId"
    )
    notificationId:
      string
  ) {
    return this.notificationsService.markUnread(
      request.user,
      notificationId
    );
  }

  @Delete(
    ":notificationId"
  )
  @UseGuards(
    JwtAuthGuard
  )
  remove(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "notificationId"
    )
    notificationId:
      string
  ) {
    return this.notificationsService.remove(
      request.user,
      notificationId
    );
  }
}
