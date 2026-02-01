import "dotenv/config";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { PrismaVendorRepository } from "./infrastructure/prisma/repositories/PrismaVendorRepository";
import { PrismaProductRepository } from "./infrastructure/prisma/repositories/PrismaProductRepository";
import { PrismaPaymentRepository } from "./infrastructure/prisma/repositories/PrismaPaymentRepository";
import { PrismaTaskRepository } from "./infrastructure/prisma/repositories/PrismaTaskRepository";
import { PrismaAPIKeyRepository } from "./infrastructure/prisma/repositories/PrismaAPIKeyRepository";
import { PrismaRedeemTokenRepository } from "./infrastructure/prisma/repositories/PrismaRedeemTokenRepository";
import { X402PaymentGateway } from "./infrastructure/x402/X402PaymentGateway";
import { EvmEscrowService } from "./infrastructure/escrow/EvmEscrowService";
import { RegisterVendor } from "./application/usecases/RegisterVendor";
import { RegisterProduct } from "./application/usecases/RegisterProduct";
import { ProcessX402Request } from "./application/usecases/ProcessX402Request";
import { GetVendorTasks } from "./application/usecases/GetVendorTasks";
import { StartTaskProcessing } from "./application/usecases/StartTaskProcessing";
import { ReportTaskResult } from "./application/usecases/ReportTaskResult";
import { GetTaskStatus } from "./application/usecases/GetTaskStatus";
import { GetTaskResult } from "./application/usecases/GetTaskResult";
import { CreateRedeemToken } from "./application/usecases/CreateRedeemToken";
import { RedeemAPIKey } from "./application/usecases/RedeemAPIKey";
import { createAdminRoutes } from "./presentation/routes/admin";
import { createX402Routes } from "./presentation/routes/x402";
import { createVendorRoutes } from "./presentation/routes/vendor";
import { createTasksRoutes } from "./presentation/routes/tasks";
import { createRedeemRoutes } from "./presentation/routes/redeem";
import { createVendorAuthMiddleware } from "./presentation/middleware/vendorAuth";

async function main() {
  const prisma = new PrismaClient();
  const vendorRepository = new PrismaVendorRepository(prisma);
  const productRepository = new PrismaProductRepository(prisma);
  const paymentRepository = new PrismaPaymentRepository(prisma);
  const taskRepository = new PrismaTaskRepository(prisma);
  const apiKeyRepository = new PrismaAPIKeyRepository(prisma);
  const redeemTokenRepository = new PrismaRedeemTokenRepository(prisma);

  const registerVendor = new RegisterVendor(vendorRepository);
  const registerProduct = new RegisterProduct(productRepository, vendorRepository);

  const facilitatorUrl = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";
  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
  const paymentGateway = new X402PaymentGateway(facilitatorClient);

  await paymentGateway.initialize();

  const redeemTokenExpiryHours = parseInt(process.env.REDEEM_TOKEN_EXPIRY_HOURS ?? "24", 10);
  const createRedeemToken = new CreateRedeemToken(redeemTokenRepository, redeemTokenExpiryHours);
  const redeemAPIKey = new RedeemAPIKey(redeemTokenRepository, apiKeyRepository);

  const escrowPrivateKey = process.env.ESCROW_PRIVATE_KEY;
  const escrowService = escrowPrivateKey
    ? new EvmEscrowService(
        escrowPrivateKey,
        process.env.USDC_CONTRACT_ADDRESS,
        process.env.RPC_URL
      )
    : undefined;

  if (escrowService) {
    console.log(`Escrow wallet address: ${escrowService.getEscrowAddress()}`);
  }

  const processX402Request = new ProcessX402Request(
    productRepository,
    vendorRepository,
    paymentGateway,
    paymentRepository,
    taskRepository,
    createRedeemToken,
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

  app.get("/health", (req, res) => {
    res.json({ status: "ok", version: "1.0.0" });
  });

  app.use("/admin", createAdminRoutes(registerVendor, registerProduct));
  app.use(
    "/vendor",
    createVendorAuthMiddleware(vendorRepository, apiKeyRepository),
    createVendorRoutes(getVendorTasks, startTaskProcessing, reportTaskResult)
  );
  app.use("/tasks", createTasksRoutes(getTaskStatus, getTaskResult));
  app.use("/redeem", createRedeemRoutes(redeemAPIKey));
  app.use("/", createX402Routes(processX402Request, paymentGateway));

  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`x402 Sales Server running at http://localhost:${PORT}`);
    console.log(`Facilitator URL: ${facilitatorUrl}`);
    console.log("\nEndpoints:");
    console.log("  GET  /health                          - Health check");
    console.log("  POST /admin/vendors                   - Register vendor");
    console.log("  POST /admin/vendors/:id/products      - Register product (type: immediate|async)");
    console.log("  GET  /:vendorId/:productPath          - x402 protected endpoint");
    console.log("  GET  /redeem/:token                   - Redeem API key from token");
    console.log("\nVendor API (requires X-API-Key header):");
    console.log("  GET  /vendor/tasks                    - Get pending tasks");
    console.log("  POST /vendor/tasks/:taskId/start      - Start processing task");
    console.log("  POST /vendor/tasks/:taskId/complete   - Complete task with result");
    console.log("  POST /vendor/tasks/:taskId/fail       - Mark task as failed");
    console.log("\nBuyer API:");
    console.log("  GET  /tasks/:taskId                   - Get task status");
    console.log("  GET  /tasks/:taskId/result            - Get task result");
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
