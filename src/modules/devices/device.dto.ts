import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DeviceStatus } from './device.entity';

export class CreateDeviceDto {
  @ApiProperty({ example: 'TRUCK-042', description: 'Unique device identifier' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Delivery truck, Route A' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional({ example: 'TRUCK-042-updated' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsEnum(DeviceStatus)
  @IsOptional()
  status?: DeviceStatus;
}
