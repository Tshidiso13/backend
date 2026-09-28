import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  JwtAuthGuard,
} from "../auth/guards/jwt-auth.guard";

import {
  AddressesService,
} from "./addresses.service";

import {
  CreateAddressDto,
} from "./dto/create-address.dto";

import {
  UpdateAddressDto,
} from "./dto/update-address.dto";

type AuthenticatedRequest = {
  user: {
    id:
      string;
  };
};

@Controller(
  "account/addresses"
)
@UseGuards(
  JwtAuthGuard
)
export class AddressesController {
  constructor(
    private readonly addressesService:
      AddressesService
  ) {}

  @Get()
  findMine(
    @Req()
    request:
      AuthenticatedRequest
  ) {
    return this.addressesService.findMine(
      request.user.id
    );
  }

  @Get(
    ":addressId"
  )
  findOne(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "addressId"
    )
    addressId:
      string
  ) {
    return this.addressesService.findOne(
      request.user.id,
      addressId
    );
  }

  @Post()
  create(
    @Req()
    request:
      AuthenticatedRequest,

    @Body()
    body:
      CreateAddressDto
  ) {
    return this.addressesService.create(
      request.user.id,
      body
    );
  }

  @Patch(
    ":addressId"
  )
  update(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "addressId"
    )
    addressId:
      string,

    @Body()
    body:
      UpdateAddressDto
  ) {
    return this.addressesService.update(
      request.user.id,
      addressId,
      body
    );
  }

  @Patch(
    ":addressId/default"
  )
  setDefault(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "addressId"
    )
    addressId:
      string
  ) {
    return this.addressesService.setDefault(
      request.user.id,
      addressId
    );
  }

  @Delete(
    ":addressId"
  )
  remove(
    @Req()
    request:
      AuthenticatedRequest,

    @Param(
      "addressId"
    )
    addressId:
      string
  ) {
    return this.addressesService.remove(
      request.user.id,
      addressId
    );
  }
}
