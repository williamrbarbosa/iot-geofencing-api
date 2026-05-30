import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
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

  beforeEach(async () => {
    geofencesService = {
      findGeofencesContainingPoint: jest.fn(),
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
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    locationRepo = module.get(getRepositoryToken(LocationEvent));
    alertRepo = module.get(getRepositoryToken(GeofenceAlert));
    deviceRepo = module.get(getRepositoryToken(Device));
  });

  // ── ingest ─────────────────────────────────────────────────────────────────
  describe("ingest", () => {
    const ingestDto = {
      latitude: -23.555,
      longitude: -46.628,
      speed: 60,
      recordedAt: "2024-01-15T14:30:00Z",
    };

    it("should persist location and update device last position", async () => {
      const savedLocation = {
        id: "loc-001",
        ...ingestDto,
        recordedAt: new Date(),
        device: mockDevice,
      };
      locationRepo.create.mockReturnValue(savedLocation);
      locationRepo.save.mockResolvedValue(savedLocation);
      deviceRepo.update.mockResolvedValue(undefined);

      // Mock createQueryBuilder for "find previous location" call → returns null (first event)
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      locationRepo.createQueryBuilder.mockReturnValue(mockQb);

      // Device is outside all geofences
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

    it("should create ENTER alert when device enters a geofence", async () => {
      const savedLocation = {
        id: "loc-002",
        ...ingestDto,
        recordedAt: new Date(),
        device: mockDevice,
      };
      locationRepo.create.mockReturnValue(savedLocation);
      locationRepo.save.mockResolvedValue(savedLocation);
      deviceRepo.update.mockResolvedValue(undefined);

      // Previous location: outside the geofence
      const prevLocation = {
        latitude: 99,
        longitude: 99,
        recordedAt: new Date(),
      };
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(prevLocation),
      };
      locationRepo.createQueryBuilder.mockReturnValue(mockQb);

      const findPoint =
        geofencesService.findGeofencesContainingPoint as jest.Mock;
      // Current position: INSIDE geofence
      findPoint.mockResolvedValueOnce([mockGeofence]);
      // Previous position: OUTSIDE geofence
      findPoint.mockResolvedValueOnce([]);

      const alertEntity = {
        id: "alert-001",
        type: AlertType.ENTER,
        device: mockDevice,
        geofence: mockGeofence,
      };
      alertRepo.create.mockReturnValue(alertEntity);
      alertRepo.save.mockResolvedValue(alertEntity);

      const result = await service.ingest("device-001", ingestDto);

      expect(alertRepo.save).toHaveBeenCalled();
      expect(result.alerts[0].type).toBe(AlertType.ENTER);
    });

    it("should create EXIT alert when device leaves a geofence", async () => {
      const savedLocation = {
        id: "loc-003",
        latitude: 99,
        longitude: 99,
        recordedAt: new Date(),
        device: mockDevice,
      };
      locationRepo.create.mockReturnValue(savedLocation);
      locationRepo.save.mockResolvedValue(savedLocation);
      deviceRepo.update.mockResolvedValue(undefined);

      // Previous location: inside the geofence
      const prevLocation = {
        latitude: -23.555,
        longitude: -46.628,
        recordedAt: new Date(),
      };
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(prevLocation),
      };
      locationRepo.createQueryBuilder.mockReturnValue(mockQb);

      const findPoint =
        geofencesService.findGeofencesContainingPoint as jest.Mock;
      // Current position: OUTSIDE
      findPoint.mockResolvedValueOnce([]);
      // Previous position: INSIDE
      findPoint.mockResolvedValueOnce([mockGeofence]);

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
        new NotFoundException("Device not found"),
      );

      await expect(service.ingest("non-existent", ingestDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(locationRepo.save).not.toHaveBeenCalled();
    });

    it("should use server time when recordedAt is not provided", async () => {
      const dtoWithoutTime = { latitude: -23.555, longitude: -46.628 };
      const before = new Date();

      locationRepo.create.mockImplementation((data) => data);
      locationRepo.save.mockImplementation((data) =>
        Promise.resolve({ id: "loc-x", ...data }),
      );
      deviceRepo.update.mockResolvedValue(undefined);

      const mockQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      locationRepo.createQueryBuilder.mockReturnValue(mockQb);
      (
        geofencesService.findGeofencesContainingPoint as jest.Mock
      ).mockResolvedValue([]);

      await service.ingest("device-001", dtoWithoutTime);

      const createCall = locationRepo.create.mock.calls[0][0];
      expect(createCall.recordedAt).toBeInstanceOf(Date);
      expect(createCall.recordedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
    });
  });
});
