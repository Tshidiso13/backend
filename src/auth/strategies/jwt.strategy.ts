import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { ConfigService } from "@nestjs/config";

import {
  ExtractJwt,
  Strategy,
} from "passport-jwt";

import { PassportStrategy } from "@nestjs/passport";

import type { Request } from "express";

import { PrismaService } from "../../prisma/prisma.service";

import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from "../auth.types";

function cookieExtractor(
  request: Request
): string | null {
  if (!request?.cookies) {
    return null;
  }

  return (
    request.cookies[
      "elan_access_token"
    ] ?? null
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(
  Strategy,
  "jwt"
) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService
  ) {
    super({
      jwtFromRequest:
        ExtractJwt.fromExtractors([
          cookieExtractor,
          ExtractJwt.fromAuthHeaderAsBearerToken(),
        ]),

      ignoreExpiration: false,

      secretOrKey:
        configService.getOrThrow<string>(
          "JWT_ACCESS_SECRET"
        ),
    });
  }

  async validate(
    payload: AccessTokenPayload
  ): Promise<AuthenticatedUser> {
    if (payload.type !== "access") {
      throw new UnauthorizedException(
        "Invalid access token."
      );
    }

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: payload.sub,
        },

        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          imageUrl: true,
          emailVerifiedAt: true,
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        "User no longer exists."
      );
    }

    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException(
        "This account is unavailable."
      );
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.imageUrl,
      emailVerified:
        Boolean(user.emailVerifiedAt),
    };
  }
}