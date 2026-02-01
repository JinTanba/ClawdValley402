import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { createAdminRoutes } from "../../src/presentation/routes/admin";
import { RegisterVendor } from "../../src/application/usecases/RegisterVendor";
import { RegisterProduct } from "../../src/application/usecases/RegisterProduct";
import type { IVendorRepository } from "../../src/domain/repositories/IVendorRepository";
import type { IProductRepository } from "../../src/domain/repositories/IProductRepository";
import { Vendor } from "../../src/domain/entities/Vendor";
import { Product } from "../../src/domain/entities/Product";
import express from "express";
import type { Server } from "http";

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
      if (vendor.apiKey === apiKey) return vendor;
    }
    return null;
  }
}

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
      if (product.vendorId === vendorId && product.path === path) return product;
    }
    return null;
  }

  async findByVendorId(vendorId: string): Promise<Product[]> {
    return Array.from(this.products.values()).filter((p) => p.vendorId === vendorId);
  }
}

describe("Admin API", () => {
  let app: express.Express;
  let server: Server;
  let vendorRepository: InMemoryVendorRepository;
  let productRepository: InMemoryProductRepository;
  let baseUrl: string;

  beforeEach(() => {
    vendorRepository = new InMemoryVendorRepository();
    productRepository = new InMemoryProductRepository();

    const registerVendor = new RegisterVendor(vendorRepository);
    const registerProduct = new RegisterProduct(productRepository, vendorRepository);

    app = express();
    app.use(express.json());
    app.use("/admin", createAdminRoutes(registerVendor, registerProduct));

    server = app.listen(0);
    const address = server.address();
    if (typeof address === "object" && address) {
      baseUrl = `http://localhost:${address.port}`;
    }
  });

  afterEach(() => {
    server.close();
  });

  describe("POST /admin/vendors", () => {
    it("販売者を登録できる", async () => {
      const response = await fetch(`${baseUrl}/admin/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Vendor",
          evmAddress: "0x1234567890123456789012345678901234567890",
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.vendor.name).toBe("Test Vendor");
      expect(data.vendor.apiKey).toBeDefined();
    });

    it("無効なevmAddressの場合400エラー", async () => {
      const response = await fetch(`${baseUrl}/admin/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Vendor",
          evmAddress: "invalid",
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /admin/vendors/:id/products", () => {
    it("商品を登録できる", async () => {
      const vendorRes = await fetch(`${baseUrl}/admin/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Vendor",
          evmAddress: "0x1234567890123456789012345678901234567890",
        }),
      });
      const vendorData = await vendorRes.json();
      const vendorId = vendorData.vendor.id;

      const response = await fetch(`${baseUrl}/admin/vendors/${vendorId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "weather",
          price: "$0.001",
          description: "Weather API",
          data: JSON.stringify({ sample: "weather data" }),
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.product.path).toBe("weather");
      expect(data.product.price).toBe("$0.001");
    });

    it("存在しないvendorの場合404エラー", async () => {
      const response = await fetch(`${baseUrl}/admin/vendors/non-existent/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "weather",
          price: "$0.001",
          description: "Weather API",
          data: "test",
        }),
      });

      expect(response.status).toBe(404);
    });
  });
});
