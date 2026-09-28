import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import type {
  Request,
  Response,
} from "express";

import * as argon2 from "argon2";

import {
  createHash,
  randomBytes,
} from "crypto";

import { PrismaService } from "../prisma/prisma.service";

import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

import { AuthMailService } from "./mail.service";

import type {
  AccessTokenPayload,
  AuthenticatedUser,
  GoogleProfile,
  RefreshTokenPayload,
} from "./auth.types";

@Injectable()
export class AuthService {
  private readonly accessCookie =
    "elan_access_token";

  private readonly refreshCookie =
    "elan_refresh_token";

  constructor(
    private readonly prisma: PrismaService,

    private readonly jwtService:
      JwtService,

    private readonly config:
      ConfigService,

    private readonly mailService:
      AuthMailService
  ) {}

  /* =======================================================
     REGISTER
  ======================================================== */

  async register(
    dto: RegisterDto,
    request: Request,
    response: Response
  ) {
    const email = dto.email
      .trim()
      .toLowerCase();

    const existing =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

    if (existing) {
      throw new ConflictException(
        "An account with this email already exists."
      );
    }

    const passwordHash =
      await argon2.hash(
        dto.password,
        {
          type: argon2.argon2id,
        }
      );

    const user =
      await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email,
          passwordHash,
          role: "CUSTOMER",
          status: "ACTIVE",
        },
      });

    await this.createSessionAndSetCookies(
      user,
      request,
      response
    );

    return {
      message: "Account created.",
      user: this.toPublicUser(user),
    };
  }

  /* =======================================================
     LOGIN
  ======================================================== */

  async login(
    dto: LoginDto,
    request: Request,
    response: Response
  ) {
    const email = dto.email
      .trim()
      .toLowerCase();

    const user =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

    if (
      !user ||
      !user.passwordHash
    ) {
      throw new UnauthorizedException(
        "Invalid email or password."
      );
    }

    const valid =
      await argon2.verify(
        user.passwordHash,
        dto.password
      );

    if (!valid) {
      throw new UnauthorizedException(
        "Invalid email or password."
      );
    }

    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException(
        "This account is unavailable."
      );
    }

    await this.prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        lastLoginAt: new Date(),
      },
    });

    await this.createSessionAndSetCookies(
      user,
      request,
      response
    );

    return {
      message: "Signed in successfully.",
      user: this.toPublicUser(user),
    };
  }

  /* =======================================================
     GOOGLE LOGIN
  ======================================================== */

  async googleLogin(
    profile: GoogleProfile,
    request: Request,
    response: Response
  ) {
    let user =
      await this.prisma.user.findFirst({
        where: {
          OR: [
            {
              googleId:
                profile.googleId,
            },
            {
              email:
                profile.email,
            },
          ],
        },
      });

    if (!user) {
      user =
        await this.prisma.user.create({
          data: {
            name: profile.name,

            email:
              profile.email,

            googleId:
              profile.googleId,

            imageUrl:
              profile.image,

            emailVerifiedAt:
              new Date(),

            role: "CUSTOMER",
            status: "ACTIVE",

            lastLoginAt:
              new Date(),
          },
        });
    } else {
      if (
        user.status !== "ACTIVE"
      ) {
        throw new UnauthorizedException(
          "This account is unavailable."
        );
      }

      user =
        await this.prisma.user.update({
          where: {
            id: user.id,
          },

          data: {
            googleId:
              user.googleId ??
              profile.googleId,

            imageUrl:
              user.imageUrl ??
              profile.image,

            emailVerifiedAt:
              user.emailVerifiedAt ??
              new Date(),

            lastLoginAt:
              new Date(),
          },
        });
    }

    await this.createSessionAndSetCookies(
      user,
      request,
      response
    );

    return this.toPublicUser(user);
  }

  /* =======================================================
     REFRESH
  ======================================================== */

  async refresh(
    request: Request,
    response: Response
  ) {
    const refreshToken =
      request.cookies?.[
        this.refreshCookie
      ];

    if (!refreshToken) {
      throw new UnauthorizedException(
        "Refresh token missing."
      );
    }

    let payload:
      RefreshTokenPayload;

    try {
      payload =
        await this.jwtService.verifyAsync<RefreshTokenPayload>(
          refreshToken,
          {
            secret:
              this.config.getOrThrow<string>(
                "JWT_REFRESH_SECRET"
              ),
          }
        );
    } catch {
      this.clearCookies(response);

      throw new UnauthorizedException(
        "Refresh token is invalid or expired."
      );
    }

    if (
      payload.type !== "refresh"
    ) {
      throw new UnauthorizedException(
        "Invalid refresh token."
      );
    }

    const session =
      await this.prisma.session.findUnique({
        where: {
          id: payload.sid,
        },

        include: {
          user: true,
        },
      });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <
        new Date()
    ) {
      this.clearCookies(response);

      throw new UnauthorizedException(
        "Session expired."
      );
    }

    if (
      session.user.id !==
      payload.sub
    ) {
      throw new UnauthorizedException(
        "Invalid session."
      );
    }

    if (
      session.user.status !==
      "ACTIVE"
    ) {
      throw new UnauthorizedException(
        "This account is unavailable."
      );
    }

    const matches =
      await argon2.verify(
        session.refreshTokenHash,
        refreshToken
      );

    if (!matches) {
      await this.prisma.session.update({
        where: {
          id: session.id,
        },

        data: {
          revokedAt:
            new Date(),
        },
      });

      this.clearCookies(response);

      throw new UnauthorizedException(
        "Session verification failed."
      );
    }

    /*
     * Rotate tokens.
     */

    const tokens =
      await this.generateTokens(
        session.user,
        session.id
      );

    const refreshTokenHash =
      await argon2.hash(
        tokens.refreshToken,
        {
          type: argon2.argon2id,
        }
      );

    await this.prisma.session.update({
      where: {
        id: session.id,
      },

      data: {
        refreshTokenHash,

        expiresAt:
          new Date(
            Date.now() +
              this.getRefreshCookieAge()
          ),
      },
    });

    this.setCookies(
      response,
      tokens.accessToken,
      tokens.refreshToken
    );

    return {
      message: "Session refreshed.",
      user: this.toPublicUser(
        session.user
      ),
    };
  }

  /* =======================================================
     LOGOUT
  ======================================================== */

  async logout(
    request: Request,
    response: Response
  ) {
    const refreshToken =
      request.cookies?.[
        this.refreshCookie
      ];

    if (refreshToken) {
      try {
        const payload =
          await this.jwtService.verifyAsync<RefreshTokenPayload>(
            refreshToken,
            {
              secret:
                this.config.getOrThrow<string>(
                  "JWT_REFRESH_SECRET"
                ),
            }
          );

        if (payload.sid) {
          await this.prisma.session.updateMany({
            where: {
              id: payload.sid,
              revokedAt: null,
            },

            data: {
              revokedAt:
                new Date(),
            },
          });
        }
      } catch {
        // Invalid/expired token should not stop logout.
      }
    }

    this.clearCookies(response);

    return {
      message: "Signed out.",
    };
  }

  /* =======================================================
     LOGOUT ALL DEVICES
  ======================================================== */

  async logoutAll(
    userId: string,
    response: Response
  ) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },

      data: {
        revokedAt:
          new Date(),
      },
    });

    this.clearCookies(response);

    return {
      message:
        "Signed out from all devices.",
    };
  }

  /* =======================================================
     ME
  ======================================================== */

  async me(userId: string) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        "User not found."
      );
    }

    return this.toPublicUser(user);
  }

  /* =======================================================
     FORGOT PASSWORD
  ======================================================== */

  async forgotPassword(
    dto: ForgotPasswordDto
  ) {
    const email = dto.email
      .trim()
      .toLowerCase();

    const user =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

    /*
     * Always return the same response.
     * This prevents account enumeration.
     */

    if (!user) {
      return {
        message:
          "If an account exists for that email, a reset link has been sent.",
      };
    }

    const rawToken =
      randomBytes(32).toString(
        "hex"
      );

    const tokenHash =
      this.hashToken(rawToken);

    await this.prisma.passwordResetToken.deleteMany(
      {
        where: {
          userId: user.id,
          usedAt: null,
        },
      }
    );

    await this.prisma.passwordResetToken.create(
      {
        data: {
          userId: user.id,
          tokenHash,

          expiresAt: new Date(
            Date.now() +
              60 * 60 * 1000
          ),
        },
      }
    );

    const frontendUrl =
      this.config
        .getOrThrow<string>(
          "FRONTEND_URL"
        )
        .split(",")[0]
        .trim();

    const resetUrl =
      `${frontendUrl}/reset-password?token=${encodeURIComponent(
        rawToken
      )}`;

    await this.mailService.sendPasswordReset(
      user.email,
      resetUrl
    );

    return {
      message:
        "If an account exists for that email, a reset link has been sent.",
    };
  }

  /* =======================================================
     RESET PASSWORD
  ======================================================== */

  async resetPassword(
    dto: ResetPasswordDto
  ) {
    const tokenHash =
      this.hashToken(dto.token);

    const resetToken =
      await this.prisma.passwordResetToken.findUnique(
        {
          where: {
            tokenHash,
          },

          include: {
            user: true,
          },
        }
      );

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt <
        new Date()
    ) {
      throw new BadRequestException(
        "This password reset link is invalid or has expired."
      );
    }

    const passwordHash =
      await argon2.hash(
        dto.password,
        {
          type: argon2.argon2id,
        }
      );

    await this.prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: {
            id: resetToken.userId,
          },

          data: {
            passwordHash,
          },
        });

        await tx.passwordResetToken.update({
          where: {
            id: resetToken.id,
          },

          data: {
            usedAt:
              new Date(),
          },
        });

        /*
         * Password change invalidates
         * all existing sessions.
         */

        await tx.session.updateMany({
          where: {
            userId:
              resetToken.userId,

            revokedAt: null,
          },

          data: {
            revokedAt:
              new Date(),
          },
        });
      }
    );

    return {
      message:
        "Password updated successfully.",
    };
  }

  /* =======================================================
     CREATE SESSION
  ======================================================== */

  private async createSessionAndSetCookies(
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      imageUrl: string | null;
      emailVerifiedAt: Date | null;
    },
    request: Request,
    response: Response
  ) {
    /*
     * Create placeholder hash first so we
     * have a session id for the refresh JWT.
     */

    const session =
      await this.prisma.session.create({
        data: {
          userId: user.id,

          refreshTokenHash:
            "pending",

          userAgent:
            request.headers[
              "user-agent"
            ] ?? null,

          ipAddress:
            this.getIpAddress(
              request
            ),

          expiresAt: new Date(
            Date.now() +
              this.getRefreshCookieAge()
          ),
        },
      });

    const tokens =
      await this.generateTokens(
        user,
        session.id
      );

    const refreshTokenHash =
      await argon2.hash(
        tokens.refreshToken,
        {
          type: argon2.argon2id,
        }
      );

    await this.prisma.session.update({
      where: {
        id: session.id,
      },

      data: {
        refreshTokenHash,
      },
    });

    this.setCookies(
      response,
      tokens.accessToken,
      tokens.refreshToken
    );
  }

  /* =======================================================
     JWT TOKENS
  ======================================================== */

  private async generateTokens(
    user: {
      id: string;
      email: string;
      role: string;
    },
    sessionId: string
  ) {
    const accessPayload: AccessTokenPayload =
      {
        sub: user.id,
        email: user.email,
        role:
          user.role as
            | "CUSTOMER"
            | "ADMIN",
        type: "access",
      };

    const refreshPayload: RefreshTokenPayload =
      {
        sub: user.id,
        sid: sessionId,
        type: "refresh",
      };

    const [
      accessToken,
      refreshToken,
    ] = await Promise.all([
      this.jwtService.signAsync(
        accessPayload,
        {
          secret:
            this.config.getOrThrow<string>(
              "JWT_ACCESS_SECRET"
            ),

          expiresIn:
            this.config.get<string>(
              "JWT_ACCESS_EXPIRES_IN"
            ) ?? "15m",
        } as any
      ),

      this.jwtService.signAsync(
        refreshPayload,
        {
          secret:
            this.config.getOrThrow<string>(
              "JWT_REFRESH_SECRET"
            ),

          expiresIn:
            this.config.get<string>(
              "JWT_REFRESH_EXPIRES_IN"
            ) ?? "30d",
        } as any
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  /* =======================================================
     COOKIES
  ======================================================== */

  private setCookies(
    response: Response,
    accessToken: string,
    refreshToken: string
  ) {
    const production =
      this.config.get<string>(
        "NODE_ENV"
      ) === "production";

    const secure =
      production ||
      this.config.get<string>(
        "COOKIE_SECURE"
      ) === "true";

    const sameSite:
      | "lax"
      | "none" = production
      ? "none"
      : "lax";

    response.cookie(
      this.accessCookie,
      accessToken,
      {
        httpOnly: true,
        secure,
        sameSite,

        maxAge:
          this.getAccessCookieAge(),

        path: "/",
      }
    );

    response.cookie(
      this.refreshCookie,
      refreshToken,
      {
        httpOnly: true,
        secure,
        sameSite,

        maxAge:
          this.getRefreshCookieAge(),

        path: "/api/auth",
      }
    );
  }

  private clearCookies(
    response: Response
  ) {
    const production =
      this.config.get<string>(
        "NODE_ENV"
      ) === "production";

    const secure =
      production ||
      this.config.get<string>(
        "COOKIE_SECURE"
      ) === "true";

    const sameSite:
      | "lax"
      | "none" = production
      ? "none"
      : "lax";

    response.clearCookie(
      this.accessCookie,
      {
        httpOnly: true,
        secure,
        sameSite,
        path: "/",
      }
    );

    response.clearCookie(
      this.refreshCookie,
      {
        httpOnly: true,
        secure,
        sameSite,
        path: "/api/auth",
      }
    );
  }

  /* =======================================================
     UTILS
  ======================================================== */

  private toPublicUser(user: {
    id: string;
    name: string;
    email: string;
    role: string;
    imageUrl: string | null;
    emailVerifiedAt: Date | null;
  }): AuthenticatedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,

      role:
        user.role as
          | "CUSTOMER"
          | "ADMIN",

      image: user.imageUrl,

      emailVerified:
        Boolean(
          user.emailVerifiedAt
        ),
    };
  }

  private hashToken(
    token: string
  ): string {
    return createHash("sha256")
      .update(token)
      .digest("hex");
  }

  private getIpAddress(
    request: Request
  ) {
    const forwarded =
      request.headers[
        "x-forwarded-for"
      ];

    if (
      typeof forwarded === "string"
    ) {
      return forwarded
        .split(",")[0]
        .trim();
    }

    return request.ip ?? null;
  }

  private getAccessCookieAge() {
    return this.parseDuration(
      this.config.get<string>(
        "JWT_ACCESS_EXPIRES_IN"
      ) ?? "15m"
    );
  }

  private getRefreshCookieAge() {
    return this.parseDuration(
      this.config.get<string>(
        "JWT_REFRESH_EXPIRES_IN"
      ) ?? "30d"
    );
  }

  private parseDuration(
    value: string
  ): number {
    const match =
      value.match(
        /^(\d+)(s|m|h|d)$/
      );

    if (!match) {
      return 15 * 60 * 1000;
    }

    const amount =
      Number(match[1]);

    const unit =
      match[2];

    const multiplier = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    }[unit];

    return (
      amount *
      (multiplier ??
        60 * 1000)
    );
  }
}