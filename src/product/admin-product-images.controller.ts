import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";

import {
  FileInterceptor,
} from "@nestjs/platform-express";

import {
  memoryStorage,
} from "multer";

import { CloudinaryService } from "../cloudinary/cloudinary.service";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";

@Controller(
  "admin/products/images"
)
@UseGuards(
  JwtAuthGuard,
  RolesGuard
)
@Roles("ADMIN")
export class AdminProductImagesController {
  constructor(
    private readonly cloudinaryService:
      CloudinaryService
  ) {}

  /* =======================================================
     TEST CONNECTION
  ======================================================== */

  @Get("health")
  health() {
    return this.cloudinaryService.verifyConnection();
  }

  /* =======================================================
     UPLOAD
  ======================================================== */

  @Post()
  @UseInterceptors(
    FileInterceptor(
      "file",
      {
        storage:
          memoryStorage(),

        limits: {
          fileSize:
            5 *
            1024 *
            1024,
        },

        fileFilter: (
          _request,
          file,
          callback
        ) => {
          const allowedTypes =
            [
              "image/jpeg",
              "image/png",
              "image/webp",
            ];

          if (
            !allowedTypes.includes(
              file.mimetype
            )
          ) {
            callback(
              new BadRequestException(
                "Only JPG, PNG and WebP images are allowed."
              ),
              false
            );

            return;
          }

          callback(
            null,
            true
          );
        },
      }
    )
  )
  upload(
    @UploadedFile()
    file:
      | Express.Multer.File
      | undefined
  ) {
    if (!file) {
      throw new BadRequestException(
        "Product image is required."
      );
    }

    return this.cloudinaryService.uploadProductImage(
      file
    );
  }

  /* =======================================================
     DELETE
  ======================================================== */

  @Delete()
  remove(
    @Body("publicId")
    publicId: string
  ) {
    return this.cloudinaryService.deleteImage(
      publicId
    );
  }
}