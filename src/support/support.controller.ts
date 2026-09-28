import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

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
  CreateSupportTicketDto,
} from "./dto/create-support-ticket.dto";

import {
  ReplySupportTicketDto,
} from "./dto/reply-support-ticket.dto";

import {
  UpdateSupportStatusDto,
} from "./dto/update-support-status.dto";

import {
  SupportService,
} from "./support.service";

type AuthenticatedRequest = {
  user: {
    id:
      string;

    name?:
      string;

    email?:
      string;
  };
};

/* =========================================================
   CUSTOMER
========================================================= */

@Controller(
  "account/help"
)
@UseGuards(
  JwtAuthGuard
)
export class AccountSupportController {
  constructor(
    private readonly supportService:
      SupportService
  ) {}

  @Get(
    "tickets"
  )
  findMine(
    @Req()
    request:
      AuthenticatedRequest
  ) {
    return this.supportService.findMine(
      request.user.id
    );
  }

  @Get(
    "tickets/:ticketId"
  )
  findOne(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "ticketId"
    )
    ticketId:
      string
  ) {
    return this.supportService.findMineOne(
      request.user.id,
      ticketId
    );
  }

  @Post(
    "tickets"
  )
  create(
    @Req()
    request:
      AuthenticatedRequest,

    @Body()
    body:
      CreateSupportTicketDto
  ) {
    return this.supportService.create(
      request.user.id,
      body
    );
  }

  @Post(
    "tickets/:ticketId/replies"
  )
  reply(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "ticketId"
    )
    ticketId:
      string,

    @Body()
    body:
      ReplySupportTicketDto
  ) {
    return this.supportService.reply(
      request.user.id,
      ticketId,
      body
    );
  }
}

/* =========================================================
   ADMIN
========================================================= */

@Controller(
  "admin/support"
)
@UseGuards(
  JwtAuthGuard,
  RolesGuard
)
@Roles(
  "ADMIN"
)
export class AdminSupportController {
  constructor(
    private readonly supportService:
      SupportService
  ) {}

  @Get()
  findAll(
    @Query(
      "status"
    )
    status?:
      string
  ) {
    return this.supportService.adminFindAll(
      status
    );
  }

  @Get(
    ":ticketId"
  )
  findOne(
    @Param(
      "ticketId"
    )
    ticketId:
      string
  ) {
    return this.supportService.adminFindOne(
      ticketId
    );
  }

  @Patch(
    ":ticketId/status"
  )
  updateStatus(
    @Param(
      "ticketId"
    )
    ticketId:
      string,

    @Body()
    body:
      UpdateSupportStatusDto
  ) {
    return this.supportService.adminUpdateStatus(
      ticketId,
      body
    );
  }

  @Post(
    ":ticketId/replies"
  )
  reply(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "ticketId"
    )
    ticketId:
      string,

    @Body()
    body:
      ReplySupportTicketDto
  ) {
    return this.supportService.adminReply(
      ticketId,
      request.user,
      body
    );
  }
}
