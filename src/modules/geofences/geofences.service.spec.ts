import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { GeofencesService } from "./geofences.service";
import { Geofence } from "./geofence.entity";

const mockGeofenceRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  query: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockCacheManager = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
});

const SAMPLE_GEOFENCE_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const sampleGeofence: Partial<Geofence> = {
  id: SAMPLE_GEOFENCE_ID,
  name: "Warehouse Zone A",
  description: "Restricted loading area",
  isActive: true,
  area: {
    type: "Polygon",
    coordinates: [
      [
        [-46.633, -23.55],
        [-46.633, -23.56],
        [-46.623, -23.56],
        [-46.623, -23.55],
        [-46.633, -23.55],
      ],
    ],
  },
};

describe("GeofencesService", () => {
  let service: GeofencesService;
  let repo: ReturnType<typeof mockGeofenceRepository>;
  let cache: ReturnType<typeof mockCacheManager>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeofencesService,
        {
          provide: getRepositoryToken(Geofence),
          useFactory: mockGeofenceRepository,
        },
        { provide: CACHE_MANAGER, useFactory: mockCacheManager },
      ],
    }).compile();

    service = module.get<GeofencesService>(GeofencesService);
    repo = module.get(getRepositoryToken(Geofence));
    cache = module.get(CACHE_MANAGER);
  });

  describe("create", () => {
    it("should create a geofence and invalidate cache", async () => {
      repo.create.mockReturnValue(sampleGeofence);
      repo.save.mockResolvedValue(sampleGeofence);

      await service.create({
        name: "Warehouse Zone A",
        area: {
          type: "Polygon",
          coordinates: [
            [
              [-46.633, -23.55],
              [-46.633, -23.56],
              [-46.623, -23.56],
              [-46.623, -23.55],
              [-46.633, -23.55],
            ],
          ],
        },
      });

      expect(repo.save).toHaveBeenCalled();
      // Must invalidate cache after creating a new geofence
      expect(cache.del).toHaveBeenCalledWith("geofences:active");
    });
  });

  describe("findOne", () => {
    it("should return a geofence when it exists", async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(sampleGeofence),
      };
      repo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findOne(SAMPLE_GEOFENCE_ID);
      expect(result.id).toBe(SAMPLE_GEOFENCE_ID);
    });

    it("should throw NotFoundException when geofence does not exist", async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      };
      repo.createQueryBuilder.mockReturnValue(mockQb);

      await expect(service.findOne("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("remove", () => {
    it("should remove a geofence and invalidate cache", async () => {
      repo.findOne.mockResolvedValue(sampleGeofence);
      repo.remove.mockResolvedValue(undefined);

      await service.remove(SAMPLE_GEOFENCE_ID);

      expect(repo.remove).toHaveBeenCalledWith(sampleGeofence);
      expect(cache.del).toHaveBeenCalledWith("geofences:active");
    });

    it("should throw NotFoundException for non-existent geofence", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findGeofencesContainingPoint", () => {
    it("should query PostGIS ST_Contains with correct params", async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([sampleGeofence]),
      };
      repo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findGeofencesContainingPoint(
        -23.555,
        -46.628,
      );

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("ST_Contains"),
        expect.objectContaining({ lat: -23.555, lng: -46.628 }),
      );
      expect(result).toHaveLength(1);
    });

    it("should return empty array when point is outside all geofences", async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.findGeofencesContainingPoint(0, 0);
      expect(result).toHaveLength(0);
    });
  });

  describe("findAllActive", () => {
    it("should return cached geofences without hitting the DB", async () => {
      cache.get.mockResolvedValue([sampleGeofence]);

      const result = await service.findAllActive();

      expect(result).toHaveLength(1);
      expect(repo.find).not.toHaveBeenCalled(); // DB not touched
    });

    it("should query DB on cache miss and populate cache", async () => {
      cache.get.mockResolvedValue(null); // cache miss
      repo.find.mockResolvedValue([sampleGeofence]);

      const result = await service.findAllActive();

      expect(repo.find).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalledWith(
        "geofences:active",
        [sampleGeofence],
        300,
      );
      expect(result).toHaveLength(1);
    });
  });
});
