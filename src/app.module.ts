import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DevicesModule } from "./modules/devices/devices.module";
import { GeofencesModule } from "./modules/geofences/geofences.module";
import { LocationsModule } from "./modules/locations/locations.module";
import { AlertsModule } from "./modules/alerts/alerts.module";
import { HealthModule } from "./modules/health/health.module";
import { AppCacheModule } from "./common/cache/cache.module";

@Module({
  imports: [
    // ── Config ──────────────────────────────────────────────────────────────
    // isGlobal: true → ConfigService is available everywhere without re-importing
    ConfigModule.forRoot({ isGlobal: true }),

    // ── Database ─────────────────────────────────────────────────────────────
    // TypeORM async config reads from .env via ConfigService
    // synchronize: true is OK for dev/demo; use migrations in production
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get("DB_HOST", "localhost"),
        port: config.get<number>("DB_PORT", 5432),
        username: config.get("DB_USER", "postgres"),
        password: config.get("DB_PASSWORD", "postgres"),
        database: config.get("DB_NAME", "iot_geofencing"),
        entities: [__dirname + "/**/*.entity{.ts,.js}"],
        synchronize: config.get("NODE_ENV") !== "production",
        logging: config.get("NODE_ENV") === "development",
      }),
    }),

    // ── Feature Modules ──────────────────────────────────────────────────────
    DevicesModule,
    GeofencesModule,
    LocationsModule,
    AlertsModule,
    HealthModule,
    AppCacheModule,
  ],
})
export class AppModule {}
