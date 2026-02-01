import { describe, expect, it, beforeEach } from "bun:test";
import express from "express";
import request from "supertest";
import { createRedeemRoutes } from "../../src/presentation/routes/redeem";
import { RedeemAPIKey } from "../../src/application/usecases/RedeemAPIKey";
import { APIKey, APIKeyStatus } from "../../src/domain/entities/APIKey";
import { RedeemToken, RedeemTokenStatus } from "../../src/domain/entities/RedeemToken";
import type { IAPIKeyRepository } from "../../src/domain/repositories/IAPIKeyRepository";
import type { IRedeemTokenRepository } from "../../src/domain/repositories/IRedeemTokenRepository";

class MockAPIKeyRepository implements IAPIKeyRepository {
  private keys: APIKey[] = [];

  async save(apiKey: APIKey): Promise<APIKey> {
    this.keys.push(apiKey);
    return apiKey;
  }

  async findByKey(key: string): Promise<APIKey | null> {
    return this.keys.find((k) => k.key === key) ?? null;
  }

  async findByVendorId(vendorId: string): Promise<APIKey[]> {
    return this.keys.filter((k) => k.vendorId === vendorId);
  }
}

class MockRedeemTokenRepository implements IRedeemTokenRepository {
  private tokens: RedeemToken[] = [];

  async save(token: RedeemToken): Promise<RedeemToken> {
    const index = this.tokens.findIndex((t) => t.id === token.id);
    if (index >= 0) {
      this.tokens[index] = token;
    } else {
      this.tokens.push(token);
    }
    return token;
  }

  async findByToken(tokenValue: string): Promise<RedeemToken | null> {
    return this.tokens.find((t) => t.token === tokenValue) ?? null;
  }

  addToken(token: RedeemToken): void {
    this.tokens.push(token);
  }
}

describe("redeem routes", () => {
  let apiKeyRepository: MockAPIKeyRepository;
  let redeemTokenRepository: MockRedeemTokenRepository;
  let redeemAPIKey: RedeemAPIKey;
  let app: express.Express;
  const validWalletAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    apiKeyRepository = new MockAPIKeyRepository();
    redeemTokenRepository = new MockRedeemTokenRepository();
    redeemAPIKey = new RedeemAPIKey(redeemTokenRepository, apiKeyRepository);

    app = express();
    app.use(express.json());
    app.use("/redeem", createRedeemRoutes(redeemAPIKey));
  });

  describe("GET /redeem/:token", () => {
    it("有効なトークンでAPIKeyを取得できる", async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 24);

      const token = RedeemToken.reconstruct({
        id: "token-123",
        token: "valid-token-abc123",
        vendorId: "vendor-456",
        name: "My API Key",
        walletAddress: validWalletAddress,
        paymentId: "payment-789",
        status: RedeemTokenStatus.PENDING,
        createdAt: new Date(),
        expiresAt: futureDate,
      });
      redeemTokenRepository.addToken(token);

      const response = await request(app).get("/redeem/valid-token-abc123");

      expect(response.status).toBe(200);
      expect(response.body.vendorId).toBe("vendor-456");
      expect(response.body.apiKey).toMatch(/^ak_[a-f0-9]{32}$/);
      expect(response.body.name).toBe("My API Key");
    });

    it("存在しないトークンで404", async () => {
      const response = await request(app).get("/redeem/non-existent-token");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Token not found");
    });

    it("期限切れトークンで400", async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      const token = RedeemToken.reconstruct({
        id: "token-123",
        token: "expired-token",
        vendorId: "vendor-456",
        name: "Expired Key",
        walletAddress: validWalletAddress,
        paymentId: "payment-789",
        status: RedeemTokenStatus.PENDING,
        createdAt: new Date(),
        expiresAt: pastDate,
      });
      redeemTokenRepository.addToken(token);

      const response = await request(app).get("/redeem/expired-token");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Token expired or already redeemed");
    });

    it("既に使用済みのトークンで400", async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 24);

      const token = RedeemToken.reconstruct({
        id: "token-123",
        token: "redeemed-token",
        vendorId: "vendor-456",
        name: "Used Key",
        walletAddress: validWalletAddress,
        paymentId: "payment-789",
        status: RedeemTokenStatus.REDEEMED,
        createdAt: new Date(),
        expiresAt: futureDate,
      });
      redeemTokenRepository.addToken(token);

      const response = await request(app).get("/redeem/redeemed-token");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Token expired or already redeemed");
    });
  });
});
