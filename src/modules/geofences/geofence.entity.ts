import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { GeofenceAlert } from "../alerts/geofence-alert.entity";

@Entity("geofences")
export class Geofence {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  /**
   * Polygon stored as PostGIS geometry (SRID 4326 = WGS84, standard GPS coords).
   * TypeORM stores it as a GeoJSON object or WKT string — we use GeoJSON.
   *
   * Example: { type: "Polygon", coordinates: [[[lng, lat], ...]] }
   */
  @Column({
    type: "geometry",
    spatialFeatureType: "Polygon",
    srid: 4326,
  })
  area: object;

  /** When false, geofence checks are skipped for this zone */
  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => GeofenceAlert, (alert) => alert.geofence)
  alerts: GeofenceAlert[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
