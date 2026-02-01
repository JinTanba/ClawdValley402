import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { HTTPFacilitatorClient } from "@x402/core/server";
import express from "express";
import type { Server } from "http";

import { PrismaVendorRepository } from "../../../src/infrastructure/prisma/repositories/PrismaVendorRepository";
import { PrismaProductRepository } from "../../../src/infrastructure/prisma/repositories/PrismaProductRepository";
import { PrismaPaymentRepository } from "../../../src/infrastructure/prisma/repositories/PrismaPaymentRepository";
import { PrismaTaskRepository } from "../../../src/infrastructure/prisma/repositories/PrismaTaskRepository";
import { PrismaAPIKeyRepository } from "../../../src/infrastructure/prisma/repositories/PrismaAPIKeyRepository";
import { X402PaymentGateway } from "../../../src/infrastructure/x402/X402PaymentGateway";
import { EvmEscrowService } from "../../../src/infrastructure/escrow/EvmEscrowService";
import { RegisterVendor } from "../../../src/application/usecases/RegisterVendor";
import { RegisterProduct } from "../../../src/application/usecases/RegisterProduct";
import { CreateAPIKey } from "../../../src/application/usecases/CreateAPIKey";
import { ProcessX402Request } from "../../../src/application/usecases/ProcessX402Request";
import { GetVendorTasks } from "../../../src/application/usecases/GetVendorTasks";
import { StartTaskProcessing } from "../../../src/application/usecases/StartTaskProcessing";
import { ReportTaskResult } from "../../../src/application/usecases/ReportTaskResult";
import { GetTaskStatus } from "../../../src/application/usecases/GetTaskStatus";
import { GetTaskResult } from "../../../src/application/usecases/GetTaskResult";
import { createAdminRoutes } from "../../../src/presentation/routes/admin";
import { createX402Routes } from "../../../src/presentation/routes/x402";
import { createVendorRoutes } from "../../../src/presentation/routes/vendor";
import { createTasksRoutes } from "../../../src/presentation/routes/tasks";
import { createVendorAuthMiddleware } from "../../../src/presentation/middleware/vendorAuth";
import type { Vendor } from "../../../src/domain/entities/Vendor";
import type { Product } from "../../../src/domain/entities/Product";
import type { IEscrowService } from "../../../src/application/ports/IEscrowService";

export interface TestVendor {
  id: string;
  name: string;
  evmAddress: string;
  apiKey: string;
}

export interface TestContext {
  prisma: PrismaClient;
  vendorRepository: PrismaVendorRepository;
  productRepository: PrismaProductRepository;
  paymentRepository: PrismaPaymentRepository;
  taskRepository: PrismaTaskRepository;
  paymentGateway: X402PaymentGateway;
  escrowService?: IEscrowService;
  server: Server;
  baseUrl: string;
  testVendor: TestVendor;
  testProduct: Product;
  testAsyncProduct?: Product;
}

export const TEST_CONFIG = {
  clientPrivateKey:
    process.env.TEST_ADDER_PRIVATE_KEY ??
    "0x04113911fb5a486ba47415464f42c621da5b019d8aeaa1df288b7407d9d9c324",
  clientAddress:
    process.env.TEST_ADDER_PUBLIC_KEY ?? "0x1aA44c933A6718a4BC44064F0067A853c34be9B0",
  serverAddress: process.env.SERVER_EVM_ADDRESS ?? "0xbd39339D4B8F79B03557fEbBc1408ec32C43C3Cb",
  facilitatorUrl: process.env.FACILITATOR_URL ?? "https://x402.org/facilitator",
  network: "eip155:84532" as const,
  usdcAddress: process.env.USDC_CONTRACT_ADDRESS ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  testPrice: "$0.001",
  escrowPrivateKey: process.env.ESCROW_PRIVATE_KEY,
  rpcUrl: process.env.RPC_URL,
};

export async function setupTestEnvironment(): Promise<TestContext> {
  const prisma = new PrismaClient();

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

  const vendorRepository = new PrismaVendorRepository(prisma);
  const productRepository = new PrismaProductRepository(prisma);
  const paymentRepository = new PrismaPaymentRepository(prisma);
  const taskRepository = new PrismaTaskRepository(prisma);
  const apiKeyRepository = new PrismaAPIKeyRepository(prisma);

  const facilitatorClient = new HTTPFacilitatorClient({ url: TEST_CONFIG.facilitatorUrl });
  const paymentGateway = new X402PaymentGateway(facilitatorClient);
  await paymentGateway.initialize();

  const escrowService = TEST_CONFIG.escrowPrivateKey
    ? new EvmEscrowService(
        TEST_CONFIG.escrowPrivateKey,
        TEST_CONFIG.usdcAddress,
        TEST_CONFIG.rpcUrl
      )
    : undefined;

  if (escrowService) {
    console.log(`Escrow service enabled. Address: ${escrowService.getEscrowAddress()}`);
  }

  const registerVendor = new RegisterVendor(vendorRepository);
  const registerProduct = new RegisterProduct(productRepository, vendorRepository);

  const processX402Request = new ProcessX402Request(
    productRepository,
    vendorRepository,
    paymentGateway,
    paymentRepository,
    taskRepository,
    undefined, // createRedeemToken
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

  const server = app.listen(0);
  const address = server.address();
  if (typeof address !== "object" || !address) {
    throw new Error("Failed to get server address");
  }
  const baseUrl = `http://localhost:${address.port}`;

  // Create test vendor and API key
  const vendorResult = await registerVendor.execute({
    name: "Integration Test Vendor",
    evmAddress: TEST_CONFIG.serverAddress,
  });
  const vendor = vendorResult.vendor;

  const createAPIKey = new CreateAPIKey(apiKeyRepository);
  const apiKeyResult = await createAPIKey.execute({
    vendorId: vendor.id,
    name: "Test API Key",
    walletAddress: TEST_CONFIG.clientAddress,
  });

  // Verify APIKey was saved correctly
  const savedApiKey = await apiKeyRepository.findByKey(apiKeyResult.apiKey.key);
  if (!savedApiKey) {
    throw new Error("Failed to save APIKey");
  }
  console.log(`APIKey saved: vendorId=${savedApiKey.vendorId}, key=${savedApiKey.key}`);

  const testVendor: TestVendor = {
    id: vendor.id,
    name: vendor.name,
    evmAddress: vendor.evmAddress,
    apiKey: apiKeyResult.apiKey.key,
  };
  console.log(`Test vendor created: id=${testVendor.id}, apiKey=${testVendor.apiKey}`);

  const productResult = await registerProduct.execute({
    vendorId: testVendor.id,
    path: "test-data",
    price: TEST_CONFIG.testPrice,
    description: "Integration test data endpoint",
    data: JSON.stringify({ message: "Hello from x402!", timestamp: Date.now() }),
    mimeType: "application/json",
    network: TEST_CONFIG.network,
  });
  const testProduct = productResult.product;

  return {
    prisma,
    vendorRepository,
    productRepository,
    paymentRepository,
    taskRepository,
    paymentGateway,
    escrowService,
    server,
    baseUrl,
    testVendor,
    testProduct,
  };
}

export async function cleanupTestEnvironment(ctx: TestContext): Promise<void> {
  // Delete test tasks, payments, products, api keys, and vendor from database
  await ctx.prisma.task.deleteMany({
    where: { vendorId: ctx.testVendor.id },
  });
  await ctx.prisma.payment.deleteMany({
    where: { vendorId: ctx.testVendor.id },
  });
  await ctx.prisma.product.deleteMany({
    where: { vendorId: ctx.testVendor.id },
  });
  await ctx.prisma.apiKey.deleteMany({
    where: { vendorId: ctx.testVendor.id },
  });
  await ctx.prisma.vendor.delete({
    where: { id: ctx.testVendor.id },
  });

  ctx.server.close();
  await ctx.prisma.$disconnect();
}
