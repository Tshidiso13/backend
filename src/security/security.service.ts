import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import {
  createHash,
} from "crypto";

import * as bcrypt from "bcryptjs";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  ChangePasswordDto,
} from "./dto/change-password.dto";

@Injectable()
export class SecurityService {
  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  /* =======================================================
     SECURITY OVERVIEW
  ======================================================== */

  async getOverview(
    userId:
      string,

    rawRefreshToken?:
      string
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id:
            userId,
        },

        select: {
          id:
            true,

          email:
            true,

          passwordHash:
            true,

          googleId:
            true,

          emailVerifiedAt:
            true,

          lastLoginAt:
            true,

          createdAt:
            true,

          sessions: {
            where: {
              revokedAt:
                null,

              expiresAt: {
                gt:
                  new Date(),
              },
            },

            orderBy: {
              createdAt:
                "desc",
            },

            select: {
              id:
                true,

              refreshTokenHash:
                true,

              userAgent:
                true,

              ipAddress:
                true,

              expiresAt:
                true,

              createdAt:
                true,

              updatedAt:
                true,
            },
          },
        },
      });

    if (
      !user
    ) {
      throw new UnauthorizedException(
        "Account not found."
      );
    }

    const currentTokenHash =
      rawRefreshToken
        ? hashToken(
            rawRefreshToken
          )
        : null;

    return {
      email:
        user.email,

      hasPassword:
        Boolean(
          user.passwordHash
        ),

      googleConnected:
        Boolean(
          user.googleId
        ),

      emailVerified:
        Boolean(
          user.emailVerifiedAt
        ),

      lastLoginAt:
        user.lastLoginAt,

      memberSince:
        user.createdAt,

      activeSessionCount:
        user.sessions.length,

      sessions:
        user.sessions.map(
          (
            session
          ) => ({
            id:
              session.id,

            userAgent:
              session.userAgent,

            ipAddress:
              session.ipAddress,

            expiresAt:
              session.expiresAt,

            createdAt:
              session.createdAt,

            updatedAt:
              session.updatedAt,

            isCurrent:
              Boolean(
                currentTokenHash &&
                session.refreshTokenHash ===
                  currentTokenHash
              ),
          })
        ),
    };
  }

  /* =======================================================
     CHANGE / CREATE PASSWORD

     - Password users must supply their current password.
     - Google-only users may create a password from an already
       authenticated session.
     - All sessions are revoked after a successful password
       change so stolen refresh tokens cannot remain active.
  ======================================================== */

  async changePassword(
    userId:
      string,

    input:
      ChangePasswordDto
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id:
            userId,
        },

        select: {
          id:
            true,

          passwordHash:
            true,
        },
      });

    if (
      !user
    ) {
      throw new UnauthorizedException(
        "Account not found."
      );
    }

    if (
      user.passwordHash
    ) {
      if (
        !input.currentPassword
      ) {
        throw new BadRequestException(
          "Enter your current password."
        );
      }

      const currentValid =
        await bcrypt.compare(
          input.currentPassword,
          user.passwordHash
        );

      if (
        !currentValid
      ) {
        throw new BadRequestException(
          "Current password is incorrect."
        );
      }

      const samePassword =
        await bcrypt.compare(
          input.newPassword,
          user.passwordHash
        );

      if (
        samePassword
      ) {
        throw new BadRequestException(
          "New password must be different from your current password."
        );
      }
    }

    const passwordHash =
      await bcrypt.hash(
        input.newPassword,
        12
      );

    const now =
      new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id:
            userId,
        },

        data: {
          passwordHash,
        },
      }),

      this.prisma.session.updateMany({
        where: {
          userId,

          revokedAt:
            null,
        },

        data: {
          revokedAt:
            now,
        },
      }),

      this.prisma.passwordResetToken.updateMany({
        where: {
          userId,

          usedAt:
            null,
        },

        data: {
          usedAt:
            now,
        },
      }),
    ]);

    return {
      message:
        user.passwordHash
          ? "Password changed successfully. Please sign in again."
          : "Password created successfully. Please sign in again.",

      requiresReauthentication:
        true,
    };
  }

  /* =======================================================
     REVOKE ONE SESSION
  ======================================================== */

  async revokeSession(
    userId:
      string,

    sessionId:
      string,

    rawRefreshToken?:
      string
  ) {
    const session =
      await this.prisma.session.findFirst({
        where: {
          id:
            sessionId,

          userId,
        },

        select: {
          id:
            true,

          refreshTokenHash:
            true,

          revokedAt:
            true,
        },
      });

    if (
      !session
    ) {
      throw new NotFoundException(
        "Session not found."
      );
    }

    const currentHash =
      rawRefreshToken
        ? hashToken(
            rawRefreshToken
          )
        : null;

    const isCurrent =
      Boolean(
        currentHash &&
        currentHash ===
          session.refreshTokenHash
      );

    if (
      !session.revokedAt
    ) {
      await this.prisma.session.update({
        where: {
          id:
            session.id,
        },

        data: {
          revokedAt:
            new Date(),
        },
      });
    }

    return {
      revoked:
        true,

      isCurrent,
    };
  }

  /* =======================================================
     REVOKE OTHER SESSIONS
  ======================================================== */

  async revokeOtherSessions(
    userId:
      string,

    rawRefreshToken?:
      string
  ) {
    if (
      !rawRefreshToken
    ) {
      throw new BadRequestException(
        "Current session could not be identified."
      );
    }

    const currentHash =
      hashToken(
        rawRefreshToken
      );

    const current =
      await this.prisma.session.findFirst({
        where: {
          userId,

          refreshTokenHash:
            currentHash,

          revokedAt:
            null,

          expiresAt: {
            gt:
              new Date(),
          },
        },

        select: {
          id:
            true,
        },
      });

    if (
      !current
    ) {
      throw new BadRequestException(
        "Current session could not be identified."
      );
    }

    const result =
      await this.prisma.session.updateMany({
        where: {
          userId,

          revokedAt:
            null,

          id: {
            not:
              current.id,
          },
        },

        data: {
          revokedAt:
            new Date(),
        },
      });

    return {
      revoked:
        result.count,
    };
  }

  /* =======================================================
     REVOKE ALL SESSIONS
  ======================================================== */

  async revokeAllSessions(
    userId:
      string
  ) {
    const result =
      await this.prisma.session.updateMany({
        where: {
          userId,

          revokedAt:
            null,
        },

        data: {
          revokedAt:
            new Date(),
        },
      });

    return {
      revoked:
        result.count,

      requiresReauthentication:
        true,
    };
  }
}

function hashToken(
  value:
    string
) {
  return createHash(
    "sha256"
  )
    .update(
      value
    )
    .digest(
      "hex"
    );
}
