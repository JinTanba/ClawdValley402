import { describe, expect, it, beforeEach } from "bun:test";
import { ProcessX402Request } from "../../src/application/usecases/ProcessX402Request";
import type { IVendorRepository } from "../../src/domain/repositories/IVendorRepository";
import type { IProductRepository } from "../../src/domain/repositories/IProductRepository";
import type { IPaymentRepository } from "../../src/domain/repositories/IPaymentRepository";
import type { ITaskRepository } from "../../src/domain/repositories/ITaskRepository";
import type { IRedeemTokenRepository } from "../../src/domain/repositories/IRedeemTokenRepository";
import type { IPaymentGateway } from "../../src/application/ports/IPaymentGateway";
import type { IEscrowService, EscrowResult } from "../../src/application/ports/IEscrowService";
import { CreateRedeemToken } from "../../src/application/usecases/CreateRedeemToken";
import { Vendor } from "../../src/domain/entities/Vendor";
import { Product, ProductType } from "../../src/domain/entities/Product";
import { Payment, PaymentStatus } from "../../src/domain/entities/Payment";
import { Task, TaskStatus } from "../../src/domain/entities/Task";
import { RedeemToken } from "../../src/domain/entities/RedeemToken";
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

class InMemoryPaymentRepository implements IPaymentRepository {
  private payments: Map<string, Payment> = new Map();

  async save(payment: Payment): Promise<void> {
    this.payments.set(payment.id, payment);
  }

  async findById(id: string): Promise<Payment | null> {
    return this.payments.get(id) ?? null;
  }

  async findByVendorId(vendorId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter((p) => p.vendorId === vendorId);
  }

  async findByStatus(status: PaymentStatus): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter((p) => p.status === status);
  }

  async findExpiredPendingEscrow(): Promise<Payment[]> {
    const now = new Date();
    return Array.from(this.payments.values()).filter(
      (p) => p.status === PaymentStatus.PENDING_ESCROW && p.expiresAt && p.expiresAt < now
    );
  }

  getAll(): Payment[] {
    return Array.from(this.payments.values());
  }
}

class MockEscrowService implements IEscrowService {
  private readonly address = "0xEscrowAddress1234567890123456789012345678";

  getEscrowAddress(): string {
    return this.address;
  }

  async releaseToVendor(_payment: Payment, _vendorAddress: string): Promise<EscrowResult> {
    return { success: true, transaction: "0xreleasetx123" };
  }

  async refundToBuyer(_payment: Payment): Promise<EscrowResult> {
    return { success: true, transaction: "0xrefundtx123" };
  }
}

class InMemoryTaskRepository implements ITaskRepository {
  private tasks: Map<string, Task> = new Map();

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async findById(id: string): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }

  async findByVendorId(vendorId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter((t) => t.vendorId === vendorId);
  }

  async findByVendorIdAndStatus(vendorId: string, status: TaskStatus): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(
      (t) => t.vendorId === vendorId && t.status === status
    );
  }

  async findPendingByVendorId(vendorId: string): Promise<Task[]> {
    return this.findByVendorIdAndStatus(vendorId, TaskStatus.PENDING);
  }

  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }
}

class InMemoryRedeemTokenRepository implements IRedeemTokenRepository {
  private tokens: Map<string, RedeemToken> = new Map();

  async save(token: RedeemToken): Promise<RedeemToken> {
    this.tokens.set(token.token, token);
    return token;
  }

  async findByToken(tokenValue: string): Promise<RedeemToken | null> {
    return this.tokens.get(tokenValue) ?? null;
  }

  getAll(): RedeemToken[] {
    return Array.from(this.tokens.values());
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
  let paymentRepository: InMemoryPaymentRepository;
  let taskRepository: InMemoryTaskRepository;
  let redeemTokenRepository: InMemoryRedeemTokenRepository;
  let paymentGateway: MockPaymentGateway;
  let escrowService: MockEscrowService;
  let processX402Request: ProcessX402Request;
  let createRedeemToken: CreateRedeemToken;
  let testVendor: Vendor;
  let testProduct: Product;

  beforeEach(async () => {
    vendorRepository = new InMemoryVendorRepository();
    productRepository = new InMemoryProductRepository();
    paymentRepository = new InMemoryPaymentRepository();
    taskRepository = new InMemoryTaskRepository();
    redeemTokenRepository = new InMemoryRedeemTokenRepository();
    paymentGateway = new MockPaymentGateway();
    escrowService = new MockEscrowService();
    createRedeemToken = new CreateRedeemToken(redeemTokenRepository, 24);

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
      paymentGateway,
      paymentRepository,
      taskRepository,
      createRedeemToken,
      escrowService
    );
  });

  describe("支払いヘッダーなし", () => {
    it("payment_requiredを返す（エスクローアドレス使用）", async () => {
      const result = await processX402Request.execute({
        vendorId: testVendor.id,
        path: "weather",
        resourceUrl: "http://localhost:3000/vendor1/weather",
      });

      expect(result.type).toBe("payment_required");
      if (result.type === "payment_required") {
        expect(result.paymentRequired.x402Version).toBe(2);
        expect(result.paymentRequired.accepts[0].payTo).toBe(escrowService.getEscrowAddress());
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

  describe("ASYNC商品", () => {
    let asyncProduct: Product;

    beforeEach(async () => {
      asyncProduct = Product.create({
        vendorId: testVendor.id,
        path: "task/ai-analysis",
        price: "$0.10",
        description: "AI Analysis Task",
        data: "",
        type: ProductType.ASYNC,
      });
      await productRepository.save(asyncProduct);
    });

    it("ASYNC商品で支払い成功時にtask_createdを返す", async () => {
      const requirements = await paymentGateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: testVendor.evmAddress,
        price: "$0.10",
        network: "eip155:84532",
      });

      const paymentPayload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/task/ai-analysis",
          description: asyncProduct.description,
          mimeType: asyncProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const result = await processX402Request.execute({
        vendorId: testVendor.id,
        path: "task/ai-analysis",
        resourceUrl: "http://localhost:3000/vendor1/task/ai-analysis",
        paymentHeader,
        requestPayload: JSON.stringify({ input: "analyze this" }),
      });

      expect(result.type).toBe("task_created");
      if (result.type === "task_created") {
        expect(result.taskId).toBeTruthy();
        expect(result.settleResponse.success).toBe(true);
      }
    });

    it("Payment とTask が保存される（エスクローステータス）", async () => {
      const requirements = await paymentGateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: testVendor.evmAddress,
        price: "$0.10",
        network: "eip155:84532",
      });

      const paymentPayload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/task/ai-analysis",
          description: asyncProduct.description,
          mimeType: asyncProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      await processX402Request.execute({
        vendorId: testVendor.id,
        path: "task/ai-analysis",
        resourceUrl: "http://localhost:3000/vendor1/task/ai-analysis",
        paymentHeader,
        requestPayload: JSON.stringify({ input: "analyze this" }),
      });

      const payments = paymentRepository.getAll();
      const tasks = taskRepository.getAll();

      expect(payments.length).toBe(1);
      expect(tasks.length).toBe(1);
      expect(payments[0].productId).toBe(asyncProduct.id);
      expect(payments[0].status).toBe(PaymentStatus.PENDING_ESCROW);
      expect(payments[0].expiresAt).toBeInstanceOf(Date);
      expect(tasks[0].paymentId).toBe(payments[0].id);
      expect(tasks[0].status).toBe(TaskStatus.PENDING);
    });
  });

  describe("APIキー商品", () => {
    let apiKeyProduct: Product;

    beforeEach(async () => {
      apiKeyProduct = Product.create({
        vendorId: testVendor.id,
        path: "api-key",
        price: "$1.00",
        description: "API Key Purchase",
        data: JSON.stringify({ type: "api-key" }),
      });
      await productRepository.save(apiKeyProduct);
    });

    it("APIキー商品で支払い成功時にredeem_tokenを返す", async () => {
      const requirements = await paymentGateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: testVendor.evmAddress,
        price: "$1.00",
        network: "eip155:84532",
      });

      const paymentPayload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/api-key",
          description: apiKeyProduct.description,
          mimeType: apiKeyProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
      const walletAddress = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";

      const result = await processX402Request.execute({
        vendorId: testVendor.id,
        path: "api-key",
        resourceUrl: "http://localhost:3000/vendor1/api-key",
        paymentHeader,
        requestPayload: JSON.stringify({ vendorId: "target-vendor-id", name: "My Key", walletAddress }),
      });

      expect(result.type).toBe("redeem_token");
      if (result.type === "redeem_token") {
        expect(result.redeemUrl).toMatch(/^\/redeem\/[a-f0-9]{64}$/);
        expect(result.settleResponse.success).toBe(true);
      }
    });

    it("Payment と RedeemToken が保存される", async () => {
      const requirements = await paymentGateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: testVendor.evmAddress,
        price: "$1.00",
        network: "eip155:84532",
      });

      const paymentPayload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/api-key",
          description: apiKeyProduct.description,
          mimeType: apiKeyProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
      const walletAddress = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";

      await processX402Request.execute({
        vendorId: testVendor.id,
        path: "api-key",
        resourceUrl: "http://localhost:3000/vendor1/api-key",
        paymentHeader,
        requestPayload: JSON.stringify({ vendorId: "target-vendor-id", name: "My Key", walletAddress }),
      });

      const payments = paymentRepository.getAll();
      const tokens = redeemTokenRepository.getAll();

      expect(payments.length).toBe(1);
      expect(tokens.length).toBe(1);
      expect(tokens[0].paymentId).toBe(payments[0].id);
      expect(tokens[0].vendorId).toBe("target-vendor-id");
      expect(tokens[0].name).toBe("My Key");
      expect(tokens[0].walletAddress).toBe(walletAddress);
    });

    it("リクエストにnameがない場合デフォルト名を使用", async () => {
      const requirements = await paymentGateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: testVendor.evmAddress,
        price: "$1.00",
        network: "eip155:84532",
      });

      const paymentPayload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/api-key",
          description: apiKeyProduct.description,
          mimeType: apiKeyProduct.mimeType,
        },
        accepted: requirements[0],
        payload: { signature: "0xvalidSignature" },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
      const walletAddress = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";

      await processX402Request.execute({
        vendorId: testVendor.id,
        path: "api-key",
        resourceUrl: "http://localhost:3000/vendor1/api-key",
        paymentHeader,
        requestPayload: JSON.stringify({ vendorId: "target-vendor-id", walletAddress }),
      });

      const tokens = redeemTokenRepository.getAll();
      expect(tokens[0].name).toBe("API Key");
    });
  });
});
