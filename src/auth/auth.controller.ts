import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";

import type {
  Request,
  Response,
} from "express";

import { ConfigService } from "@nestjs/config";

import { AuthService } from "./auth.service";

import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { GoogleAuthGuard } from "./guards/google-auth.guard";

import { CurrentUser } from "../common/decorators/current-user.decorator";

import type {
  AuthenticatedUser,
  GoogleProfile,
} from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService:
      AuthService,

    private readonly config:
      ConfigService
  ) {}

  /* =======================================================
     REGISTER
  ======================================================== */

  @Post("register")
  register(
    @Body()
    dto: RegisterDto,

    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response
  ) {
    return this.authService.register(
      dto,
      request,
      response
    );
  }

  /* =======================================================
     LOGIN
  ======================================================== */

  @Post("login")
  login(
    @Body()
    dto: LoginDto,

    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response
  ) {
    return this.authService.login(
      dto,
      request,
      response
    );
  }

  /* =======================================================
     CURRENT USER
  ======================================================== */

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(
    @CurrentUser()
    user: AuthenticatedUser
  ) {
    return this.authService.me(
      user.id
    );
  }

  /* =======================================================
     REFRESH
  ======================================================== */

  @Post("refresh")
  refresh(
    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response
  ) {
    return this.authService.refresh(
      request,
      response
    );
  }

  /* =======================================================
     LOGOUT
  ======================================================== */

  @Post("logout")
  logout(
    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response
  ) {
    return this.authService.logout(
      request,
      response
    );
  }

  /* =======================================================
     LOGOUT ALL
  ======================================================== */

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  logoutAll(
    @CurrentUser()
    user: AuthenticatedUser,

    @Res({
      passthrough: true,
    })
    response: Response
  ) {
    return this.authService.logoutAll(
      user.id,
      response
    );
  }

  /* =======================================================
     FORGOT PASSWORD
  ======================================================== */

  @Post("forgot-password")
  forgotPassword(
    @Body()
    dto: ForgotPasswordDto
  ) {
    return this.authService.forgotPassword(
      dto
    );
  }

  /* =======================================================
     RESET PASSWORD
  ======================================================== */

  @Post("reset-password")
  resetPassword(
    @Body()
    dto: ResetPasswordDto
  ) {
    return this.authService.resetPassword(
      dto
    );
  }

  /* =======================================================
     GOOGLE
  ======================================================== */

  @Get("google")
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Passport redirects to Google.
  }

  /* =======================================================
     GOOGLE CALLBACK
  ======================================================== */

  @Get("google/callback")
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req()
    request: Request,

    @Res()
    response: Response
  ) {
    const profile =
      request.user as GoogleProfile;

    const user =
      await this.authService.googleLogin(
        profile,
        request,
        response
      );

    const frontendUrl =
      this.config
        .getOrThrow<string>(
          "FRONTEND_URL"
        )
        .split(",")[0]
        .trim();

    if (user.role === "ADMIN") {
      return response.redirect(
        `${frontendUrl}/admin`
      );
    }

    return response.redirect(
      `${frontendUrl}/account`
    );
  }
}