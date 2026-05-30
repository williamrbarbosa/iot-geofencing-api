import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { AlertsService } from './alerts.service';

@ApiTags('Alerts')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'List all recent geofence alerts' })
  findAll() {
    return this.alertsService.findAll();
  }

  @Get('device/:deviceId')
  @ApiOperation({ summary: 'Get all alerts for a specific device' })
  findByDevice(@Param('deviceId', ParseUUIDPipe) deviceId: string) {
    return this.alertsService.findByDevice(deviceId);
  }

  @Get('geofence/:geofenceId')
  @ApiOperation({ summary: 'Get all violations for a specific geofence' })
  findByGeofence(@Param('geofenceId', ParseUUIDPipe) geofenceId: string) {
    return this.alertsService.findByGeofence(geofenceId);
  }
}
