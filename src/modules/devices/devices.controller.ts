import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { DevicesService } from "./devices.service";
import { CreateDeviceDto, UpdateDeviceDto } from "./device.dto";

@ApiTags("Devices")
@ApiSecurity("api-key")
@UseGuards(ApiKeyGuard)
@Controller("devices")
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @ApiOperation({ summary: "Register a new IoT device" })
  @ApiResponse({ status: 201, description: "Device created" })
  @ApiResponse({ status: 409, description: "Device name already exists" })
  create(@Body() dto: CreateDeviceDto) {
    return this.devicesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List all devices" })
  findAll() {
    return this.devicesService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get device by ID" })
  @ApiResponse({ status: 404, description: "Device not found" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.devicesService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update device metadata or status" })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateDeviceDto) {
    return this.devicesService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a device" })
  @ApiResponse({ status: 204, description: "Device removed" })
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.devicesService.remove(id);
  }
}
