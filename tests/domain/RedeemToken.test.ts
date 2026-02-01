import { describe, expect, it } from "bun:test";
import { RedeemToken, RedeemTokenStatus } from "../../src/domain/entities/RedeemToken";

describe("RedeemToken", () => {
  const validWalletAddress = "0x1234567890123456789012345678901234567890";

  describe("create", () => {
    it("RedeemTokenを作成できる", () => {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const token = RedeemToken.create({
        vendorId: "vendor-123",
        name: "API Key Name",
        walletAddress: validWalletAddress,
        paymentId: "payment-456",
        expiresAt,
      });

      expect(token.vendorId).toBe("vendor-123");
      expect(token.name).toBe("API Key Name");
      expect(token.walletAddress).toBe(validWalletAddress);
      expect(token.paymentId).toBe("payment-456");
      expect(token.status).toBe(RedeemTokenStatus.PENDING);
      expect(token.token).toMatch(/^[a-f0-9]{64}$/);
      expect(token.expiresAt).toEqual(expiresAt);
    });

    it("名前が空の場合エラー", () => {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      expect(() =>
        RedeemToken.create({
          vendorId: "vendor-123",
          name: "",
          walletAddress: validWalletAddress,
          paymentId: "payment-456",
          expiresAt,
        })
      ).toThrow("name cannot be empty");
    });
  });

  describe("reconstruct", () => {
    it("既存データからRedeemTokenを復元できる", () => {
      const expiresAt = new Date("2025-12-31");

      const token = RedeemToken.reconstruct({
        id: "token-123",
        token: "abc123def456",
        vendorId: "vendor-456",
        name: "Existing Token",
        walletAddress: validWalletAddress,
        paymentId: "payment-789",
        status: RedeemTokenStatus.PENDING,
        createdAt: new Date("2024-01-01"),
        expiresAt,
      });

      expect(token.id).toBe("token-123");
      expect(token.token).toBe("abc123def456");
      expect(token.vendorId).toBe("vendor-456");
      expect(token.name).toBe("Existing Token");
      expect(token.walletAddress).toBe(validWalletAddress);
    });
  });

  describe("isExpired", () => {
    it("有効期限が過ぎている場合はtrue", () => {
      const token = RedeemToken.reconstruct({
        id: "token-123",
        token: "abc123",
        vendorId: "vendor-456",
        name: "Expired Token",
        walletAddress: validWalletAddress,
        paymentId: "payment-789",
        status: RedeemTokenStatus.PENDING,
        createdAt: new Date("2024-01-01"),
        expiresAt: new Date("2024-01-02"),
      });

      expect(token.isExpired()).toBe(true);
    });

    it("有効期限内の場合はfalse", () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const token = RedeemToken.reconstruct({
        id: "token-123",
        token: "abc123",
        vendorId: "vendor-456",
        name: "Valid Token",
        walletAddress: validWalletAddress,
        paymentId: "payment-789",
        status: RedeemTokenStatus.PENDING,
        createdAt: new Date("2024-01-01"),
        expiresAt: futureDate,
      });

      expect(token.isExpired()).toBe(false);
    });
  });

  describe("canRedeem", () => {
    it("pendingで期限内であればtrue", () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const token = RedeemToken.reconstruct({
        id: "token-123",
        token: "abc123",
        vendorId: "vendor-456",
        name: "Valid Token",
        walletAddress: validWalletAddress,
        paymentId: "payment-789",
        status: RedeemTokenStatus.PENDING,
        createdAt: new Date("2024-01-01"),
        expiresAt: futureDate,
      });

      expect(token.canRedeem()).toBe(true);
    });

    it("redeemedであればfalse", () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const token = RedeemToken.reconstruct({
        id: "token-123",
        token: "abc123",
        vendorId: "vendor-456",
        name: "Redeemed Token",
        walletAddress: validWalletAddress,
        paymentId: "payment-789",
        status: RedeemTokenStatus.REDEEMED,
        createdAt: new Date("2024-01-01"),
        expiresAt: futureDate,
      });

      expect(token.canRedeem()).toBe(false);
    });

    it("期限切れであればfalse", () => {
      const token = RedeemToken.reconstruct({
        id: "token-123",
        token: "abc123",
        vendorId: "vendor-456",
        name: "Expired Token",
        walletAddress: validWalletAddress,
        paymentId: "payment-789",
        status: RedeemTokenStatus.PENDING,
        createdAt: new Date("2024-01-01"),
        expiresAt: new Date("2024-01-02"),
      });

      expect(token.canRedeem()).toBe(false);
    });
  });

  describe("markAsRedeemed", () => {
    it("ステータスをredeemedに変更できる", () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const token = RedeemToken.reconstruct({
        id: "token-123",
        token: "abc123",
        vendorId: "vendor-456",
        name: "Token",
        walletAddress: validWalletAddress,
        paymentId: "payment-789",
        status: RedeemTokenStatus.PENDING,
        createdAt: new Date("2024-01-01"),
        expiresAt: futureDate,
      });

      const redeemedToken = token.markAsRedeemed();

      expect(redeemedToken.status).toBe(RedeemTokenStatus.REDEEMED);
      expect(redeemedToken.id).toBe(token.id);
    });
  });
});
