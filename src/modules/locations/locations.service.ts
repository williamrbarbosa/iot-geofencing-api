import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LocationEvent } from "./location-event.entity";
import { GeofenceAlert, AlertType } from "../alerts/geofence-alert.entity";
import { Device } from "../devices/device.entity";
import { GeofencesService } from "../geofences/geofences.service";
import { DevicesService } from "../devices/devices.service";
import { IngestLocationDto, LocationHistoryQueryDto } from "./location.dto";

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(LocationEvent)
    private readonly locationRepo: Repository<LocationEvent>,

    @InjectRepository(GeofenceAlert)
    private readonly alertRepo: Repository<GeofenceAlert>,

    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,

    private readonly geofencesService: GeofencesService,
    private readonly devicesService: DevicesService,
  ) {}

  /**
   * Main ingestion endpoint logic.
   *
   * Pipeline:
   * 1. Validate device exists
   * 2. Persist location event
   * 3. Update device's last known position
   * 4. Run geofencing check → detect enter/exit events
   * 5. Return persisted event + any triggered alerts
   */
  async ingest(
    deviceId: string,
    dto: IngestLocationDto,
  ): Promise<{ location: LocationEvent; alerts: GeofenceAlert[] }> {
    // Step 1: Validate device
    const device = await this.devicesService.findOne(deviceId);

    // Step 2: Persist location
    const location = this.locationRepo.create({
      device,
      latitude: dto.latitude,
      longitude: dto.longitude,
      speed: dto.speed,
      heading: dto.heading,
      altitude: dto.altitude,
      accuracy: dto.accuracy,
      recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
    });
    const savedLocation = await this.locationRepo.save(location);

    // Step 3: Update device last known position
    await this.deviceRepo.update(deviceId, {
      lastLatitude: dto.latitude,
      lastLongitude: dto.longitude,
      lastSeenAt: savedLocation.recordedAt,
    });

    // Step 4: Geofencing check
    const alerts = await this.processGeofencingEvents(device, savedLocation);

    return { location: savedLocation, alerts };
  }

  /**
   * Geofencing event detection.
   *
   * Strategy:
   * - Find all geofences that contain the NEW position
   * - Find all geofences that contained the PREVIOUS position
   * - ENTER event: device is now inside a geofence it wasn't in before
   * - EXIT event:  device is now outside a geofence it was in before
   *
   * This stateless approach avoids needing to track per-device state,
   * but can miss rapid enter/exit between two readings.
   */
  private async processGeofencingEvents(
    device: Device,
    current: LocationEvent,
  ): Promise<GeofenceAlert[]> {
    const alerts: GeofenceAlert[] = [];

    // Find geofences containing CURRENT position
    const currentGeofences =
      await this.geofencesService.findGeofencesContainingPoint(
        current.latitude,
        current.longitude,
      );

    // Find the previous location event to compare
    // Use query builder to skip the latest event (the one we just inserted)
    const previousLocation = await this.locationRepo
      .createQueryBuilder("loc")
      .where("loc.deviceId = :deviceId", { deviceId: device.id })
      .andWhere("loc.id != :currentId", { currentId: current.id })
      .orderBy("loc.recordedAt", "DESC")
      .take(1)
      .getOne();

    // Find geofences containing PREVIOUS position (empty if no previous)
    const previousGeofences = previousLocation
      ? await this.geofencesService.findGeofencesContainingPoint(
          previousLocation.latitude,
          previousLocation.longitude,
        )
      : [];

    const currentGeofenceIds = new Set(currentGeofences.map((g) => g.id));
    const previousGeofenceIds = new Set(previousGeofences.map((g) => g.id));

    // ENTER events: in current but not in previous
    for (const geofence of currentGeofences) {
      if (!previousGeofenceIds.has(geofence.id)) {
        const alert = this.alertRepo.create({
          device,
          geofence,
          type: AlertType.ENTER,
          latitude: current.latitude,
          longitude: current.longitude,
        });
        alerts.push(await this.alertRepo.save(alert));
      }
    }

    // EXIT events: in previous but not in current
    for (const geofence of previousGeofences) {
      if (!currentGeofenceIds.has(geofence.id)) {
        const alert = this.alertRepo.create({
          device,
          geofence,
          type: AlertType.EXIT,
          latitude: current.latitude,
          longitude: current.longitude,
        });
        alerts.push(await this.alertRepo.save(alert));
      }
    }

    return alerts;
  }

  /**
   * Time-series location history for a device.
   * Supports filtering by time range and pagination via limit.
   */
  async getHistory(
    deviceId: string,
    query: LocationHistoryQueryDto,
  ): Promise<LocationEvent[]> {
    await this.devicesService.findOne(deviceId); // validate device exists

    const qb = this.locationRepo
      .createQueryBuilder("loc")
      .where("loc.deviceId = :deviceId", { deviceId })
      .orderBy("loc.recordedAt", "DESC")
      .take(query.limit ?? 100);

    if (query.from) {
      qb.andWhere("loc.recordedAt >= :from", { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere("loc.recordedAt <= :to", { to: new Date(query.to) });
    }

    return qb.getMany();
  }
}
