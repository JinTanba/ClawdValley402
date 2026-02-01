import "dotenv/config";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { PrismaVendorRepository } from "./infrastructure/prisma/repositories/PrismaVendorRepository";
import { PrismaProductRepository } from "./infrastructure/prisma/repositories/PrismaProductRepository";
import { X402PaymentGateway } from "./infrastructure/x402/X402PaymentGateway";
import { RegisterVendor } from "./application/usecases/RegisterVendor";
import { RegisterProduct } from "./application/usecases/RegisterProduct";
import { ProcessX402Request } from "./application/usecases/ProcessX402Request";
import { createAdminRoutes } from "./presentation/routes/admin";
import { createX402Routes } from "./presentation/routes/x402";

async function main() {
  const prisma = new PrismaClient();
  const vendorRepository = new PrismaVendorRepository(prisma);
  const productRepository = new PrismaProductRepository(prisma);

  const registerVendor = new RegisterVendor(vendorRepository);
  const registerProduct = new RegisterProduct(productRepository, vendorRepository);

  const facilitatorUrl = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";
  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
  const paymentGateway = new X402PaymentGateway(facilitatorClient);

  await paymentGateway.initialize();

  const processX402Request = new ProcessX402Request(
    productRepository,
    vendorRepository,
    paymentGateway
  );

  const app = express();
  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({ status: "ok", version: "1.0.0" });
  });

  app.use("/admin", createAdminRoutes(registerVendor, registerProduct));
  app.use("/", createX402Routes(processX402Request, paymentGateway));

  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`x402 Sales Server running at http://localhost:${PORT}`);
    console.log(`Facilitator URL: ${facilitatorUrl}`);
    console.log("\nEndpoints:");
    console.log("  GET  /health                          - Health check");
    console.log("  POST /admin/vendors                   - Register vendor");
    console.log("  POST /admin/vendors/:id/products      - Register product");
    console.log("  GET  /:vendorId/:productPath          - x402 protected endpoint");
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
