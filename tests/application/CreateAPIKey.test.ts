import { describe, expect, it, beforeEach } from "bun:test";
import { CreateAPIKey } from "../../src/application/usecases/CreateAPIKey";
import { APIKey, APIKeyStatus } from "../../src/domain/entities/APIKey";
import type { IAPIKeyRepository } from "../../src/domain/repositories/IAPIKeyRepository";

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

describe("CreateAPIKey", () => {
  let repository: MockAPIKeyRepository;
  let useCase: CreateAPIKey;
  const validWalletAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    repository = new MockAPIKeyRepository();
    useCase = new CreateAPIKey(repository);
  });

  it("APIKeyを作成できる", async () => {
    const result = await useCase.execute({
      vendorId: "vendor-123",
      name: "My API Key",
      walletAddress: validWalletAddress,
    });

    expect(result.apiKey.vendorId).toBe("vendor-123");
    expect(result.apiKey.name).toBe("My API Key");
    expect(result.apiKey.walletAddress).toBe(validWalletAddress);
    expect(result.apiKey.status).toBe(APIKeyStatus.ACTIVE);
    expect(result.apiKey.key).toMatch(/^ak_[a-f0-9]{32}$/);
  });

  it("有効期限付きAPIKeyを作成できる", async () => {
    const expiresAt = new Date("2025-12-31");

    const result = await useCase.execute({
      vendorId: "vendor-123",
      name: "Expiring Key",
      walletAddress: validWalletAddress,
      expiresAt,
    });

    expect(result.apiKey.expiresAt).toEqual(expiresAt);
  });

  it("リポジトリに保存される", async () => {
    const result = await useCase.execute({
      vendorId: "vendor-123",
      name: "Test Key",
      walletAddress: validWalletAddress,
    });

    const saved = await repository.findByKey(result.apiKey.key);
    expect(saved).not.toBeNull();
    expect(saved?.name).toBe("Test Key");
    expect(saved?.walletAddress).toBe(validWalletAddress);
  });
});
