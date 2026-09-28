import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  PrismaService,
} from "../prisma/prisma.service";

import {
  CreateAddressDto,
} from "./dto/create-address.dto";

import {
  UpdateAddressDto,
} from "./dto/update-address.dto";

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma:
      PrismaService
  ) {}

  /* =======================================================
     LIST
  ======================================================== */

  async findMine(
    userId:
      string
  ) {
    return this.prisma.address.findMany({
      where: {
        userId,
      },

      orderBy: [
        {
          isDefault:
            "desc",
        },

        {
          createdAt:
            "desc",
        },
      ],
    });
  }

  /* =======================================================
     GET ONE
  ======================================================== */

  async findOne(
    userId:
      string,

    addressId:
      string
  ) {
    return this.requireOwnedAddress(
      userId,
      addressId
    );
  }

  /* =======================================================
     CREATE

     First saved address automatically becomes default.
     Choosing default on a later address clears the previous
     default in the same transaction.
  ======================================================== */

  async create(
    userId:
      string,

    input:
      CreateAddressDto
  ) {
    const existingCount =
      await this.prisma.address.count({
        where: {
          userId,
        },
      });

    const shouldBeDefault =
      existingCount ===
        0 ||
      input.isDefault ===
        true;

    return this.prisma.$transaction(
      async (
        tx
      ) => {
        if (
          shouldBeDefault
        ) {
          await tx.address.updateMany({
            where: {
              userId,

              isDefault:
                true,
            },

            data: {
              isDefault:
                false,
            },
          });
        }

        return tx.address.create({
          data: {
            userId,

            label:
              input.label ??
              null,

            recipientName:
              input.recipientName,

            phone:
              input.phone,

            addressLine1:
              input.addressLine1,

            addressLine2:
              input.addressLine2 ??
              null,

            suburb:
              input.suburb ??
              null,

            city:
              input.city,

            province:
              input.province,

            postalCode:
              input.postalCode,

            country:
              input.country ??
              "South Africa",

            isDefault:
              shouldBeDefault,
          },
        });
      }
    );
  }

  /* =======================================================
     UPDATE

     An address cannot simply unset itself as the default
     because the account should keep one default whenever
     addresses exist. To change the default, set another
     address as default.
  ======================================================== */

  async update(
    userId:
      string,

    addressId:
      string,

    input:
      UpdateAddressDto
  ) {
    const current =
      await this.requireOwnedAddress(
        userId,
        addressId
      );

    if (
      current.isDefault &&
      input.isDefault ===
        false
    ) {
      throw new BadRequestException(
        "Choose another address as default instead of removing the current default."
      );
    }

    return this.prisma.$transaction(
      async (
        tx
      ) => {
        if (
          input.isDefault ===
          true
        ) {
          await tx.address.updateMany({
            where: {
              userId,

              id: {
                not:
                  addressId,
              },

              isDefault:
                true,
            },

            data: {
              isDefault:
                false,
            },
          });
        }

        return tx.address.update({
          where: {
            id:
              addressId,
          },

          data: {
            ...(input.label !==
            undefined
              ? {
                  label:
                    input.label ??
                    null,
                }
              : {}),

            ...(input.recipientName !==
            undefined
              ? {
                  recipientName:
                    input.recipientName,
                }
              : {}),

            ...(input.phone !==
            undefined
              ? {
                  phone:
                    input.phone,
                }
              : {}),

            ...(input.addressLine1 !==
            undefined
              ? {
                  addressLine1:
                    input.addressLine1,
                }
              : {}),

            ...(input.addressLine2 !==
            undefined
              ? {
                  addressLine2:
                    input.addressLine2 ??
                    null,
                }
              : {}),

            ...(input.suburb !==
            undefined
              ? {
                  suburb:
                    input.suburb ??
                    null,
                }
              : {}),

            ...(input.city !==
            undefined
              ? {
                  city:
                    input.city,
                }
              : {}),

            ...(input.province !==
            undefined
              ? {
                  province:
                    input.province,
                }
              : {}),

            ...(input.postalCode !==
            undefined
              ? {
                  postalCode:
                    input.postalCode,
                }
              : {}),

            ...(input.country !==
            undefined
              ? {
                  country:
                    input.country ??
                    "South Africa",
                }
              : {}),

            ...(input.isDefault !==
            undefined
              ? {
                  isDefault:
                    input.isDefault,
                }
              : {}),
          },
        });
      }
    );
  }

  /* =======================================================
     SET DEFAULT
  ======================================================== */

  async setDefault(
    userId:
      string,

    addressId:
      string
  ) {
    await this.requireOwnedAddress(
      userId,
      addressId
    );

    return this.prisma.$transaction(
      async (
        tx
      ) => {
        await tx.address.updateMany({
          where: {
            userId,

            isDefault:
              true,

            id: {
              not:
                addressId,
            },
          },

          data: {
            isDefault:
              false,
          },
        });

        return tx.address.update({
          where: {
            id:
              addressId,
          },

          data: {
            isDefault:
              true,
          },
        });
      }
    );
  }

  /* =======================================================
     DELETE

     If the default address is removed, promote the most
     recently updated remaining address to default.
  ======================================================== */

  async remove(
    userId:
      string,

    addressId:
      string
  ) {
    const current =
      await this.requireOwnedAddress(
        userId,
        addressId
      );

    await this.prisma.$transaction(
      async (
        tx
      ) => {
        await tx.address.delete({
          where: {
            id:
              addressId,
          },
        });

        if (
          current.isDefault
        ) {
          const next =
            await tx.address.findFirst({
              where: {
                userId,
              },

              orderBy: {
                updatedAt:
                  "desc",
              },

              select: {
                id:
                  true,
              },
            });

          if (
            next
          ) {
            await tx.address.update({
              where: {
                id:
                  next.id,
              },

              data: {
                isDefault:
                  true,
              },
            });
          }
        }
      }
    );

    return {
      deleted:
        true,
    };
  }

  /* =======================================================
     OWNERSHIP
  ======================================================== */

  private async requireOwnedAddress(
    userId:
      string,

    addressId:
      string
  ) {
    const address =
      await this.prisma.address.findFirst({
        where: {
          id:
            addressId,

          userId,
        },
      });

    if (
      !address
    ) {
      /*
       * Generic not-found response avoids revealing whether
       * another user's address id exists.
       */
      throw new NotFoundException(
        "Address not found."
      );
    }

    return address;
  }
}
