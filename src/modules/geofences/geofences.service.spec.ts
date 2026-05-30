import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { GeofencesService } from "./geofences.service";
import { Geofence } from "./geofence.entity";

// ── Mock Repository Factory ──────────────────────────────────────────────────
// We mock the TypeORM repository to avoid needing a real DB in unit tests.
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeofencesService,
        {
          provide: getRepositoryToken(Geofence),
          useFactory: mockGeofenceRepository,
        },
      ],
    }).compile();

    service = module.get<GeofencesService>(GeofencesService);
    repo = module.get(getRepositoryToken(Geofence));
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe("create", () => {
    it("should create and save a geofence", async () => {
      repo.create.mockReturnValue(sampleGeofence);
      repo.save.mockResolvedValue(sampleGeofence);

      const result = await service.create({
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
      expect(result.name).toBe("Warehouse Zone A");
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────
  describe("findOne", () => {
    it("should return a geofence when it exists", async () => {
      // Mock the query builder chain
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

      await expect(service.findOne("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────
  describe("remove", () => {
    it("should remove a geofence that exists", async () => {
      repo.findOne.mockResolvedValue(sampleGeofence);
      repo.remove.mockResolvedValue(undefined);

      await expect(service.remove(SAMPLE_GEOFENCE_ID)).resolves.not.toThrow();
      expect(repo.remove).toHaveBeenCalledWith(sampleGeofence);
    });

    it("should throw NotFoundException when trying to remove a non-existent geofence", async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── findGeofencesContainingPoint ───────────────────────────────────────────
  describe("findGeofencesContainingPoint", () => {
    it("should query with ST_Contains and return matching geofences", async () => {
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

      // Verify PostGIS query was built
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

      const result = await service.findGeofencesContainingPoint(0, 0); // middle of ocean
      expect(result).toHaveLength(0);
    });
  });
});
