import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";

import { ConfigService } from "@nestjs/config";

import {
  v2 as cloudinary,
} from "cloudinary";

type CloudinaryUploadResponse = {
  asset_id: string;
  public_id: string;
  version: number;
  version_id?: string;
  signature: string;
  width: number;
  height: number;
  format: string;
  resource_type: string;
  created_at: string;
  tags: string[];
  bytes: number;
  type: string;
  etag: string;
  placeholder: boolean;
  url: string;
  secure_url: string;
  original_filename: string;
};

@Injectable()
export class CloudinaryService {
  private readonly logger =
    new Logger(
      CloudinaryService.name
    );

  private readonly cloudName:
    string;

  private readonly apiKey:
    string;

  private readonly apiSecret:
    string;

  constructor(
    private readonly configService:
      ConfigService
  ) {
    this.cloudName =
      this.configService
        .getOrThrow<string>(
          "CLOUDINARY_CLOUD_NAME"
        )
        .trim();

    this.apiKey =
      this.configService
        .getOrThrow<string>(
          "CLOUDINARY_API_KEY"
        )
        .trim();

    this.apiSecret =
      this.configService
        .getOrThrow<string>(
          "CLOUDINARY_API_SECRET"
        )
        .trim();

    cloudinary.config({
      cloud_name:
        this.cloudName,

      api_key:
        this.apiKey,

      api_secret:
        this.apiSecret,

      secure: true,
    });

    this.logger.log(
      `Cloudinary configured for cloud: ${this.cloudName}`
    );
  }

  /* =======================================================
     HEALTH TEST
  ======================================================== */

  async verifyConnection() {
    try {
      const result =
        await cloudinary.api.ping();

      this.logger.log(
        `Cloudinary connection OK: ${JSON.stringify(
          result
        )}`
      );

      return {
        ok: true,
        result,
      };
    } catch (error) {
      this.logger.error(
        "Cloudinary connection failed.",
        error instanceof Error
          ? error.stack
          : JSON.stringify(
              error
            )
      );

      return {
        ok: false,
      };
    }
  }

  /* =======================================================
     UPLOAD PRODUCT IMAGE
  ======================================================== */

  async uploadProductImage(
    file: Express.Multer.File
  ) {
    if (
      !file ||
      !file.buffer ||
      file.buffer.length === 0
    ) {
      throw new BadRequestException(
        "Product image is required."
      );
    }

    const allowedTypes =
      new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
      ]);

    if (
      !allowedTypes.has(
        file.mimetype
      )
    ) {
      throw new BadRequestException(
        "Only JPG, PNG and WebP images are allowed."
      );
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      throw new BadRequestException(
        "Image must be smaller than 5 MB."
      );
    }

    this.logger.log(
      `Uploading product image: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`
    );

    const timestamp =
      Math.floor(
        Date.now() / 1000
      );

    /*
     * These are the exact parameters
     * included in the signature.
     */
    const paramsToSign = {
      folder:
        "elan/products",

      timestamp,
    };

    const signature =
      cloudinary.utils.api_sign_request(
        paramsToSign,
        this.apiSecret
      );

    const formData =
      new FormData();

    const blob =
      new Blob(
        [
          new Uint8Array(
            file.buffer
          ),
        ],
        {
          type:
            file.mimetype,
        }
      );

    formData.append(
      "file",
      blob,
      file.originalname
    );

    formData.append(
      "api_key",
      this.apiKey
    );

    formData.append(
      "timestamp",
      String(timestamp)
    );

    formData.append(
      "folder",
      "elan/products"
    );

    formData.append(
      "signature",
      signature
    );

    const endpoint =
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(
        this.cloudName
      )}/image/upload`;

    try {
      const response =
        await fetch(
          endpoint,
          {
            method: "POST",
            body:
              formData,
          }
        );

      const body =
        await response.text();

      const cloudinaryError =
        response.headers.get(
          "x-cld-error"
        );

      this.logger.log(
        `Cloudinary HTTP status: ${response.status}`
      );

      if (cloudinaryError) {
        this.logger.error(
          `Cloudinary X-Cld-Error: ${cloudinaryError}`
        );
      }

      if (!response.ok) {
        this.logger.error(
          `Cloudinary response body: ${body}`
        );

        throw new InternalServerErrorException(
          cloudinaryError ||
            `Cloudinary rejected the upload with HTTP ${response.status}.`
        );
      }

      let result:
        CloudinaryUploadResponse;

      try {
        result =
          JSON.parse(
            body
          ) as CloudinaryUploadResponse;
      } catch {
        throw new InternalServerErrorException(
          "Cloudinary returned an invalid response."
        );
      }

      if (
        !result.public_id ||
        !result.secure_url
      ) {
        throw new InternalServerErrorException(
          "Cloudinary upload response is incomplete."
        );
      }

      this.logger.log(
        `Cloudinary upload successful: ${result.public_id}`
      );

      return {
        fileId:
          result.public_id,

        publicId:
          result.public_id,

        assetId:
          result.asset_id,

        name:
          result.original_filename,

        filePath:
          result.public_id,

        url:
          result.secure_url,

        thumbnailUrl:
          result.secure_url,

        width:
          result.width,

        height:
          result.height,

        size:
          result.bytes,

        format:
          result.format,

        resourceType:
          result.resource_type,
      };
    } catch (error) {
      if (
        error instanceof
        InternalServerErrorException
      ) {
        throw error;
      }

      this.logger.error(
        "Cloudinary upload request failed.",
        error instanceof Error
          ? error.stack
          : String(error)
      );

      throw new InternalServerErrorException(
        "Unable to upload product image."
      );
    }
  }

  /* =======================================================
     DELETE
  ======================================================== */

  async deleteImage(
    publicId: string
  ) {
    const cleanPublicId =
      publicId?.trim();

    if (!cleanPublicId) {
      throw new BadRequestException(
        "Cloudinary public ID is required."
      );
    }

    try {
      const result =
        await cloudinary.uploader.destroy(
          cleanPublicId,
          {
            resource_type:
              "image",

            invalidate:
              true,
          }
        );

      return {
        message:
          "Image deleted successfully.",

        result:
          result.result,
      };
    } catch (error) {
      this.logger.error(
        "Cloudinary delete failed.",
        error instanceof Error
          ? error.stack
          : JSON.stringify(
              error
            )
      );

      throw new InternalServerErrorException(
        "Unable to delete image."
      );
    }
  }
}