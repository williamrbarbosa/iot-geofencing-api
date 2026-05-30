import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Device } from '../devices/device.entity';
import { Geofence } from '../geofences/geofence.entity';

export enum AlertType {
  ENTER = 'enter', // device entered the geofence
  EXIT = 'exit',   // device exited the geofence
}

@Entity('geofence_alerts')
@Index(['device', 'createdAt'])
@Index(['geofence', 'createdAt'])
export class GeofenceAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Device, (device) => device.alerts, { onDelete: 'CASCADE' })
  device: Device;

  @ManyToOne(() => Geofence, (geofence) => geofence.alerts, { onDelete: 'CASCADE' })
  geofence: Geofence;

  @Column({ type: 'enum', enum: AlertType })
  type: AlertType;

  /** The position that triggered this alert */
  @Column({ type: 'decimal', precision: 10, scale: 7 })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  longitude: number;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
