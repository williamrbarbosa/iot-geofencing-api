import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { LocationsService } from "./locations.service";
import { LocationEvent } from "./location-event.entity";
import { GeofenceAlert, AlertType } from "../alerts/geofence-alert.entity";
import { Device, DeviceStatus } from "../devices/device.entity";
import { GeofencesService } from "../geofences/geofences.service";
import { DevicesService } from "../devices/devices.service";

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockCacheManager = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
});

const mockDevice: Device = {
  id: "device-001",
  name: "TRUCK-001",
  description: "Test truck",
  status: DeviceStatus.ACTIVE,
  lastLatitude: 0,
  lastLongitude: 0,
  lastSeenAt: new Date(),
  locations: [],
  alerts: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockGeofence = {
  id: "geofence-001",
  name: "Warehouse A",
  isActive: true,
};

describe("LocationsService", () => {
  let service: LocationsService;
  let locationRepo: ReturnType<typeof mockRepo>;
  let alertRepo: ReturnType<typeof mockRepo>;
  let deviceRepo: ReturnType<typeof mockRepo>;
  let geofencesService: Partial<GeofencesService>;
  let devicesService: Partial<DevicesService>;
  let cache: ReturnType<typeof mockCacheManager>;

  beforeEach(async () => {
    geofencesService = {
      findGeofencesContainingPoint: jest.fn(),
      findOne: jest.fn().mockResolvedValue(mockGeofence),
    };
    devicesService = {
      findOne: jest.fn().mockResolvedValue(mockDevice),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: getRepositoryToken(LocationEvent), useFactory: mockRepo },
        { provide: getRepositoryToken(GeofenceAlert), useFactory: mockRepo },
        { provide: getRepositoryToken(Device), useFactory: mockRepo },
        { provide: GeofencesService, useValue: geofencesService },
        { provide: DevicesService, useValue: devicesService },
        { provide: CACHE_MANAGER, useFactory: mockCacheManager },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    locationRepo = module.get(getRepositoryToken(LocationEvent));
    alertRepo = module.get(getRepositoryToken(GeofenceAlert));
    deviceRepo = module.get(getRepositoryToken(Device));
    cache = module.get(CACHE_MANAGER);
  });

  const ingestDto = { latitude: -23.555, longitude: -46.628, speed: 60 };

  describe("ingest", () => {
    it("should persist location and update device position", async () => {
      const savedLocation = {
        id: "loc-001",
        ...ingestDto,
        recordedAt: new Date(),
        device: mockDevice,
      };
      locationRepo.create.mockReturnValue(savedLocation);
      locationRepo.save.mockResolvedValue(savedLocation);
      deviceRepo.update.mockResolvedValue(undefined);
      cache.get.mockResolvedValue(null); // Redis miss → falls back to DB
      // DB fallback: no previous location found
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      locationRepo.createQueryBuilder.mockReturnValue(mockQb);
      (
        geofencesService.findGeofencesContainingPoint as jest.Mock
      ).mockResolvedValue([]);

      const result = await service.ingest("device-001", ingestDto);

      expect(locationRepo.save).toHaveBeenCalled();
      expect(deviceRepo.update).toHaveBeenCalledWith(
        "device-001",
        expect.objectContaining({
          lastLatitude: ingestDto.latitude,
          lastLongitude: ingestDto.longitude,
        }),
      );
      expect(result.location).toBeDefined();
    });

    it("should use Redis state instead of querying DB for previous location", async () => {
      const savedLocation = {
        id: "loc-002",
        ...ingestDto,
        recordedAt: new Date(),
        device: mockDevice,
      };
      locationRepo.create.mockReturnValue(savedLocation);
      locationRepo.save.mockResolvedValue(savedLocation);
      deviceRepo.update.mockResolvedValue(undefined);

      // Redis HIT — previous state available
      cache.get.mockResolvedValue({
        latitude: -23.54,
        longitude: -46.65,
        recordedAt: new Date().toISOString(),
        geofenceIds: [],
      });

      (
        geofencesService.findGeofencesContainingPoint as jest.Mock
      ).mockResolvedValue([]);

      await service.ingest("device-001", ingestDto);

      // DB should NOT have been queried for previous location
      expect(locationRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("should create ENTER alert when device enters a geofence", async () => {
      const savedLocation = {
        id: "loc-003",
        ...ingestDto,
        recordedAt: new Date(),
        device: mockDevice,
      };
      locationRepo.create.mockReturnValue(savedLocation);
      locationRepo.save.mockResolvedValue(savedLocation);
      deviceRepo.update.mockResolvedValue(undefined);

      // Previous state: outside all geofences
      cache.get
        .mockResolvedValueOnce({
          latitude: -23.54,
          longitude: -46.65,
          recordedAt: new Date().toISOString(),
          geofenceIds: [],
        })
        .mockResolvedValueOnce(null); // second call in updateDeviceState

      // Current position: inside geofence
      (
        geofencesService.findGeofencesContainingPoint as jest.Mock
      ).mockResolvedValue([mockGeofence]);

      const alertEntity = {
        id: "alert-001",
        type: AlertType.ENTER,
        device: mockDevice,
        geofence: mockGeofence,
      };
      alertRepo.create.mockReturnValue(alertEntity);
      alertRepo.save.mockResolvedValue(alertEntity);

      const result = await service.ingest("device-001", ingestDto);

      expect(result.alerts[0].type).toBe(AlertType.ENTER);
    });

    it("should create EXIT alert when device leaves a geofence", async () => {
      const savedLocation = {
        id: "loc-004",
        latitude: 99,
        longitude: 99,
        recordedAt: new Date(),
        device: mockDevice,
      };
      locationRepo.create.mockReturnValue(savedLocation);
      locationRepo.save.mockResolvedValue(savedLocation);
      deviceRepo.update.mockResolvedValue(undefined);

      // Previous state: WAS inside geofence-001
      cache.get
        .mockResolvedValueOnce({
          latitude: -23.555,
          longitude: -46.628,
          recordedAt: new Date().toISOString(),
          geofenceIds: ["geofence-001"],
        })
        .mockResolvedValueOnce(null);

      // Current position: outside all geofences
      (
        geofencesService.findGeofencesContainingPoint as jest.Mock
      ).mockResolvedValue([]);

      const alertEntity = {
        id: "alert-002",
        type: AlertType.EXIT,
        device: mockDevice,
        geofence: mockGeofence,
      };
      alertRepo.create.mockReturnValue(alertEntity);
      alertRepo.save.mockResolvedValue(alertEntity);

      const result = await service.ingest("device-001", {
        latitude: 99,
        longitude: 99,
      });

      expect(result.alerts[0].type).toBe(AlertType.EXIT);
    });

    it("should throw NotFoundException if device does not exist", async () => {
      (devicesService.findOne as jest.Mock).mockRejectedValue(
        new NotFoundException(),
      );

      await expect(service.ingest("non-existent", ingestDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(locationRepo.save).not.toHaveBeenCalled();
    });

    it("should update Redis state after ingest", async () => {
      const savedLocation = {
        id: "loc-005",
        ...ingestDto,
        recordedAt: new Date(),
        device: mockDevice,
      };
      locationRepo.create.mockReturnValue(savedLocation);
      locationRepo.save.mockResolvedValue(savedLocation);
      deviceRepo.update.mockResolvedValue(undefined);
      cache.get.mockResolvedValue(null);
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      locationRepo.createQueryBuilder.mockReturnValue(mockQb);
      (
        geofencesService.findGeofencesContainingPoint as jest.Mock
      ).mockResolvedValue([]);

      await service.ingest("device-001", ingestDto);

      // Redis must be updated with new device state
      expect(cache.set).toHaveBeenCalledWith(
        "device:device-001:state",
        expect.objectContaining({ latitude: ingestDto.latitude }),
        3600,
      );
    });

    it("should use server time when recordedAt is not provided", async () => {
      const before = new Date();
      locationRepo.create.mockImplementation((data) => data);
      locationRepo.save.mockImplementation((data) =>
        Promise.resolve({ id: "loc-x", ...data }),
      );
      deviceRepo.update.mockResolvedValue(undefined);
      cache.get.mockResolvedValue(null);
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      locationRepo.createQueryBuilder.mockReturnValue(mockQb);
      (
        geofencesService.findGeofencesContainingPoint as jest.Mock
      ).mockResolvedValue([]);

      await service.ingest("device-001", {
        latitude: -23.555,
        longitude: -46.628,
      });

      const createCall = locationRepo.create.mock.calls[0][0];
      expect(createCall.recordedAt).toBeInstanceOf(Date);
      expect(createCall.recordedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
    });
  });
});
