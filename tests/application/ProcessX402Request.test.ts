import { describe, expect, it, beforeEach } from "bun:test";
import { ProcessX402Request } from "../../src/application/usecases/ProcessX402Request";
import type { IVendorRepository } from "../../src/domain/repositories/IVendorRepository";
import type { IProductRepository } from "../../src/domain/repositories/IProductRepository";
import type { IPaymentGateway } from "../../src/application/ports/IPaymentGateway";
import { Vendor } from "../../src/domain/entities/Vendor";
import { Product } from "../../src/domain/entities/Product";
import type {
  PaymentPayload,
  PaymentRequirements,
  PaymentRequired,
  VerifyResponse,
  SettleResponse,
} from "@x402/core/types";
import type { ResourceConfig, ResourceInfo } from "@x402/core/server";

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

class MockPaymentGateway implements IPaymentGateway {
  verifyResult: VerifyResponse = { isValid: true, payer: "0x1234" };
  settleResult: SettleResponse = {
    success: true,
    transaction: "0xabc123",
    network: "eip155:84532",
    payer: "0x1234",
  };
  private builtRequirements: PaymentRequirements | null = null;

  async initialize(): Promise<void> {}

  async buildPaymentRequirements(config: ResourceConfig): Promise<PaymentRequirements[]> {
    this.builtRequirements = {
      scheme: config.scheme,
      network: config.network,
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      amount: "1000",
      payTo: config.payTo,
      maxTimeoutSeconds: config.maxTimeoutSeconds ?? 60,
      extra: {},
    };
    return [this.builtRequirements];
  }

  createPaymentRequiredResponse(
    requirements: PaymentRequirements[],
    resourceInfo: ResourceInfo
  ): PaymentRequired {
    return {
      x402Version: 2,
      accepts: requirements,
      resource: resourceInfo,
    };
  }

  async verifyPayment(
    _payload: PaymentPayload,
    _requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    return this.verifyResult;
  }

  async settlePayment(
    _payload: PaymentPayload,
    _requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    return this.settleResult;
  }

  findMatchingRequirements(
    availableRequirements: PaymentRequirements[],
    paymentPayload: PaymentPayload
  ): PaymentRequirements | undefined {
    return availableRequirements.find(
      (r) =>
        r.scheme === paymentPayload.accepted.scheme &&
        r.network === paymentPayload.accepted.network
    );
  }

  parsePaymentHeader(header: string): PaymentPayload {
    return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
  }

  encodePaymentRequired(paymentRequired: PaymentRequired): string {
    return Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
  }

  encodeSettleResponse(settleResponse: SettleResponse): string {
    return Buffer.from(JSON.stringify(settleResponse)).toString("base64");
  }
}

describe("ProcessX402Request", () => {
  let vendorRepository: InMemoryVendorRepository;
  let productRepository: InMemoryProductRepository;
  let paymentGateway: MockPaymentGateway;
  let processX402Request: ProcessX402Request;
  let testVendor: Vendor;
  let testProduct: Product;

  beforeEach(async () => {
    vendorRepository = new InMemoryVendorRepository();
    productRepository = new InMemoryProductRepository();
    paymentGateway = new MockPaymentGateway();

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
      data: JSON.stringify({ weather: "sunny", temp: 25 }),
    });
    await productRepository.save(testProduct);

    processX402Request = new ProcessX402Request(
      productRepository,
      vendorRepository,
      paymentGateway
    );
  });

  describe("支払いヘッダーなし", () => {
    it("payment_requiredを返す", async () => {
      const result = await processX402Request.execute({
        vendorId: testVendor.id,
        path: "weather",
        resourceUrl: "http://localhost:3000/vendor1/weather",
      });

      expect(result.type).toBe("payment_required");
      if (result.type === "payment_required") {
        expect(result.paymentRequired.x402Version).toBe(2);
        expect(result.paymentRequired.accepts[0].payTo).toBe(testVendor.evmAddress);
      }
    });
  });

  describe("存在しないリソース", () => {
    it("vendor not foundエラー", async () => {
      const result = await processX402Request.execute({
        vendorId: "non-existent",
        path: "weather",
        resourceUrl: "http://localhost:3000/non-existent/weather",
      });

      expect(result.type).toBe("not_found");
      if (result.type === "not_found") {
        expect(result.reason).toBe("Vendor not found");
      }
    });

    it("product not foundエラー", async () => {
      const result = await processX402Request.execute({
        vendorId: testVendor.id,
        path: "non-existent",
        resourceUrl: "http://localhost:3000/vendor1/non-existent",
      });

      expect(result.type).toBe("not_found");
      if (result.type === "not_found") {
        expect(result.reason).toBe("Product not found");
      }
    });
  });

  describe("有効な支払いヘッダーあり", () => {
    it("successを返す", async () => {
      const requirements = await paymentGateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: testVendor.evmAddress,
        price: "$0.001",
        network: "eip155:84532",
      });

      const paymentPayload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/weather",
          description: testProduct.description,
          mimeType: testProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const result = await processX402Request.execute({
        vendorId: testVendor.id,
        path: "weather",
        resourceUrl: "http://localhost:3000/vendor1/weather",
        paymentHeader,
      });

      expect(result.type).toBe("success");
      if (result.type === "success") {
        expect(result.settleResponse.success).toBe(true);
        expect(result.settleResponse.transaction).toBe("0xabc123");
        expect(result.product.data).toContain("sunny");
      }
    });
  });

  describe("検証失敗", () => {
    it("verification_failedを返す", async () => {
      paymentGateway.verifyResult = {
        isValid: false,
        invalidReason: "Invalid signature",
      };

      const requirements = await paymentGateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: testVendor.evmAddress,
        price: "$0.001",
        network: "eip155:84532",
      });

      const paymentPayload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/weather",
          description: testProduct.description,
          mimeType: testProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xinvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const result = await processX402Request.execute({
        vendorId: testVendor.id,
        path: "weather",
        resourceUrl: "http://localhost:3000/vendor1/weather",
        paymentHeader,
      });

      expect(result.type).toBe("verification_failed");
      if (result.type === "verification_failed") {
        expect(result.reason).toBe("Invalid signature");
      }
    });
  });

  describe("決済失敗", () => {
    it("settlement_failedを返す", async () => {
      paymentGateway.settleResult = {
        success: false,
        errorReason: "Insufficient funds",
        transaction: "",
        network: "eip155:84532",
      };

      const requirements = await paymentGateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: testVendor.evmAddress,
        price: "$0.001",
        network: "eip155:84532",
      });

      const paymentPayload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/weather",
          description: testProduct.description,
          mimeType: testProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const result = await processX402Request.execute({
        vendorId: testVendor.id,
        path: "weather",
        resourceUrl: "http://localhost:3000/vendor1/weather",
        paymentHeader,
      });

      expect(result.type).toBe("settlement_failed");
      if (result.type === "settlement_failed") {
        expect(result.reason).toBe("Insufficient funds");
      }
    });
  });
});
