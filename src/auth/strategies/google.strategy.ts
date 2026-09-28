import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";

import {
  Profile,
  Strategy,
  VerifyCallback,
} from "passport-google-oauth20";

import type { GoogleProfile } from "../auth.types";

@Injectable()
export class GoogleStrategy extends PassportStrategy(
  Strategy,
  "google"
) {
  constructor(
    configService: ConfigService
  ) {
    super({
      clientID:
        configService.getOrThrow<string>(
          "GOOGLE_CLIENT_ID"
        ),

      clientSecret:
        configService.getOrThrow<string>(
          "GOOGLE_CLIENT_SECRET"
        ),

      callbackURL:
        configService.getOrThrow<string>(
          "GOOGLE_CALLBACK_URL"
        ),

      scope: ["email", "profile"],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback
  ) {
    const email =
      profile.emails?.[0]?.value;

    if (!email) {
      return done(
        new UnauthorizedException(
          "Google did not provide an email address."
        ),
        false
      );
    }

    const googleUser: GoogleProfile = {
      googleId: profile.id,

      email: email
        .trim()
        .toLowerCase(),

      name:
        profile.displayName ||
        `${profile.name?.givenName ?? ""} ${
          profile.name?.familyName ?? ""
        }`.trim() ||
        "ÉLAN Customer",

      image:
        profile.photos?.[0]?.value ??
        null,
    };

    done(null, googleUser);
  }
}