import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Device } from "../devices/device.entity";

@Entity("location_events")
// Composite index for common time-series queries: "all events for device X ordered by time"
@Index(["device", "recordedAt"])
export class LocationEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Device, (device) => device.locations, {
    onDelete: "CASCADE",
  })
  device: Device;

  @Column({ type: "decimal", precision: 10, scale: 7 })
  latitude: number;

  @Column({ type: "decimal", precision: 10, scale: 7 })
  longitude: number;

  /** Speed in km/h, reported by device */
  @Column({ type: "decimal", precision: 6, scale: 2, nullable: true })
  speed: number;

  /** Heading in degrees 0-360 */
  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  heading: number;

  /** Altitude in meters */
  @Column({ type: "decimal", precision: 8, scale: 2, nullable: true })
  altitude: number;

  /** GPS accuracy in meters */
  @Column({ type: "decimal", precision: 6, scale: 2, nullable: true })
  accuracy: number;

  /**
   * When the device recorded this position.
   * Separate from createdAt to support late-arriving data.
   * This is the timestamp used for all time-series queries.
   */
  @Column()
  @Index()
  recordedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
