import { describe, expect, it } from "bun:test";
import { Vendor, VendorStatus } from "../../src/domain/entities/Vendor";

describe("Vendor", () => {
  describe("create", () => {
    it("Vendorを作成できる", () => {
      const vendor = Vendor.create({
        name: "Test Vendor",
        evmAddress: "0x1234567890123456789012345678901234567890",
      });

      expect(vendor.name).toBe("Test Vendor");
      expect(vendor.evmAddress).toBe("0x1234567890123456789012345678901234567890");
      expect(vendor.status).toBe(VendorStatus.ACTIVE);
      expect(vendor.apiKey).toBeNull();
    });

    it("evmAddressが0xで始まらない場合エラー", () => {
      expect(() =>
        Vendor.create({
          name: "Test Vendor",
          evmAddress: "1234567890123456789012345678901234567890",
        })
      ).toThrow("evmAddress must start with 0x");
    });

    it("evmAddressが42文字でない場合エラー", () => {
      expect(() =>
        Vendor.create({
          name: "Test Vendor",
          evmAddress: "0x1234",
        })
      ).toThrow("evmAddress must be 42 characters");
    });

    it("evmAddressが16進数でない場合エラー", () => {
      expect(() =>
        Vendor.create({
          name: "Test Vendor",
          evmAddress: "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
        })
      ).toThrow("evmAddress must be a valid hex string");
    });
  });

  describe("reconstruct", () => {
    it("既存データからVendorを復元できる", () => {
      const vendor = Vendor.reconstruct({
        id: "vendor-123",
        name: "Existing Vendor",
        evmAddress: "0x1234567890123456789012345678901234567890",
        apiKey: null,
        status: VendorStatus.ACTIVE,
        createdAt: new Date("2024-01-01"),
      });

      expect(vendor.id).toBe("vendor-123");
      expect(vendor.name).toBe("Existing Vendor");
      expect(vendor.apiKey).toBeNull();
    });
  });
});
