import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Geofence } from "./geofence.entity";
import { GeofencesService } from "./geofences.service";
import { GeofencesController } from "./geofences.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Geofence])],
  controllers: [GeofencesController],
  providers: [GeofencesService],
  exports: [GeofencesService], // exported so LocationsModule can run containment checks
})
export class GeofencesModule {}
