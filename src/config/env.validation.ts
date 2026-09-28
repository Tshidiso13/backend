import * as Joi from "joi";

export const envValidationSchema =
    Joi.object({
        NODE_ENV: Joi.string()
            .valid(
                "development",
                "test",
                "production"
            )
            .default("development"),

        PORT: Joi.number().default(5000),

        FRONTEND_URL: Joi.string()
            .required(),

        DATABASE_URL: Joi.string()
            .required(),

        DIRECT_URL: Joi.string()
            .required(),

        JWT_ACCESS_SECRET: Joi.string()
            .min(32)
            .required(),

        JWT_REFRESH_SECRET: Joi.string()
            .min(32)
            .required(),

        JWT_ACCESS_EXPIRES_IN:
            Joi.string().default("15m"),

        JWT_REFRESH_EXPIRES_IN:
            Joi.string().default("30d"),

        COOKIE_SECURE:
            Joi.boolean().default(false),

        CLOUDINARY_CLOUD_NAME:
            Joi.string().required(),

        CLOUDINARY_API_KEY:
            Joi.string().required(),

        CLOUDINARY_API_SECRET:
            Joi.string().required(),
    });