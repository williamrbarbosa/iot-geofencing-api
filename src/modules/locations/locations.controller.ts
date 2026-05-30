import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { LocationsService } from "./locations.service";
import { IngestLocationDto, LocationHistoryQueryDto } from "./location.dto";

@ApiTags("Locations")
@ApiSecurity("api-key")
@UseGuards(ApiKeyGuard)
@Controller("devices/:deviceId")
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post("location")
  @ApiOperation({
    summary: "Ingest a location event from a device",
    description: `
Receives GPS data from a device. This endpoint:
1. Validates and persists the location
2. Compares with previous location to detect geofence entry/exit
3. Returns the saved location and any triggered alerts

Alerts in the response indicate real-time geofence violations.
    `,
  })
  @ApiResponse({
    status: 201,
    description:
      "Location ingested. Response includes any geofence alerts triggered.",
  })
  @ApiResponse({ status: 400, description: "Invalid coordinates" })
  @ApiResponse({ status: 404, description: "Device not found" })
  ingest(
    @Param("deviceId", ParseUUIDPipe) deviceId: string,
    @Body() dto: IngestLocationDto,
  ) {
    return this.locationsService.ingest(deviceId, dto);
  }

  @Get("locations")
  @ApiOperation({
    summary: "Get location history for a device",
    description:
      "Returns location events ordered by time descending. Supports time range filtering.",
  })
  getHistory(
    @Param("deviceId", ParseUUIDPipe) deviceId: string,
    @Query() query: LocationHistoryQueryDto,
  ) {
    return this.locationsService.getHistory(deviceId, query);
  }
}
