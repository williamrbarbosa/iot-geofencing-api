import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Global Validation Pipe ───────────────────────────────────────────────
  // Automatically validates all incoming DTOs using class-validator decorators.
  // whitelist: strips unknown properties (security)
  // forbidNonWhitelisted: throws error if unknown props are sent
  // transform: auto-converts plain objects to DTO class instances
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Swagger / OpenAPI ────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle("IoT Fleet Geofencing API")
    .setDescription(
      `## Overview
      REST API for IoT fleet management and asset tracking with geofencing capabilities.

      ## Authentication
      All endpoints require an API key via the \`x-api-key\` header.

      ## Geofencing
      Geofences are defined as GeoJSON polygons. When a device reports its location,
      the system automatically checks all active geofences and records entry/exit events.
      `,
    )
    .setVersion("1.0.0")
    .addTag("Devices", "Manage IoT devices in the fleet")
    .addTag("Geofences", "Create and manage geographic zones")
    .addTag("Locations", "Ingest and query device location data")
    .addTag("Alerts", "Geofence violation events")
    .addTag("Health", "System health check")
    .addApiKey({ type: "apiKey", name: "x-api-key", in: "header" }, "api-key")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 API running at: http://localhost:${port}`);
  console.log(`📖 Swagger docs:   http://localhost:${port}/api/docs`);
}

bootstrap();
