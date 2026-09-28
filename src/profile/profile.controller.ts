import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";

import {
  UpdateProfileDto,
} from "./dto/update-profile.dto";

import {
  ProfileService,
} from "./profile.service";

type AuthenticatedRequest = {
  user: {
    id:
      string;
  };
};

@Controller(
  "account/profile"
)
@UseGuards(
  JwtAuthGuard
)
export class ProfileController {
  constructor(
    private readonly profileService:
      ProfileService
  ) {}

  @Get()
  getProfile(
    @Req()
    request:
      AuthenticatedRequest
  ) {
    return this.profileService.getProfile(
      request.user.id
    );
  }

  @Patch()
  updateProfile(
    @Req()
    request:
      AuthenticatedRequest,

    @Body()
    body:
      UpdateProfileDto
  ) {
    return this.profileService.updateProfile(
      request.user.id,
      body
    );
  }
}
