import "dotenv/config";
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { HTTPFacilitatorClient } from "@x402/core/server";
import express from "express";
import type { Server } from "http";

import { PrismaVendorRepository } from "../../src/infrastructure/prisma/repositories/PrismaVendorRepository";
import { PrismaProductRepository } from "../../src/infrastructure/prisma/repositories/PrismaProductRepository";
import { PrismaPaymentRepository } from "../../src/infrastructure/prisma/repositories/PrismaPaymentRepository";
import { PrismaTaskRepository } from "../../src/infrastructure/prisma/repositories/PrismaTaskRepository";
import { PrismaAPIKeyRepository } from "../../src/infrastructure/prisma/repositories/PrismaAPIKeyRepository";
import { X402PaymentGateway } from "../../src/infrastructure/x402/X402PaymentGateway";
import { EvmEscrowService } from "../../src/infrastructure/escrow/EvmEscrowService";
import { RegisterVendor } from "../../src/application/usecases/RegisterVendor";
import { RegisterProduct } from "../../src/application/usecases/RegisterProduct";
import { ProcessX402Request } from "../../src/application/usecases/ProcessX402Request";
import { GetVendorTasks } from "../../src/application/usecases/GetVendorTasks";
import { StartTaskProcessing } from "../../src/application/usecases/StartTaskProcessing";
import { ReportTaskResult } from "../../src/application/usecases/ReportTaskResult";
import { GetTaskStatus } from "../../src/application/usecases/GetTaskStatus";
import { GetTaskResult } from "../../src/application/usecases/GetTaskResult";
import { CreateAPIKey } from "../../src/application/usecases/CreateAPIKey";
import { createAdminRoutes } from "../../src/presentation/routes/admin";
import { createX402Routes } from "../../src/presentation/routes/x402";
import { createVendorRoutes } from "../../src/presentation/routes/vendor";
import { createTasksRoutes } from "../../src/presentation/routes/tasks";
import { createVendorAuthMiddleware } from "../../src/presentation/middleware/vendorAuth";
import { PaymentStatus } from "../../src/domain/entities/Payment";
import { createPaymentClient, type PaymentClient } from "./x402/helpers";

const TEST_CONFIG = {
  clientPrivateKey:
    process.env.TEST_ADDER_PRIVATE_KEY ??
    "0x04113911fb5a486ba47415464f42c621da5b019d8aeaa1df288b7407d9d9c324",
  clientAddress:
    process.env.TEST_ADDER_PUBLIC_KEY ?? "0x1aA44c933A6718a4BC44064F0067A853c34be9B0",
  serverAddress: process.env.SERVER_EVM_ADDRESS ?? "0xbd39339D4B8F79B03557fEbBc1408ec32C43C3Cb",
  facilitatorUrl: process.env.FACILITATOR_URL ?? "https://x402.org/facilitator",
  network: "eip155:84532" as const,
  usdcAddress: process.env.USDC_CONTRACT_ADDRESS ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  testPrice: "$0.001",
  escrowPrivateKey: process.env.ESCROW_PRIVATE_KEY,
  rpcUrl: process.env.RPC_URL,
};

describe("Escrow E2E Flow", () => {
  let prisma: PrismaClient;
  let server: Server;
  let baseUrl: string;
  let vendorId: string;
  let vendorApiKey: string;
  let escrowAddress: string;
  let paymentClient: PaymentClient;

  beforeAll(async () => {
    if (!TEST_CONFIG.escrowPrivateKey) {
      throw new Error("ESCROW_PRIVATE_KEY is required for escrow integration tests");
    }

    prisma = new PrismaClient();

    // Cleanup old test data
    const existingVendor = await prisma.vendor.findFirst({
      where: { evmAddress: TEST_CONFIG.serverAddress },
    });
    if (existingVendor) {
      console.log(`Cleaning up existing test vendor: ${existingVendor.id}`);
      await prisma.task.deleteMany({ where: { vendorId: existingVendor.id } });
      await prisma.payment.deleteMany({ where: { vendorId: existingVendor.id } });
      await prisma.product.deleteMany({ where: { vendorId: existingVendor.id } });
      await prisma.apiKey.deleteMany({ where: { vendorId: existingVendor.id } });
      await prisma.vendor.delete({ where: { id: existingVendor.id } });
    }

    // Setup repositories
    const vendorRepository = new PrismaVendorRepository(prisma);
    const productRepository = new PrismaProductRepository(prisma);
    const paymentRepository = new PrismaPaymentRepository(prisma);
    const taskRepository = new PrismaTaskRepository(prisma);
    const apiKeyRepository = new PrismaAPIKeyRepository(prisma);

    // Setup payment gateway
    const facilitatorClient = new HTTPFacilitatorClient({ url: TEST_CONFIG.facilitatorUrl });
    const paymentGateway = new X402PaymentGateway(facilitatorClient);
    await paymentGateway.initialize();

    // Setup escrow service
    const escrowService = new EvmEscrowService(
      TEST_CONFIG.escrowPrivateKey!,
      TEST_CONFIG.usdcAddress,
      TEST_CONFIG.rpcUrl
    );
    escrowAddress = escrowService.getEscrowAddress();
    console.log(`Escrow service enabled. Address: ${escrowAddress}`);

    // Setup usecases
    const registerVendor = new RegisterVendor(vendorRepository);
    const registerProduct = new RegisterProduct(productRepository, vendorRepository);
    const createAPIKey = new CreateAPIKey(apiKeyRepository);

    const processX402Request = new ProcessX402Request(
      productRepository,
      vendorRepository,
      paymentGateway,
      paymentRepository,
      taskRepository,
      undefined,
      escrowService
    );

    const getVendorTasks = new GetVendorTasks(taskRepository);
    const startTaskProcessing = new StartTaskProcessing(taskRepository);
    const reportTaskResult = new ReportTaskResult(
      taskRepository,
      paymentRepository,
      vendorRepository,
      escrowService
    );
    const getTaskStatus = new GetTaskStatus(taskRepository);
    const getTaskResult = new GetTaskResult(taskRepository);

    // Setup Express app
    const app = express();
    app.use(express.json());
    app.get("/health", (_req, res) => res.json({ status: "ok" }));
    app.use("/admin", createAdminRoutes(registerVendor, registerProduct));
    app.use(
      "/vendor",
      createVendorAuthMiddleware(vendorRepository, apiKeyRepository),
      createVendorRoutes(getVendorTasks, startTaskProcessing, reportTaskResult)
    );
    app.use("/tasks", createTasksRoutes(getTaskStatus, getTaskResult));
    app.use("/", createX402Routes(processX402Request, paymentGateway));

    server = app.listen(0);
    const address = server.address();
    if (typeof address !== "object" || !address) {
      throw new Error("Failed to get server address");
    }
    baseUrl = `http://localhost:${address.port}`;
    console.log(`Test server started at ${baseUrl}`);

    paymentClient = createPaymentClient(TEST_CONFIG.clientPrivateKey as `0x${string}`);
  });

  afterAll(async () => {
    if (vendorId) {
      await prisma.task.deleteMany({ where: { vendorId } });
      await prisma.payment.deleteMany({ where: { vendorId } });
      await prisma.product.deleteMany({ where: { vendorId } });
      await prisma.apiKey.deleteMany({ where: { vendorId } });
      await prisma.vendor.delete({ where: { id: vendorId } });
    }
    server?.close();
    await prisma.$disconnect();
  });

  describe("Setup: Vendor and APIKey", () => {
    it("Vendorを登録できる", async () => {
      const response = await fetch(`${baseUrl}/admin/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Escrow Test Vendor",
          evmAddress: TEST_CONFIG.serverAddress,
        }),
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as { vendor: { id: string } };
      vendorId = body.vendor.id;
      console.log(`Vendor created: ${vendorId}`);
    });

    it("APIKeyを作成できる", async () => {
      const apiKey = await prisma.apiKey.create({
        data: {
          vendorId,
          key: `ak_test_${Date.now()}`,
          name: "Test API Key",
          walletAddress: TEST_CONFIG.clientAddress,
          status: "active",
        },
      });
      vendorApiKey = apiKey.key;
      console.log(`APIKey created: ${vendorApiKey}`);
    });

    it("ASYNC商品を登録できる", async () => {
      const response = await fetch(`${baseUrl}/admin/vendors/${vendorId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "escrow-task",
          price: TEST_CONFIG.testPrice,
          description: "Escrow test async task",
          data: "",
          type: "async",
          network: TEST_CONFIG.network,
        }),
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as { product: { type: string } };
      expect(body.product.type).toBe("async");
    });
  });

  describe("Escrow Flow: Task Success", () => {
    let taskId: string;
    let paymentId: string;

    it("ASYNC商品への支払いでタスクが作成される（エスクロー保持）", async () => {
      const response = await paymentClient.fetch(`${baseUrl}/${vendorId}/escrow-task`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { taskId: string };
      taskId = body.taskId;
      console.log(`Task created: ${taskId}`);

      // Verify payment is in PENDING_ESCROW state
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      expect(task).toBeTruthy();
      paymentId = task!.paymentId;

      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(payment).toBeTruthy();
      expect(payment!.status).toBe(PaymentStatus.PENDING_ESCROW);
      expect(payment!.expiresAt).toBeTruthy();
      console.log(`Payment in escrow: ${paymentId}, status: ${payment!.status}`);
      console.log(`x402 Transaction: ${payment!.transaction}`);
    });

    it("タスク処理を開始できる", async () => {
      const response = await fetch(`${baseUrl}/vendor/tasks/${taskId}/start`, {
        method: "POST",
        headers: { "X-API-Key": vendorApiKey },
      });

      expect(response.status).toBe(200);
    });

    it("タスク完了時にエスクローがVendorにリリースされる", async () => {
      const response = await fetch(`${baseUrl}/vendor/tasks/${taskId}/complete`, {
        method: "POST",
        headers: {
          "X-API-Key": vendorApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ result: JSON.stringify({ success: true }) }),
      });

      expect(response.status).toBe(200);

      // Verify payment is now SETTLED with release transaction
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(payment!.status).toBe(PaymentStatus.SETTLED);
      expect(payment!.releaseTransaction).toBeTruthy();
      expect(payment!.releasedAt).toBeTruthy();
      console.log(`Payment released: ${payment!.releaseTransaction}`);
    });
  });

  describe("Escrow Flow: Task Failure", () => {
    let taskId: string;
    let paymentId: string;

    it("新しいタスクを作成（エスクロー保持）", async () => {
      const response = await paymentClient.fetch(`${baseUrl}/${vendorId}/escrow-task`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { taskId: string };
      taskId = body.taskId;

      const task = await prisma.task.findUnique({ where: { id: taskId } });
      paymentId = task!.paymentId;

      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(payment!.status).toBe(PaymentStatus.PENDING_ESCROW);
      console.log(`New task in escrow: ${taskId}`);
    });

    it("タスク処理を開始", async () => {
      await fetch(`${baseUrl}/vendor/tasks/${taskId}/start`, {
        method: "POST",
        headers: { "X-API-Key": vendorApiKey },
      });
    });

    it("タスク失敗時にエスクローが購入者に返金される", async () => {
      const response = await fetch(`${baseUrl}/vendor/tasks/${taskId}/fail`, {
        method: "POST",
        headers: {
          "X-API-Key": vendorApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ errorMessage: "Task processing failed" }),
      });

      expect(response.status).toBe(200);

      // Verify payment is now REFUNDED with refund transaction
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(payment!.status).toBe(PaymentStatus.REFUNDED);
      expect(payment!.refundTransaction).toBeTruthy();
      expect(payment!.refundedAt).toBeTruthy();
      console.log(`Payment refunded: ${payment!.refundTransaction}`);
    });
  });

  describe("Database Verification", () => {
    it("Payment記録が正しく保存されている", async () => {
      const payments = await prisma.payment.findMany({
        where: { vendorId },
        orderBy: { createdAt: "asc" },
      });

      expect(payments.length).toBe(2);

      const settled = payments.find((p) => p.status === PaymentStatus.SETTLED);
      const refunded = payments.find((p) => p.status === PaymentStatus.REFUNDED);

      expect(settled).toBeTruthy();
      expect(settled!.releaseTransaction).toBeTruthy();

      expect(refunded).toBeTruthy();
      expect(refunded!.refundTransaction).toBeTruthy();

      console.log("\n=== Escrow Test Summary ===");
      console.log(`Total payments: ${payments.length}`);
      console.log(`  - Settled (released to vendor): 1`);
      console.log(`  - Refunded (returned to buyer): 1`);
    });
  });
});
