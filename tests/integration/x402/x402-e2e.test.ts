import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  TEST_CONFIG,
  type TestContext,
} from "./setup";
import {
  createPaymentClient,
  decodePaymentRequired,
  type PaymentClient,
} from "./helpers";

describe("x402 E2E Payment Flow", () => {
  let ctx: TestContext;
  let paymentClient: PaymentClient;

  beforeAll(async () => {
    ctx = await setupTestEnvironment();
    paymentClient = createPaymentClient();
  });

  afterAll(async () => {
    await cleanupTestEnvironment(ctx);
  });

  describe("402 Payment Required Response", () => {
    it("支払いヘッダーなしで402レスポンスを返す", async () => {
      const response = await fetch(`${ctx.baseUrl}/${ctx.testVendor.id}/test-data`);

      expect(response.status).toBe(402);

      const paymentRequiredHeader = response.headers.get("PAYMENT-REQUIRED");
      expect(paymentRequiredHeader).toBeTruthy();

      const requirements = decodePaymentRequired(paymentRequiredHeader!) as {
        x402Version: number;
        accepts: Array<{
          scheme: string;
          network: string;
          payTo: string;
        }>;
        resource: {
          url: string;
          description: string;
        };
      };

      expect(requirements.x402Version).toBe(2);
      expect(requirements.accepts).toBeDefined();
      expect(requirements.accepts.length).toBeGreaterThan(0);
      expect(requirements.accepts[0].scheme).toBe("exact");
      expect(requirements.accepts[0].network).toBe(TEST_CONFIG.network);
      expect(requirements.accepts[0].payTo).toBe(TEST_CONFIG.serverAddress);
      expect(requirements.resource).toBeDefined();
      expect(requirements.resource.description).toBe(ctx.testProduct.description);
    });

    it("レスポンスボディにエラーメッセージを含む", async () => {
      const response = await fetch(`${ctx.baseUrl}/${ctx.testVendor.id}/test-data`);

      expect(response.status).toBe(402);
      const body = (await response.json()) as { error: string; message: string };
      expect(body.error).toBe("Payment Required");
      expect(body.message).toBe("This endpoint requires payment");
    });
  });

  describe("404 Not Found", () => {
    it("存在しないベンダーで404を返す", async () => {
      // Use valid ObjectID format that doesn't exist
      const nonExistentVendorId = "000000000000000000000000";
      const response = await fetch(`${ctx.baseUrl}/${nonExistentVendorId}/test-data`);

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Vendor not found");
    });

    it("存在しないプロダクトで404を返す", async () => {
      const response = await fetch(`${ctx.baseUrl}/${ctx.testVendor.id}/nonexistent-path`);

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Product not found");
    });
  });

  describe("Full Payment Flow with Real Facilitator", () => {
    it("@x402/fetchで支払いを完了しデータを取得", async () => {
      const response = await paymentClient.fetch(`${ctx.baseUrl}/${ctx.testVendor.id}/test-data`);

      expect(response.status).toBe(200);

      const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE");
      expect(paymentResponseHeader).toBeTruthy();

      const settlementResponse = JSON.parse(
        Buffer.from(paymentResponseHeader!, "base64").toString("utf-8")
      ) as {
        success: boolean;
        transaction: string;
        network: string;
      };

      expect(settlementResponse.success).toBe(true);
      expect(settlementResponse.transaction).toBeTruthy();
      expect(settlementResponse.network).toBe(TEST_CONFIG.network);

      console.log("\n=== Payment Transaction ===");
      console.log(`TX Hash: ${settlementResponse.transaction}`);
      console.log(`Network: ${settlementResponse.network}`);
      console.log(`Explorer: https://sepolia.basescan.org/tx/${settlementResponse.transaction}`);

      const body = (await response.json()) as { message: string; timestamp: number };
      expect(body.message).toBe("Hello from x402!");
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("Health Check", () => {
    it("ヘルスチェックエンドポイントが正常に応答", async () => {
      const response = await fetch(`${ctx.baseUrl}/health`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe("ok");
    });
  });
});
