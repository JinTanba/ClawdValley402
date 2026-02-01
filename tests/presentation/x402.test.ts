import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { createX402Routes } from "../../src/presentation/routes/x402";
import { ProcessX402Request } from "../../src/application/usecases/ProcessX402Request";
import type { IVendorRepository } from "../../src/domain/repositories/IVendorRepository";
import type { IProductRepository } from "../../src/domain/repositories/IProductRepository";
import type { IPaymentGateway } from "../../src/application/ports/IPaymentGateway";
import { Vendor } from "../../src/domain/entities/Vendor";
import { Product } from "../../src/domain/entities/Product";
import express from "express";
import type { Server } from "http";
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

  async initialize(): Promise<void> {}

  async buildPaymentRequirements(config: ResourceConfig): Promise<PaymentRequirements[]> {
    return [
      {
        scheme: config.scheme,
        network: config.network,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount: "1000",
        payTo: config.payTo,
        maxTimeoutSeconds: config.maxTimeoutSeconds ?? 60,
        extra: {},
      },
    ];
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

describe("x402 Protected Endpoints", () => {
  let app: express.Express;
  let server: Server;
  let vendorRepository: InMemoryVendorRepository;
  let productRepository: InMemoryProductRepository;
  let paymentGateway: MockPaymentGateway;
  let baseUrl: string;
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

    const processX402Request = new ProcessX402Request(
      productRepository,
      vendorRepository,
      paymentGateway
    );

    app = express();
    app.use(express.json());
    app.use("/", createX402Routes(processX402Request, paymentGateway));

    server = app.listen(0);
    const address = server.address();
    if (typeof address === "object" && address) {
      baseUrl = `http://localhost:${address.port}`;
    }
  });

  afterEach(() => {
    server.close();
  });

  describe("GET /:vendorId/:path", () => {
    it("支払いなしで402を返す", async () => {
      const response = await fetch(`${baseUrl}/${testVendor.id}/weather`);

      expect(response.status).toBe(402);
      const paymentRequired = response.headers.get("PAYMENT-REQUIRED");
      expect(paymentRequired).toBeDefined();

      const requirements = JSON.parse(Buffer.from(paymentRequired!, "base64").toString("utf-8"));
      expect(requirements.accepts).toBeDefined();
      expect(requirements.accepts[0].payTo).toBe(testVendor.evmAddress);
      expect(requirements.x402Version).toBe(2);
    });

    it("存在しないvendorの場合404", async () => {
      const response = await fetch(`${baseUrl}/non-existent/weather`);
      expect(response.status).toBe(404);
    });

    it("存在しないpathの場合404", async () => {
      const response = await fetch(`${baseUrl}/${testVendor.id}/non-existent`);
      expect(response.status).toBe(404);
    });

    it("有効な支払いヘッダーありでコンテンツを返す", async () => {
      const requirements = await paymentGateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: testVendor.evmAddress,
        price: "$0.001",
        network: "eip155:84532",
      });

      const paymentPayload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: `${baseUrl}/${testVendor.id}/weather`,
          description: testProduct.description,
          mimeType: testProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const response = await fetch(`${baseUrl}/${testVendor.id}/weather`, {
        headers: {
          "PAYMENT-SIGNATURE": paymentHeader,
        },
      });

      expect(response.status).toBe(200);
      const paymentResponse = response.headers.get("PAYMENT-RESPONSE");
      expect(paymentResponse).toBeDefined();

      const settleResponse = JSON.parse(
        Buffer.from(paymentResponse!, "base64").toString("utf-8")
      );
      expect(settleResponse.success).toBe(true);
      expect(settleResponse.transaction).toBe("0xabc123");

      const body = await response.json();
      expect(body.weather).toBe("sunny");
    });

    it("検証失敗時に402を返す", async () => {
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
          url: `${baseUrl}/${testVendor.id}/weather`,
          description: testProduct.description,
          mimeType: testProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xinvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const response = await fetch(`${baseUrl}/${testVendor.id}/weather`, {
        headers: {
          "PAYMENT-SIGNATURE": paymentHeader,
        },
      });

      expect(response.status).toBe(402);
      const body = (await response.json()) as { error: string; reason: string };
      expect(body.error).toBe("Payment verification failed");
      expect(body.reason).toBe("Invalid signature");
    });

    it("決済失敗時に500を返す", async () => {
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
          url: `${baseUrl}/${testVendor.id}/weather`,
          description: testProduct.description,
          mimeType: testProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const response = await fetch(`${baseUrl}/${testVendor.id}/weather`, {
        headers: {
          "PAYMENT-SIGNATURE": paymentHeader,
        },
      });

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string; reason: string };
      expect(body.error).toBe("Payment settlement failed");
      expect(body.reason).toBe("Insufficient funds");
    });
  });
});
