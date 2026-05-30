import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LocationEvent } from "./location-event.entity";
import { GeofenceAlert } from "../alerts/geofence-alert.entity";
import { Device } from "../devices/device.entity";
import { LocationsService } from "./locations.service";
import { LocationsController } from "./locations.controller";
import { GeofencesModule } from "../geofences/geofences.module";
import { DevicesModule } from "../devices/devices.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([LocationEvent, GeofenceAlert, Device]),
    GeofencesModule,
    DevicesModule,
  ],
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}
