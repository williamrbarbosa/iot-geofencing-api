import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LocationEvent } from '../locations/location-event.entity';
import { GeofenceAlert } from '../alerts/geofence-alert.entity';

export enum DeviceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
}

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Human-readable identifier, e.g. "TRUCK-042" */
  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: DeviceStatus,
    default: DeviceStatus.ACTIVE,
  })
  status: DeviceStatus;

  /** Last known latitude */
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lastLatitude: number;

  /** Last known longitude */
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lastLongitude: number;

  @Column({ nullable: true })
  lastSeenAt: Date;

  @OneToMany(() => LocationEvent, (loc) => loc.device)
  locations: LocationEvent[];

  @OneToMany(() => GeofenceAlert, (alert) => alert.device)
  alerts: GeofenceAlert[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
