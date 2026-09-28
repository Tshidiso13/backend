import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  UpdateProfileDto,
} from "./dto/update-profile.dto";

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  /* =======================================================
     GET CURRENT PROFILE
  ======================================================== */

  async getProfile(
    userId:
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

          name:
            true,

          email:
            true,

          /*
           * Your actual Prisma User model uses imageUrl,
           * not image.
           */
          imageUrl:
            true,

          role:
            true,

          /*
           * Your schema uses emailVerifiedAt instead of
           * a boolean emailVerified field.
           */
          emailVerifiedAt:
            true,

          createdAt:
            true,

          updatedAt:
            true,
        },
      });

    if (
      !user
    ) {
      throw new NotFoundException(
        "Account not found."
      );
    }

    /*
     * Keep the frontend API contract simple:
     * expose image + emailVerified even though Prisma stores
     * imageUrl + emailVerifiedAt.
     */
    return {
      id:
        user.id,

      name:
        user.name,

      email:
        user.email,

      image:
        user.imageUrl,

      role:
        user.role,

      emailVerified:
        Boolean(
          user.emailVerifiedAt
        ),

      createdAt:
        user.createdAt,

      updatedAt:
        user.updatedAt,
    };
  }

  /* =======================================================
     UPDATE CURRENT PROFILE
  ======================================================== */

  async updateProfile(
    userId:
      string,

    input:
      UpdateProfileDto
  ) {
    if (
      input.name ===
        undefined &&
      input.email ===
        undefined
    ) {
      throw new BadRequestException(
        "Provide at least one profile field to update."
      );
    }

    const current =
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
        },
      });

    if (
      !current
    ) {
      throw new NotFoundException(
        "Account not found."
      );
    }

    const normalizedEmail =
      input.email
        ?.trim()
        .toLowerCase();

    if (
      normalizedEmail &&
      normalizedEmail !==
        current.email.toLowerCase()
    ) {
      const existing =
        await this.prisma.user.findUnique({
          where: {
            email:
              normalizedEmail,
          },

          select: {
            id:
              true,
          },
        });

      if (
        existing &&
        existing.id !==
          userId
      ) {
        throw new ConflictException(
          "An account with that email already exists."
        );
      }
    }

    const updated =
      await this.prisma.user.update({
        where: {
          id:
            userId,
        },

        data: {
          ...(input.name !==
          undefined
            ? {
                name:
                  input.name,
              }
            : {}),

          ...(normalizedEmail !==
          undefined
            ? {
                email:
                  normalizedEmail,

                /*
                 * If the user changes their email address,
                 * the new address should no longer be treated
                 * as verified.
                 */
                ...(normalizedEmail !==
                current.email.toLowerCase()
                  ? {
                      emailVerifiedAt:
                        null,
                    }
                  : {}),
              }
            : {}),
        },

        select: {
          id:
            true,

          name:
            true,

          email:
            true,

          imageUrl:
            true,

          role:
            true,

          emailVerifiedAt:
            true,

          createdAt:
            true,

          updatedAt:
            true,
        },
      });

    return {
      id:
        updated.id,

      name:
        updated.name,

      email:
        updated.email,

      image:
        updated.imageUrl,

      role:
        updated.role,

      emailVerified:
        Boolean(
          updated.emailVerifiedAt
        ),

      createdAt:
        updated.createdAt,

      updatedAt:
        updated.updatedAt,
    };
  }
}
