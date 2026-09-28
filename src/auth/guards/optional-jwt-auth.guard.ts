import {
  Injectable,
} from "@nestjs/common";

import {
  AuthGuard,
} from "@nestjs/passport";

/* =========================================================
   OPTIONAL JWT AUTH GUARD
========================================================= */

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard(
  "jwt"
) {
  /**
   * Normal JwtAuthGuard behavior:
   *
   * - valid JWT  -> request.user is populated
   * - no JWT     -> 401
   * - bad JWT    -> 401
   *
   * Checkout needs different behavior:
   *
   * - valid JWT  -> request.user is populated
   * - no JWT     -> continue as guest
   * - bad/expired JWT -> continue as guest
   *
   * This allows one checkout endpoint to support both
   * account customers and guest customers.
   */
  handleRequest<TUser = unknown>(
    _err: unknown,
    user: TUser | false | null
  ): TUser | null {
    return user || null;
  }
}
