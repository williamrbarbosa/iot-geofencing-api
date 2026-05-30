import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class IngestLocationDto {
  /**
   * Latitude: -90 to 90 (WGS84)
   * Min/Max decorators enforce valid GPS range.
   */
  @ApiProperty({ example: -23.5505, description: "Latitude (-90 to 90)" })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latitude: number;

  @ApiProperty({ example: -46.6333, description: "Longitude (-180 to 180)" })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  longitude: number;

  @ApiPropertyOptional({ example: 65.5, description: "Speed in km/h" })
  @IsNumber()
  @Min(0)
  @Max(300) // reasonable max speed for a vehicle
  @IsOptional()
  @Type(() => Number)
  speed?: number;

  @ApiPropertyOptional({
    example: 270.0,
    description: "Heading in degrees (0-360)",
  })
  @IsNumber()
  @Min(0)
  @Max(360)
  @IsOptional()
  @Type(() => Number)
  heading?: number;

  @ApiPropertyOptional({ example: 760.0, description: "Altitude in meters" })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  altitude?: number;

  @ApiPropertyOptional({ example: 5.0, description: "GPS accuracy in meters" })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  accuracy?: number;

  /**
   * ISO 8601 timestamp of when the device recorded this location.
   * Allows ingesting late-arriving data with correct timestamps.
   * Defaults to now() on the server if not provided.
   */
  @ApiPropertyOptional({
    example: "2024-01-15T14:30:00Z",
    description: "Device-side timestamp (ISO 8601). Defaults to server time.",
  })
  @IsDateString()
  @IsOptional()
  recordedAt?: string;
}

export class LocationHistoryQueryDto {
  @ApiPropertyOptional({
    example: "2024-01-01T00:00:00Z",
    description: "Start of time range",
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    example: "2024-01-31T23:59:59Z",
    description: "End of time range",
  })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    example: 100,
    description: "Max results (default 100, max 1000)",
  })
  @IsNumber()
  @Min(1)
  @Max(1000)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
