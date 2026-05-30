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
import { GeofencesService } from "./geofences.service";
import { CreateGeofenceDto, UpdateGeofenceDto } from "./geofence.dto";

@ApiTags("Geofences")
@ApiSecurity("api-key")
@UseGuards(ApiKeyGuard)
@Controller("geofences")
export class GeofencesController {
  constructor(private readonly geofencesService: GeofencesService) {}

  @Post()
  @ApiOperation({
    summary: "Create a new geofence zone",
    description:
      "Accepts a GeoJSON Polygon. The first/last coordinate must be identical to close the ring.",
  })
  @ApiResponse({ status: 201, description: "Geofence created" })
  @ApiResponse({ status: 400, description: "Invalid GeoJSON polygon" })
  create(@Body() dto: CreateGeofenceDto) {
    return this.geofencesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List all geofences" })
  findAll() {
    return this.geofencesService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get geofence by ID" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.geofencesService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update geofence name, description, polygon, or status",
  })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateGeofenceDto,
  ) {
    return this.geofencesService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a geofence" })
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.geofencesService.remove(id);
  }
}
