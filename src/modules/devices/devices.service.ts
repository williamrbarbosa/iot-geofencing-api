import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Device } from "./device.entity";
import { CreateDeviceDto, UpdateDeviceDto } from "./device.dto";

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
  ) {}

  async create(dto: CreateDeviceDto): Promise<Device> {
    const existing = await this.deviceRepo.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Device with name "${dto.name}" already exists`,
      );
    }
    const device = this.deviceRepo.create(dto);
    return this.deviceRepo.save(device);
  }

  async findAll(): Promise<Device[]> {
    return this.deviceRepo.find({ order: { createdAt: "DESC" } });
  }

  async findOne(id: string): Promise<Device> {
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    return device;
  }

  async update(id: string, dto: UpdateDeviceDto): Promise<Device> {
    const device = await this.findOne(id);
    Object.assign(device, dto);
    return this.deviceRepo.save(device);
  }

  async remove(id: string): Promise<void> {
    const device = await this.findOne(id);
    await this.deviceRepo.remove(device);
  }
}
