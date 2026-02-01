import { describe, expect, it, beforeEach } from "bun:test";
import { GetProductForPayment } from "../../src/application/usecases/GetProductForPayment";
import type { IProductRepository } from "../../src/domain/repositories/IProductRepository";
import type { IVendorRepository } from "../../src/domain/repositories/IVendorRepository";
import { Product } from "../../src/domain/entities/Product";
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

describe("GetProductForPayment", () => {
  let usecase: GetProductForPayment;
  let productRepository: InMemoryProductRepository;
  let vendorRepository: InMemoryVendorRepository;
  let testVendor: Vendor;
  let testProduct: Product;

  beforeEach(async () => {
    productRepository = new InMemoryProductRepository();
    vendorRepository = new InMemoryVendorRepository();
    usecase = new GetProductForPayment(productRepository, vendorRepository);

    testVendor = Vendor.create({
      name: "Test Vendor",
      evmAddress: "0x1234567890123456789012345678901234567890",
    });
    await vendorRepository.save(testVendor);

    testProduct = Product.create({
      vendorId: testVendor.id,
      path: "weather",
      price: "$0.001",
      description: "Weather API",
      data: JSON.stringify({ weather: "sunny" }),
    });
    await productRepository.save(testProduct);
  });

  it("vendorIdとpathで商品を取得できる", async () => {
    const result = await usecase.execute({
      vendorId: testVendor.id,
      path: "weather",
    });

    expect(result.product.id).toBe(testProduct.id);
    expect(result.product.path).toBe("weather");
    expect(result.vendor.id).toBe(testVendor.id);
    expect(result.payTo).toBe(testVendor.evmAddress);
  });

  it("存在しないvendorIdの場合エラー", async () => {
    await expect(
      usecase.execute({
        vendorId: "non-existent",
        path: "weather",
      })
    ).rejects.toThrow("Vendor not found");
  });

  it("存在しないpathの場合エラー", async () => {
    await expect(
      usecase.execute({
        vendorId: testVendor.id,
        path: "non-existent",
      })
    ).rejects.toThrow("Product not found");
  });
});
