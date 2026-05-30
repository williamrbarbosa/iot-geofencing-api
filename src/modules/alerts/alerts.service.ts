import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeofenceAlert } from './geofence-alert.entity';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(GeofenceAlert)
    private readonly alertRepo: Repository<GeofenceAlert>,
  ) {}

  async findByDevice(deviceId: string): Promise<GeofenceAlert[]> {
    return this.alertRepo.find({
      where: { device: { id: deviceId } },
      relations: ['geofence'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findByGeofence(geofenceId: string): Promise<GeofenceAlert[]> {
    return this.alertRepo.find({
      where: { geofence: { id: geofenceId } },
      relations: ['device'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findAll(): Promise<GeofenceAlert[]> {
    return this.alertRepo.find({
      relations: ['device', 'geofence'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
