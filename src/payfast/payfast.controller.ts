import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";

import type {
  Request,
} from "express";

import {
  PayfastService,
} from "./payfast.service";

/* =========================================================
   PAYFAST CONTROLLER
========================================================= */

@Controller(
  "payfast"
)
export class PayfastController {
  constructor(
    private readonly payfastService:
      PayfastService
  ) {}

  /* =======================================================
     PAYFAST ITN / NOTIFY URL
  ======================================================== */

  /**
   * PayFast sends its server-to-server payment notification
   * to this endpoint.
   *
   * With the global Nest prefix "api", the final URL is:
   *
   * POST /api/payfast/notify
   *
   * This endpoint is the ONLY place that should cause a
   * PayFast order to become paid.
   *
   * The browser returning to /checkout/success must never
   * mark an order as paid.
   */
  @Post(
    "notify"
  )
  @HttpCode(
    200
  )
  @Header(
    "Content-Type",
    "text/plain; charset=utf-8"
  )
  async notify(
    @Body()
    body:
      Record<
        string,
        string
      >,

    @Req()
    request:
      Request
  ) {
    /*
     * PayFast normally posts application/x-www-form-urlencoded
     * fields. Nest/Express parses them into `body`.
     *
     * processItn() performs the important verification work:
     *
     * - signature verification
     * - merchant verification
     * - PayFast source verification
     * - remote PayFast validation
     * - order lookup
     * - amount verification
     * - idempotent payment completion
     */
    await this.payfastService.processItn(
      this.normalizeBody(
        body
      ),
      this.getRequestIp(
        request
      )
    );

    /*
     * PayFast only needs a successful HTTP response after
     * the ITN has been accepted and processed.
     */
    return "OK";
  }

  /* =======================================================
     HELPERS
  ======================================================== */

  private normalizeBody(
    body:
      Record<
        string,
        unknown
      >
  ): Record<
    string,
    string
  > {
    const normalized:
      Record<
        string,
        string
      > = {};

    for (
      const [
        key,
        value,
      ] of Object.entries(
        body ?? {}
      )
    ) {
      if (
        value ===
          undefined ||
        value ===
          null
      ) {
        continue;
      }

      if (
        Array.isArray(
          value
        )
      ) {
        normalized[key] =
          value
            .map(
              (
                item
              ) =>
                String(
                  item
                )
            )
            .join(
              ","
            );

        continue;
      }

      normalized[key] =
        String(
          value
        );
    }

    return normalized;
  }

  private getRequestIp(
    request:
      Request
  ) {
    /*
     * If the API is deployed behind Railway, Render, Nginx,
     * Cloudflare, etc., make sure your Nest/Express proxy
     * configuration is correct so request.ip is trustworthy.
     *
     * The PayfastService performs the actual source-IP
     * verification when enabled.
     */
    return (
      request.ip ??
      request.socket
        .remoteAddress ??
      undefined
    );
  }
}
