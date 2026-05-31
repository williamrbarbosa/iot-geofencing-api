import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { LocationEvent } from "./location-event.entity";
import { GeofenceAlert, AlertType } from "../alerts/geofence-alert.entity";
import { Device } from "../devices/device.entity";
import { GeofencesService } from "../geofences/geofences.service";
import { DevicesService } from "../devices/devices.service";
import { IngestLocationDto, LocationHistoryQueryDto } from "./location.dto";
import { CacheKeys, CacheTTL } from "../../common/cache/cache-keys";

/**
 * Shape of the device state stored in Redis.
 * Contains everything needed to run the geofencing check
 * without hitting the database for the previous location.
 */
interface DeviceState {
  latitude: number;
  longitude: number;
  recordedAt: string;
  /** IDs of geofences the device was inside at this position */
  geofenceIds: string[];
}

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

    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  /**
   * Main ingestion pipeline:
   * 1. Validate device
   * 2. Get previous state from Redis (fast) or DB (fallback)
   * 3. Persist new location
   * 4. Run geofencing check
   * 5. Update Redis state for this device
   * 6. Return location + triggered alerts
   */
  async ingest(
    deviceId: string,
    dto: IngestLocationDto,
  ): Promise<{ location: LocationEvent; alerts: GeofenceAlert[] }> {
    // Step 1: Validate device exists
    const device = await this.devicesService.findOne(deviceId);

    // Step 2: Get previous device state (Redis first, DB fallback)
    const previousState = await this.getPreviousDeviceState(deviceId);

    // Step 3: Persist location
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

    // Step 4: Update device last known position in DB
    await this.deviceRepo.update(deviceId, {
      lastLatitude: dto.latitude,
      lastLongitude: dto.longitude,
      lastSeenAt: savedLocation.recordedAt,
    });

    // Step 5: Geofencing check using cached previous state
    const alerts = await this.processGeofencingEvents(
      device,
      savedLocation,
      previousState,
    );

    // Step 6: Update Redis with the new device state
    await this.updateDeviceState(deviceId, savedLocation, alerts);

    return { location: savedLocation, alerts };
  }

  /**
   * Get the previous device state.
   *
   * Cache-first strategy:
   * - Redis hit  → return immediately (no DB query)
   * - Redis miss → query DB for last location, build state from it
   *
   * This is the key optimisation: on every ping after the first,
   * we avoid a DB round-trip for the previous location.
   */
  private async getPreviousDeviceState(
    deviceId: string,
  ): Promise<DeviceState | null> {
    // Try Redis first
    const cached = await this.cache.get<DeviceState>(
      CacheKeys.deviceState(deviceId),
    );
    if (cached) return cached;

    // Redis miss — fall back to DB
    const previousLocation = await this.locationRepo
      .createQueryBuilder("loc")
      .where("loc.deviceId = :deviceId", { deviceId })
      .orderBy("loc.recordedAt", "DESC")
      .take(1)
      .getOne();

    if (!previousLocation) return null;

    // Find which geofences the previous location was inside
    const previousGeofences =
      await this.geofencesService.findGeofencesContainingPoint(
        previousLocation.latitude,
        previousLocation.longitude,
      );

    return {
      latitude: previousLocation.latitude,
      longitude: previousLocation.longitude,
      recordedAt: previousLocation.recordedAt.toISOString(),
      geofenceIds: previousGeofences.map((g) => g.id),
    };
  }

  /**
   * After processing a ping, store the new state in Redis.
   * This becomes the "previous state" for the next ping — no DB query needed.
   */
  private async updateDeviceState(
    deviceId: string,
    location: LocationEvent,
    alerts: GeofenceAlert[],
  ): Promise<void> {
    // Reconstruct current geofence IDs from the alerts + previous state
    const cached = await this.cache.get<DeviceState>(
      CacheKeys.deviceState(deviceId),
    );

    const previousGeofenceIds = new Set(cached?.geofenceIds ?? []);

    // Apply ENTER/EXIT transitions to get the new set
    for (const alert of alerts) {
      if (alert.type === AlertType.ENTER) {
        previousGeofenceIds.add(alert.geofence.id);
      } else if (alert.type === AlertType.EXIT) {
        previousGeofenceIds.delete(alert.geofence.id);
      }
    }

    const newState: DeviceState = {
      latitude: location.latitude,
      longitude: location.longitude,
      recordedAt: location.recordedAt.toISOString(),
      geofenceIds: Array.from(previousGeofenceIds),
    };

    await this.cache.set(
      CacheKeys.deviceState(deviceId),
      newState,
      CacheTTL.DEVICE_STATE,
    );
  }

  /**
   * Geofencing event detection.
   *
   * Uses previousState.geofenceIds from Redis instead of
   * running a second ST_Contains query for the previous position.
   */
  private async processGeofencingEvents(
    device: Device,
    current: LocationEvent,
    previousState: DeviceState | null,
  ): Promise<GeofenceAlert[]> {
    const alerts: GeofenceAlert[] = [];

    // Find geofences containing CURRENT position (always needs DB/PostGIS)
    const currentGeofences =
      await this.geofencesService.findGeofencesContainingPoint(
        current.latitude,
        current.longitude,
      );

    const currentGeofenceIds = new Set(currentGeofences.map((g) => g.id));

    // Previous geofence IDs come from Redis — no extra DB query needed
    const previousGeofenceIds = new Set(previousState?.geofenceIds ?? []);

    // ENTER: in current but not in previous
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

    // EXIT: in previous but not in current
    // We need the full geofence objects for the EXIT alerts.
    // If the device has a previous state, fetch any geofences it was in.
    if (previousState && previousState.geofenceIds.length > 0) {
      for (const geofenceId of previousState.geofenceIds) {
        if (!currentGeofenceIds.has(geofenceId)) {
          // Fetch minimal geofence object for the alert relation
          const geofence = await this.geofencesService.findOne(geofenceId);
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
    }

    return alerts;
  }

  async getHistory(
    deviceId: string,
    query: LocationHistoryQueryDto,
  ): Promise<LocationEvent[]> {
    await this.devicesService.findOne(deviceId);

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
