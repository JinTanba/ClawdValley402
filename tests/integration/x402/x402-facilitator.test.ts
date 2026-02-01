import { describe, expect, it } from "bun:test";
import { TEST_CONFIG } from "./setup";

interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: Record<string, unknown>;
}

interface FacilitatorSupportedResponse {
  kinds: SupportedKind[];
  extensions: unknown[];
  signers: Record<string, string[]>;
}

describe("x402 Facilitator Communication", () => {
  describe("Facilitator Connection", () => {
    it("ファシリテーターにアクセス可能", async () => {
      const response = await fetch(`${TEST_CONFIG.facilitatorUrl}/supported`);
      expect(response.ok).toBe(true);
    });

    it("サポートされているスキームを取得できる", async () => {
      const response = await fetch(`${TEST_CONFIG.facilitatorUrl}/supported`);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as FacilitatorSupportedResponse;

      expect(data.kinds).toBeDefined();
      expect(Array.isArray(data.kinds)).toBe(true);
      expect(data.kinds.length).toBeGreaterThan(0);
      expect(data.kinds[0].x402Version).toBeDefined();
      expect(data.kinds[0].scheme).toBeDefined();
      expect(data.kinds[0].network).toBeDefined();
    });

    it("Base Sepoliaネットワークがサポートされている", async () => {
      const response = await fetch(`${TEST_CONFIG.facilitatorUrl}/supported`);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as FacilitatorSupportedResponse;

      const hasBaseSepolia = data.kinds.some(
        (kind) => kind.network === TEST_CONFIG.network || kind.network === "base-sepolia"
      );
      expect(hasBaseSepolia).toBe(true);
    });

    it("exactスキームがサポートされている", async () => {
      const response = await fetch(`${TEST_CONFIG.facilitatorUrl}/supported`);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as FacilitatorSupportedResponse;

      const hasExactScheme = data.kinds.some((kind) => kind.scheme === "exact");
      expect(hasExactScheme).toBe(true);
    });
  });

  describe("Facilitator API", () => {
    it("x402Version 2がサポートされている", async () => {
      const response = await fetch(`${TEST_CONFIG.facilitatorUrl}/supported`);
      const data = (await response.json()) as FacilitatorSupportedResponse;

      const hasVersion2 = data.kinds.some((kind) => kind.x402Version === 2);
      expect(hasVersion2).toBe(true);
    });

    it("EVMネットワーク用のsignerが設定されている", async () => {
      const response = await fetch(`${TEST_CONFIG.facilitatorUrl}/supported`);
      const data = (await response.json()) as FacilitatorSupportedResponse;

      expect(data.signers).toBeDefined();
      expect(data.signers["eip155:*"]).toBeDefined();
      expect(data.signers["eip155:*"].length).toBeGreaterThan(0);
    });
  });
});
