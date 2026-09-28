-- =========================================================
-- PRODUCT IMAGES MIGRATION
--
-- Converts:
-- Product.images TEXT[]
--
-- Into:
-- ProductImage rows
-- =========================================================


-- =========================================================
-- 1. CREATE PRODUCT IMAGE TABLE
-- =========================================================

CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey"
    PRIMARY KEY ("id")
);


-- =========================================================
-- 2. COPY EXISTING Product.images INTO ProductImage
-- =========================================================
--
-- Cloudinary URLs:
--
-- https://res.cloudinary.com/cloud/image/upload/v123/
-- elan/products/perfume.png
--
-- become:
--
-- publicId = elan/products/perfume
--
-- Non-Cloudinary legacy URLs are preserved using a generated
-- legacy publicId so the image URL itself is not lost.
-- =========================================================

INSERT INTO "ProductImage" (
    "id",
    "productId",
    "publicId",
    "url",
    "position",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT(
        'img_',
        md5(
            p."id"
            || image_data.url
            || image_data.ordinality::TEXT
        )
    ),

    p."id",

    CASE
        WHEN image_data.url LIKE
            'https://res.cloudinary.com/%/image/upload/%'
        THEN
            regexp_replace(
                regexp_replace(
                    split_part(
                        split_part(
                            image_data.url,
                            '/image/upload/',
                            2
                        ),
                        '?',
                        1
                    ),
                    '^v[0-9]+/',
                    ''
                ),
                '\.[A-Za-z0-9]+$',
                ''
            )

        ELSE
            CONCAT(
                'legacy/',
                md5(image_data.url)
            )
    END,

    image_data.url,

    (image_data.ordinality - 1)::INTEGER,

    CURRENT_TIMESTAMP,

    CURRENT_TIMESTAMP

FROM "Product" AS p

CROSS JOIN LATERAL
    unnest(
        COALESCE(
            p."images",
            ARRAY[]::TEXT[]
        )
    )
    WITH ORDINALITY
    AS image_data(
        url,
        ordinality
    )

WHERE
    image_data.url IS NOT NULL
    AND trim(image_data.url) <> '';


-- =========================================================
-- 3. UNIQUE CLOUDINARY PUBLIC ID
-- =========================================================

CREATE UNIQUE INDEX
"ProductImage_publicId_key"
ON "ProductImage"("publicId");


-- =========================================================
-- 4. PRODUCT IMAGE INDEXES
-- =========================================================

CREATE INDEX
"ProductImage_productId_idx"
ON "ProductImage"("productId");


CREATE INDEX
"ProductImage_productId_position_idx"
ON "ProductImage"(
    "productId",
    "position"
);


-- =========================================================
-- 5. PRODUCT RELATION
-- =========================================================

ALTER TABLE "ProductImage"

ADD CONSTRAINT
"ProductImage_productId_fkey"

FOREIGN KEY ("productId")

REFERENCES "Product"("id")

ON DELETE CASCADE

ON UPDATE CASCADE;


-- =========================================================
-- 6. REMOVE OLD Product.images ARRAY
-- =========================================================

ALTER TABLE "Product"
DROP COLUMN "images";