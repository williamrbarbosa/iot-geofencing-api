import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * We accept GeoJSON Polygon format.
 * coordinates is an array of rings; first ring = exterior boundary.
 * Each coordinate pair is [longitude, latitude] (GeoJSON spec).
 */
class GeoJsonPolygonDto {
  @ApiProperty({ example: 'Polygon' })
  @IsString()
  type: string;

  @ApiProperty({
    example: [
      [
        [-46.633, -23.55],
        [-46.633, -23.56],
        [-46.623, -23.56],
        [-46.623, -23.55],
        [-46.633, -23.55],
      ],
    ],
    description: 'Array of rings. First ring is outer boundary. [lng, lat] pairs.',
  })
  @IsArray()
  coordinates: number[][][];
}

export class CreateGeofenceDto {
  @ApiProperty({ example: 'Warehouse Zone A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Restricted loading area' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ type: GeoJsonPolygonDto })
  @ValidateNested()
  @Type(() => GeoJsonPolygonDto)
  area: GeoJsonPolygonDto;
}

export class UpdateGeofenceDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ type: GeoJsonPolygonDto })
  @ValidateNested()
  @Type(() => GeoJsonPolygonDto)
  @IsOptional()
  area?: GeoJsonPolygonDto;
}
