# IoT Fleet Management — Geofencing API

A production-ready REST API for geofencing in IoT fleet tracking systems, built with **NestJS**, **PostgreSQL + PostGIS**, and **TypeORM**.

## Features

- ✅ Device registration and management
- ✅ Real-time location ingestion with validation
- ✅ Geofence creation (GeoJSON Polygon)
- ✅ Automatic enter/exit event detection using PostGIS `ST_Contains`
- ✅ Location history (time-series queries)
- ✅ Alert history per device and per geofence
- ✅ API key authentication
- ✅ Swagger/OpenAPI documentation
- ✅ Unit tests (Jest)
- ✅ Docker Compose (local)
- ✅ Kubernetes manifests (production)

---

## Architecture

```
IoT Device (GPS)
    │  POST /devices/:id/location
    ▼
NestJS API (Node.js)
    │  Validate DTO
    │  Persist LocationEvent
    │  Update Device.lastPosition
    │  ST_Contains(geofence.area, point) — PostGIS
    │  Create ENTER/EXIT alerts
    ▼
PostgreSQL + PostGIS
    ├── devices
    ├── geofences        (geometry POLYGON, SRID 4326)
    ├── location_events  (time-series, indexed on deviceId + recordedAt)
    └── geofence_alerts  (enter/exit events)
```

---

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local dev without Docker)

### Run with Docker

```bash
cp .env.example .env
docker-compose up -d
```

API available at: `http://localhost:3000`  
Swagger docs at: `http://localhost:3000/api/docs`

### Run locally

```bash
cp .env.example .env
# Start only the database
docker-compose up -d postgres

npm install
npm run start:dev
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/devices` | Register a device |
| `GET` | `/devices` | List all devices |
| `GET` | `/devices/:id` | Get device by ID |
| `PATCH` | `/devices/:id` | Update device |
| `DELETE` | `/devices/:id` | Remove device |
| `POST` | `/geofences` | Create a geofence zone |
| `GET` | `/geofences` | List all geofences |
| `GET` | `/geofences/:id` | Get geofence by ID |
| `PATCH` | `/geofences/:id` | Update geofence |
| `DELETE` | `/geofences/:id` | Delete geofence |
| `POST` | `/devices/:id/location` | **Ingest location** (triggers geofencing) |
| `GET` | `/devices/:id/locations` | Location history |
| `GET` | `/alerts` | All recent alerts |
| `GET` | `/alerts/device/:id` | Alerts for a device |
| `GET` | `/alerts/geofence/:id` | Alerts for a geofence |
| `GET` | `/health` | Health check |

### Authentication

All endpoints (except `/health`) require:
```
x-api-key: <your-api-key>
```

---

## Example: Full Geofencing Flow

### 1. Register a device
```bash
curl -X POST http://localhost:3000/devices \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{"name": "TRUCK-042", "description": "Delivery truck"}'
# → { "id": "uuid-here", "name": "TRUCK-042", ... }
```

### 2. Create a geofence
```bash
curl -X POST http://localhost:3000/geofences \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Warehouse Zone A",
    "area": {
      "type": "Polygon",
      "coordinates": [[
        [-46.633, -23.550],
        [-46.633, -23.560],
        [-46.623, -23.560],
        [-46.623, -23.550],
        [-46.633, -23.550]
      ]]
    }
  }'
```

### 3. Report device location (outside geofence)
```bash
curl -X POST http://localhost:3000/devices/<device-id>/location \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{"latitude": -23.540, "longitude": -46.650, "speed": 60}'
# → { "location": {...}, "alerts": [] }
```

### 4. Report location inside geofence → triggers ENTER alert
```bash
curl -X POST http://localhost:3000/devices/<device-id>/location \
  -H "x-api-key: dev-api-key-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{"latitude": -23.555, "longitude": -46.628, "speed": 5}'
# → { "location": {...}, "alerts": [{ "type": "enter", "geofence": {...} }] }
```

---

## Running Tests

```bash
# Unit tests
npm test

# With coverage
npm run test:cov
```

---

## Kubernetes Deployment

```bash
# Apply all manifests
kubectl apply -f k8s/deployment.yaml

# Check rollout
kubectl rollout status deployment/iot-api -n iot-platform

# View pods
kubectl get pods -n iot-platform
```

**Key K8s features:**
- Rolling updates (zero downtime)
- HorizontalPodAutoscaler (2–10 replicas based on CPU)
- Readiness + liveness probes
- Non-root security context
- Resource requests/limits
- Ingress with rate limiting

---

## Design Decisions

### Why PostGIS?
`ST_Contains(polygon, point)` runs a native spatial index query in the database — far more efficient than computing containment in application code, especially as geofence count grows. PostGIS uses R-tree indexes (GiST) for sub-millisecond lookups.

### Why track `recordedAt` separately from `createdAt`?
IoT devices often have intermittent connectivity. A vehicle may be offline for 5 minutes and then upload 30 location events at once. `recordedAt` preserves when the device actually measured the position; `createdAt` records when the server received it. Time-series queries use `recordedAt`.

### Why API Key auth (not JWT)?
For device-to-server communication, API keys are simpler and sufficient. Devices don't need user-level identity. JWT would add unnecessary complexity for this use case. In production: use per-device keys with rotation policy.

### Geofence enter/exit detection strategy
Stateless comparison: we compare which geofences contain the current position vs the previous one. This is simple and avoids storing per-device "currently inside" state. Trade-off: if a device jumps across a geofence boundary in a single reading gap, it could miss a transition. Mitigation: increase GPS polling frequency.
