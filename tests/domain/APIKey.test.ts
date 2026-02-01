import { describe, expect, it } from "bun:test";
import { APIKey, APIKeyStatus } from "../../src/domain/entities/APIKey";

describe("APIKey", () => {
  const validWalletAddress = "0x1234567890123456789012345678901234567890";

  describe("create", () => {
    it("APIKeyを作成できる", () => {
      const apiKey = APIKey.create({
        vendorId: "vendor-123",
        name: "My API Key",
        walletAddress: validWalletAddress,
      });

      expect(apiKey.vendorId).toBe("vendor-123");
      expect(apiKey.name).toBe("My API Key");
      expect(apiKey.walletAddress).toBe(validWalletAddress);
      expect(apiKey.status).toBe(APIKeyStatus.ACTIVE);
      expect(apiKey.key).toMatch(/^ak_[a-f0-9]{32}$/);
      expect(apiKey.expiresAt).toBeNull();
    });

    it("有効期限付きAPIKeyを作成できる", () => {
      const expiresAt = new Date("2025-12-31");
      const apiKey = APIKey.create({
        vendorId: "vendor-123",
        name: "Expiring Key",
        walletAddress: validWalletAddress,
        expiresAt,
      });

      expect(apiKey.expiresAt).toEqual(expiresAt);
    });

    it("名前が空の場合エラー", () => {
      expect(() =>
        APIKey.create({
          vendorId: "vendor-123",
          name: "",
          walletAddress: validWalletAddress,
        })
      ).toThrow("name cannot be empty");
    });

    it("walletAddressが0xで始まらない場合エラー", () => {
      expect(() =>
        APIKey.create({
          vendorId: "vendor-123",
          name: "Test Key",
          walletAddress: "1234567890123456789012345678901234567890",
        })
      ).toThrow("walletAddress must start with 0x");
    });

    it("walletAddressが42文字でない場合エラー", () => {
      expect(() =>
        APIKey.create({
          vendorId: "vendor-123",
          name: "Test Key",
          walletAddress: "0x1234",
        })
      ).toThrow("walletAddress must be 42 characters");
    });
  });

  describe("reconstruct", () => {
    it("既存データからAPIKeyを復元できる", () => {
      const apiKey = APIKey.reconstruct({
        id: "apikey-123",
        vendorId: "vendor-456",
        key: "ak_existing123",
        name: "Existing Key",
        walletAddress: validWalletAddress,
        status: APIKeyStatus.ACTIVE,
        createdAt: new Date("2024-01-01"),
        expiresAt: null,
      });

      expect(apiKey.id).toBe("apikey-123");
      expect(apiKey.vendorId).toBe("vendor-456");
      expect(apiKey.key).toBe("ak_existing123");
      expect(apiKey.name).toBe("Existing Key");
      expect(apiKey.walletAddress).toBe(validWalletAddress);
    });
  });

  describe("isExpired", () => {
    it("有効期限がない場合はfalse", () => {
      const apiKey = APIKey.create({
        vendorId: "vendor-123",
        name: "No Expiry",
        walletAddress: validWalletAddress,
      });

      expect(apiKey.isExpired()).toBe(false);
    });

    it("有効期限が過ぎている場合はtrue", () => {
      const apiKey = APIKey.reconstruct({
        id: "apikey-123",
        vendorId: "vendor-456",
        key: "ak_expired",
        name: "Expired Key",
        walletAddress: validWalletAddress,
        status: APIKeyStatus.ACTIVE,
        createdAt: new Date("2024-01-01"),
        expiresAt: new Date("2024-01-02"),
      });

      expect(apiKey.isExpired()).toBe(true);
    });

    it("有効期限内の場合はfalse", () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const apiKey = APIKey.reconstruct({
        id: "apikey-123",
        vendorId: "vendor-456",
        key: "ak_valid",
        name: "Valid Key",
        walletAddress: validWalletAddress,
        status: APIKeyStatus.ACTIVE,
        createdAt: new Date("2024-01-01"),
        expiresAt: futureDate,
      });

      expect(apiKey.isExpired()).toBe(false);
    });
  });

  describe("isValid", () => {
    it("アクティブで期限切れでなければtrue", () => {
      const apiKey = APIKey.create({
        vendorId: "vendor-123",
        name: "Valid Key",
        walletAddress: validWalletAddress,
      });

      expect(apiKey.isValid()).toBe(true);
    });

    it("無効化されていればfalse", () => {
      const apiKey = APIKey.reconstruct({
        id: "apikey-123",
        vendorId: "vendor-456",
        key: "ak_revoked",
        name: "Revoked Key",
        walletAddress: validWalletAddress,
        status: APIKeyStatus.REVOKED,
        createdAt: new Date("2024-01-01"),
        expiresAt: null,
      });

      expect(apiKey.isValid()).toBe(false);
    });
  });
});
