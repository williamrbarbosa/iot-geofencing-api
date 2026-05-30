import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Geofence } from "./geofence.entity";
import { CreateGeofenceDto, UpdateGeofenceDto } from "./geofence.dto";

@Injectable()
export class GeofencesService {
  constructor(
    @InjectRepository(Geofence)
    private readonly geofenceRepo: Repository<Geofence>,
  ) {}

  async create(dto: CreateGeofenceDto): Promise<Geofence> {
    const geofence = this.geofenceRepo.create({
      name: dto.name,
      description: dto.description,
      area: () => `ST_GeomFromGeoJSON('${JSON.stringify(dto.area)}')`,
    });
    return this.geofenceRepo.save(geofence);
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

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const geofence = await this.geofenceRepo.findOne({ where: { id } });
    if (!geofence) throw new NotFoundException(`Geofence ${id} not found`);
    await this.geofenceRepo.remove(geofence);
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
    return this.geofenceRepo
      .createQueryBuilder("g")
      .where("g.isActive = true")
      .andWhere(
        // ST_Contains(polygon, point) → true if point is inside polygon
        // ST_SetSRID(ST_MakePoint(lng, lat), 4326) → creates a PostGIS point
        // Note: longitude comes first in PostGIS (X = lng, Y = lat)
        `ST_Contains(g.area, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))`,
        { lng: longitude, lat: latitude },
      )
      .getMany();
  }
}
