import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";

import type {
  Request,
  Response,
} from "express";

import {
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";

import {
  ChangePasswordDto,
} from "./dto/change-password.dto";

import {
  SecurityService,
} from "./security.service";

type AuthenticatedRequest =
  Request & {
    user: {
      id:
        string;
    };
  };

const ACCESS_COOKIE =
  "elan_access_token";

const REFRESH_COOKIE =
  "elan_refresh_token";

@Controller(
  "account/security"
)
@UseGuards(
  JwtAuthGuard
)
export class SecurityController {
  constructor(
    private readonly securityService:
      SecurityService
  ) {}

  @Get()
  getOverview(
    @Req()
    request:
      AuthenticatedRequest
  ) {
    return this.securityService.getOverview(
      request.user.id,
      getRefreshToken(
        request
      )
    );
  }

  @Patch(
    "password"
  )
  async changePassword(
    @Req()
    request:
      AuthenticatedRequest,

    @Res({
      passthrough:
        true,
    })
    response:
      Response,

    @Body()
    body:
      ChangePasswordDto
  ) {
    const result =
      await this.securityService.changePassword(
        request.user.id,
        body
      );

    clearAuthCookies(
      response
    );

    return result;
  }

  @Delete(
    "sessions/:sessionId"
  )
  async revokeSession(
    @Req()
    request:
      AuthenticatedRequest,

    @Res({
      passthrough:
        true,
    })
    response:
      Response,

    @Param(
      "sessionId"
    )
    sessionId:
      string
  ) {
    const result =
      await this.securityService.revokeSession(
        request.user.id,
        sessionId,
        getRefreshToken(
          request
        )
      );

    if (
      result.isCurrent
    ) {
      clearAuthCookies(
        response
      );
    }

    return result;
  }

  @Post(
    "sessions/revoke-others"
  )
  revokeOtherSessions(
    @Req()
    request:
      AuthenticatedRequest
  ) {
    return this.securityService.revokeOtherSessions(
      request.user.id,
      getRefreshToken(
        request
      )
    );
  }

  @Delete(
    "sessions"
  )
  async revokeAllSessions(
    @Req()
    request:
      AuthenticatedRequest,

    @Res({
      passthrough:
        true,
    })
    response:
      Response
  ) {
    const result =
      await this.securityService.revokeAllSessions(
        request.user.id
      );

    clearAuthCookies(
      response
    );

    return result;
  }
}

function getRefreshToken(
  request:
    Request
):
  string |
  undefined {
  const value =
    request.cookies?.[
      REFRESH_COOKIE
    ];

  return typeof value ===
    "string"
    ? value
    : undefined;
}

function clearAuthCookies(
  response:
    Response
) {
  response.clearCookie(
    ACCESS_COOKIE,
    {
      path:
        "/",
    }
  );

  response.clearCookie(
    REFRESH_COOKIE,
    {
      path:
        "/",
    }
  );
}
