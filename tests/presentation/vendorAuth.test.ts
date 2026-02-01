import { describe, expect, it, beforeEach } from "bun:test";
import express from "express";
import request from "supertest";
import { createVendorAuthMiddleware } from "../../src/presentation/middleware/vendorAuth";
import type { IVendorRepository } from "../../src/domain/repositories/IVendorRepository";
import type { IAPIKeyRepository } from "../../src/domain/repositories/IAPIKeyRepository";
import { Vendor, VendorStatus } from "../../src/domain/entities/Vendor";
import { APIKey, APIKeyStatus } from "../../src/domain/entities/APIKey";

class InMemoryVendorRepository implements IVendorRepository {
  private vendors: Map<string, Vendor> = new Map();

  async save(vendor: Vendor): Promise<Vendor> {
    this.vendors.set(vendor.id, vendor);
    return vendor;
  }

  async findById(id: string): Promise<Vendor | null> {
    return this.vendors.get(id) ?? null;
  }

  async findByApiKey(apiKey: string): Promise<Vendor | null> {
    for (const vendor of this.vendors.values()) {
      if (vendor.apiKey === apiKey) return vendor;
    }
    return null;
  }
}

class InMemoryAPIKeyRepository implements IAPIKeyRepository {
  private keys: Map<string, APIKey> = new Map();

  async save(apiKey: APIKey): Promise<APIKey> {
    this.keys.set(apiKey.key, apiKey);
    return apiKey;
  }

  async findByKey(key: string): Promise<APIKey | null> {
    return this.keys.get(key) ?? null;
  }

  async findByVendorId(vendorId: string): Promise<APIKey[]> {
    return Array.from(this.keys.values()).filter((k) => k.vendorId === vendorId);
  }
}

describe("vendorAuth middleware", () => {
  let vendorRepository: InMemoryVendorRepository;
  let apiKeyRepository: InMemoryAPIKeyRepository;
  let testVendor: Vendor;
  let testAPIKey: APIKey;
  let app: express.Express;
  const validWalletAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(async () => {
    vendorRepository = new InMemoryVendorRepository();
    apiKeyRepository = new InMemoryAPIKeyRepository();

    testVendor = Vendor.reconstruct({
      id: "vendor-123",
      name: "Test Vendor",
      evmAddress: "0x1234567890123456789012345678901234567890",
      apiKey: null,
      status: VendorStatus.ACTIVE,
      createdAt: new Date(),
    });
    await vendorRepository.save(testVendor);

    testAPIKey = APIKey.create({
      vendorId: testVendor.id,
      name: "Test Key",
      walletAddress: validWalletAddress,
    });
    await apiKeyRepository.save(testAPIKey);

    app = express();
    app.use(express.json());
    app.use(createVendorAuthMiddleware(vendorRepository, apiKeyRepository));
    app.get("/test", (req, res) => {
      res.json({ vendorId: (req as any).vendor.id });
    });
  });

  describe("X-API-Key header", () => {
    it("有効なAPIキーで認証できる", async () => {
      const response = await request(app)
        .get("/test")
        .set("X-API-Key", testAPIKey.key);

      expect(response.status).toBe(200);
      expect(response.body.vendorId).toBe(testVendor.id);
    });

    it("APIキーがない場合401", async () => {
      const response = await request(app).get("/test");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("API key required");
    });

    it("無効なAPIキーの場合401", async () => {
      const response = await request(app)
        .get("/test")
        .set("X-API-Key", "invalid-key");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid API key");
    });

    it("期限切れのAPIキーの場合401", async () => {
      const expiredKey = APIKey.reconstruct({
        id: "expired-key-id",
        vendorId: testVendor.id,
        key: "ak_expiredkey123",
        name: "Expired Key",
        walletAddress: validWalletAddress,
        status: APIKeyStatus.ACTIVE,
        createdAt: new Date("2024-01-01"),
        expiresAt: new Date("2024-01-02"),
      });
      await apiKeyRepository.save(expiredKey);

      const response = await request(app)
        .get("/test")
        .set("X-API-Key", "ak_expiredkey123");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("API key expired or revoked");
    });

    it("無効化されたAPIキーの場合401", async () => {
      const revokedKey = APIKey.reconstruct({
        id: "revoked-key-id",
        vendorId: testVendor.id,
        key: "ak_revokedkey123",
        name: "Revoked Key",
        walletAddress: validWalletAddress,
        status: APIKeyStatus.REVOKED,
        createdAt: new Date(),
        expiresAt: null,
      });
      await apiKeyRepository.save(revokedKey);

      const response = await request(app)
        .get("/test")
        .set("X-API-Key", "ak_revokedkey123");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("API key expired or revoked");
    });
  });
});
