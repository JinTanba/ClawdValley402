import { describe, expect, it, beforeEach } from "bun:test";
import { RegisterProduct } from "../../src/application/usecases/RegisterProduct";
import type { IProductRepository } from "../../src/domain/repositories/IProductRepository";
import type { IVendorRepository } from "../../src/domain/repositories/IVendorRepository";
import { Product, ProductStatus } from "../../src/domain/entities/Product";
import { Vendor } from "../../src/domain/entities/Vendor";

class InMemoryProductRepository implements IProductRepository {
  private products: Map<string, Product> = new Map();

  async save(product: Product): Promise<Product> {
    this.products.set(product.id, product);
    return product;
  }

  async findById(id: string): Promise<Product | null> {
    return this.products.get(id) ?? null;
  }

  async findByVendorIdAndPath(vendorId: string, path: string): Promise<Product | null> {
    for (const product of this.products.values()) {
      if (product.vendorId === vendorId && product.path === path) {
        return product;
      }
    }
    return null;
  }

  async findByVendorId(vendorId: string): Promise<Product[]> {
    return Array.from(this.products.values()).filter((p) => p.vendorId === vendorId);
  }
}

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

describe("RegisterProduct", () => {
  let usecase: RegisterProduct;
  let productRepository: InMemoryProductRepository;
  let vendorRepository: InMemoryVendorRepository;
  let testVendor: Vendor;

  beforeEach(async () => {
    productRepository = new InMemoryProductRepository();
    vendorRepository = new InMemoryVendorRepository();
    usecase = new RegisterProduct(productRepository, vendorRepository);

    testVendor = Vendor.create({
      name: "Test Vendor",
      evmAddress: "0x1234567890123456789012345678901234567890",
    });
    await vendorRepository.save(testVendor);
  });

  it("商品を登録できる", async () => {
    const result = await usecase.execute({
      vendorId: testVendor.id,
      path: "weather",
      price: "$0.001",
      description: "Weather API",
      data: JSON.stringify({ sample: "data" }),
    });

    expect(result.product.vendorId).toBe(testVendor.id);
    expect(result.product.path).toBe("weather");
    expect(result.product.price).toBe("$0.001");
    expect(result.product.status).toBe(ProductStatus.ACTIVE);

    const saved = await productRepository.findById(result.product.id);
    expect(saved).not.toBeNull();
  });

  it("存在しないvendorIdの場合エラー", async () => {
    await expect(
      usecase.execute({
        vendorId: "non-existent-vendor",
        path: "weather",
        price: "$0.001",
        description: "Weather API",
        data: "test",
      })
    ).rejects.toThrow("Vendor not found");
  });

  it("重複pathの場合エラー", async () => {
    await usecase.execute({
      vendorId: testVendor.id,
      path: "weather",
      price: "$0.001",
      description: "Weather API",
      data: "test",
    });

    await expect(
      usecase.execute({
        vendorId: testVendor.id,
        path: "weather",
        price: "$0.002",
        description: "Another API",
        data: "test2",
      })
    ).rejects.toThrow("Product with this path already exists");
  });
});
