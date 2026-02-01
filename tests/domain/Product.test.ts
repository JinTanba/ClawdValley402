import { describe, expect, it } from "bun:test";
import { Product, ProductStatus } from "../../src/domain/entities/Product";

describe("Product", () => {
  describe("create", () => {
    it("Productを作成できる", () => {
      const product = Product.create({
        vendorId: "vendor-123",
        path: "weather",
        price: "$0.001",
        description: "Weather data API",
        data: JSON.stringify({ sample: "data" }),
      });

      expect(product.vendorId).toBe("vendor-123");
      expect(product.path).toBe("weather");
      expect(product.price).toBe("$0.001");
      expect(product.network).toBe("eip155:84532");
      expect(product.description).toBe("Weather data API");
      expect(product.mimeType).toBe("application/json");
      expect(product.data).toBe(JSON.stringify({ sample: "data" }));
      expect(product.status).toBe(ProductStatus.ACTIVE);
    });

    it("カスタムnetworkとmimeTypeを指定できる", () => {
      const product = Product.create({
        vendorId: "vendor-123",
        path: "image",
        price: "$0.01",
        network: "eip155:1",
        description: "Image data",
        mimeType: "image/png",
        data: "base64encodedimage",
      });

      expect(product.network).toBe("eip155:1");
      expect(product.mimeType).toBe("image/png");
    });

    it("priceが$で始まらない場合エラー", () => {
      expect(() =>
        Product.create({
          vendorId: "vendor-123",
          path: "data",
          price: "0.001",
          description: "Test",
          data: "test",
        })
      ).toThrow("price must start with $");
    });

    it("priceの数値部分が無効な場合エラー", () => {
      expect(() =>
        Product.create({
          vendorId: "vendor-123",
          path: "data",
          price: "$abc",
          description: "Test",
          data: "test",
        })
      ).toThrow("price must contain a valid number");
    });

    it("pathが空の場合エラー", () => {
      expect(() =>
        Product.create({
          vendorId: "vendor-123",
          path: "",
          price: "$0.001",
          description: "Test",
          data: "test",
        })
      ).toThrow("path cannot be empty");
    });

    it("pathに/が含まれる場合も有効", () => {
      const product = Product.create({
        vendorId: "vendor-123",
        path: "api/v1/data",
        price: "$0.001",
        description: "Nested path",
        data: "test",
      });

      expect(product.path).toBe("api/v1/data");
    });
  });

  describe("reconstruct", () => {
    it("既存データからProductを復元できる", () => {
      const product = Product.reconstruct({
        id: "product-123",
        vendorId: "vendor-123",
        path: "data",
        price: "$0.001",
        network: "eip155:84532",
        description: "Test",
        mimeType: "application/json",
        data: "test",
        status: ProductStatus.ACTIVE,
        createdAt: new Date("2024-01-01"),
      });

      expect(product.id).toBe("product-123");
      expect(product.vendorId).toBe("vendor-123");
    });
  });
});
