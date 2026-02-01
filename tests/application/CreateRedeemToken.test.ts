import { describe, expect, it, beforeEach } from "bun:test";
import { CreateRedeemToken } from "../../src/application/usecases/CreateRedeemToken";
import { RedeemToken, RedeemTokenStatus } from "../../src/domain/entities/RedeemToken";
import type { IRedeemTokenRepository } from "../../src/domain/repositories/IRedeemTokenRepository";

class MockRedeemTokenRepository implements IRedeemTokenRepository {
  private tokens: RedeemToken[] = [];

  async save(token: RedeemToken): Promise<RedeemToken> {
    this.tokens.push(token);
    return token;
  }

  async findByToken(tokenValue: string): Promise<RedeemToken | null> {
    return this.tokens.find((t) => t.token === tokenValue) ?? null;
  }
}

describe("CreateRedeemToken", () => {
  let repository: MockRedeemTokenRepository;
  let useCase: CreateRedeemToken;
  const validWalletAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    repository = new MockRedeemTokenRepository();
    useCase = new CreateRedeemToken(repository, 24);
  });

  it("RedeemTokenを作成できる", async () => {
    const result = await useCase.execute({
      vendorId: "vendor-123",
      name: "My API Key",
      walletAddress: validWalletAddress,
      paymentId: "payment-456",
    });

    expect(result.redeemToken.vendorId).toBe("vendor-123");
    expect(result.redeemToken.name).toBe("My API Key");
    expect(result.redeemToken.walletAddress).toBe(validWalletAddress);
    expect(result.redeemToken.paymentId).toBe("payment-456");
    expect(result.redeemToken.status).toBe(RedeemTokenStatus.PENDING);
    expect(result.redeemToken.token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("デフォルトで24時間後に期限切れになる", async () => {
    const before = new Date();
    before.setHours(before.getHours() + 23);

    const result = await useCase.execute({
      vendorId: "vendor-123",
      name: "My API Key",
      walletAddress: validWalletAddress,
      paymentId: "payment-456",
    });

    const after = new Date();
    after.setHours(after.getHours() + 25);

    expect(result.redeemToken.expiresAt.getTime()).toBeGreaterThan(before.getTime());
    expect(result.redeemToken.expiresAt.getTime()).toBeLessThan(after.getTime());
  });

  it("リデームURLが返される", async () => {
    const result = await useCase.execute({
      vendorId: "vendor-123",
      name: "My API Key",
      walletAddress: validWalletAddress,
      paymentId: "payment-456",
    });

    expect(result.redeemUrl).toBe(`/redeem/${result.redeemToken.token}`);
  });

  it("リポジトリに保存される", async () => {
    const result = await useCase.execute({
      vendorId: "vendor-123",
      name: "Test Token",
      walletAddress: validWalletAddress,
      paymentId: "payment-789",
    });

    const saved = await repository.findByToken(result.redeemToken.token);
    expect(saved).not.toBeNull();
    expect(saved?.name).toBe("Test Token");
    expect(saved?.walletAddress).toBe(validWalletAddress);
  });
});
