import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Geofence } from "./geofence.entity";
import { CreateGeofenceDto, UpdateGeofenceDto } from "./geofence.dto";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { CacheKeys, CacheTTL } from "../../common/cache/cache-keys";

@Injectable()
export class GeofencesService {
  constructor(
    @InjectRepository(Geofence)
    private readonly geofenceRepo: Repository<Geofence>,

    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async create(dto: CreateGeofenceDto): Promise<Geofence> {
    const geofence = this.geofenceRepo.create({
      name: dto.name,
      description: dto.description,
      area: () => `ST_GeomFromGeoJSON('${JSON.stringify(dto.area)}')`,
    });
    const saved = this.geofenceRepo.save(geofence);

    // New geofence → invalidate the active geofences cache
    await this.invalidateActiveGeofencesCache();

    return saved;
  }

  async update(id: string, dto: UpdateGeofenceDto): Promise<Geofence> {
    await this.findOne(id); // throws if not found

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    if (dto.area) {
      // Use raw query to update geometry column
      await this.geofenceRepo.query(
        `UPDATE geofences SET area = ST_GeomFromGeoJSON($1), "updatedAt" = NOW() WHERE id = $2`,
        [JSON.stringify(dto.area), id],
      );
    }

    if (Object.keys(updateData).length > 0) {
      await this.geofenceRepo.update(id, updateData);
    }

    // Geofence changed (area, isActive, etc.) → invalidate cache
    await this.invalidateActiveGeofencesCache();

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const geofence = await this.geofenceRepo.findOne({ where: { id } });
    if (!geofence) throw new NotFoundException(`Geofence ${id} not found`);
    await this.geofenceRepo.remove(geofence);

    // Geofence removed → invalidate cache
    await this.invalidateActiveGeofencesCache();
  }

  async findAll(): Promise<any[]> {
    // Return area as GeoJSON for API consumers
    return this.geofenceRepo
      .createQueryBuilder("g")
      .select([
        "g.id",
        "g.name",
        "g.description",
        "g.isActive",
        "g.createdAt",
        "g.updatedAt",
        "ST_AsGeoJSON(g.area)::json AS g_area",
      ])
      .getRawMany()
      .then((rows) =>
        rows.map((r) => ({
          id: r.g_id,
          name: r.g_name,
          description: r.g_description,
          isActive: r.g_isActive,
          area: r.g_area,
          createdAt: r.g_createdAt,
          updatedAt: r.g_updatedAt,
        })),
      );
  }

  async findOne(id: string): Promise<Geofence> {
    const result = await this.geofenceRepo
      .createQueryBuilder("g")
      .select([
        "g.id AS id",
        "g.name AS name",
        "g.description AS description",
        'g.isActive AS "isActive"',
        'g.createdAt AS "createdAt"',
        'g.updatedAt AS "updatedAt"',
        "ST_AsGeoJSON(g.area)::json AS area",
      ])
      .where("g.id = :id", { id })
      .getRawOne();

    if (!result) throw new NotFoundException(`Geofence ${id} not found`);
    return result as Geofence;
  }

  /**
   * Core geofencing check: find all active geofences that contain a point.
   *
   * Uses PostGIS ST_Contains for accurate polygon-point containment test.
   * This is the heart of the geofencing system.
   *
   * @param latitude  - WGS84 latitude
   * @param longitude - WGS84 longitude
   * @returns Array of geofences that contain the given point
   */
  async findGeofencesContainingPoint(
    latitude: number,
    longitude: number,
  ): Promise<Geofence[]> {
    const active = await this.findAllActive();
    if (active.length === 0) return [];

    return this.geofenceRepo
      .createQueryBuilder("g")
      .where("g.id IN (:...ids)", { ids: active.map((g) => g.id) })
      .andWhere(
        `ST_Contains(g.area, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))`,
        { lng: longitude, lat: latitude },
      )
      .getMany();
  }

  /**
   * Returns all active geofences, using Redis cache.
   * Used for preloading — e.g. to warm up the cache on startup.
   */
  async findAllActive(): Promise<Geofence[]> {
    const cached = await this.cache.get<Geofence[]>(CacheKeys.ACTIVE_GEOFENCES);
    if (cached) return cached;

    const geofences = await this.geofenceRepo.find({
      where: { isActive: true },
    });

    await this.cache.set(
      CacheKeys.ACTIVE_GEOFENCES,
      geofences,
      CacheTTL.ACTIVE_GEOFENCES,
    );

    return geofences;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async invalidateActiveGeofencesCache(): Promise<void> {
    await this.cache.del(CacheKeys.ACTIVE_GEOFENCES);
  }
}
