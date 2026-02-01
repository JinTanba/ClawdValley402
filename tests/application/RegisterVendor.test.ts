import { describe, expect, it, beforeEach } from "bun:test";
import { RegisterVendor } from "../../src/application/usecases/RegisterVendor";
import type { IVendorRepository } from "../../src/domain/repositories/IVendorRepository";
import { Vendor, VendorStatus } from "../../src/domain/entities/Vendor";

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
      if (vendor.apiKey === apiKey) {
        return vendor;
      }
    }
    return null;
  }
}

describe("RegisterVendor", () => {
  let usecase: RegisterVendor;
  let repository: InMemoryVendorRepository;

  beforeEach(() => {
    repository = new InMemoryVendorRepository();
    usecase = new RegisterVendor(repository);
  });

  it("販売者を登録できる", async () => {
    const result = await usecase.execute({
      name: "Test Vendor",
      evmAddress: "0x1234567890123456789012345678901234567890",
    });

    expect(result.vendor.name).toBe("Test Vendor");
    expect(result.vendor.evmAddress).toBe("0x1234567890123456789012345678901234567890");
    expect(result.vendor.status).toBe(VendorStatus.ACTIVE);
    expect(result.vendor.apiKey).toBeDefined();

    const saved = await repository.findById(result.vendor.id);
    expect(saved).not.toBeNull();
    expect(saved!.name).toBe("Test Vendor");
  });

  it("無効なevmAddressの場合エラー", async () => {
    await expect(
      usecase.execute({
        name: "Test Vendor",
        evmAddress: "invalid-address",
      })
    ).rejects.toThrow("evmAddress must start with 0x");
  });
});
