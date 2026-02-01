import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  TEST_CONFIG,
  type TestContext,
} from "./setup";
import { createPaymentClient, type PaymentClient } from "./helpers";
import { ProductType } from "../../../src/domain/entities/Product";
import { RegisterProduct } from "../../../src/application/usecases/RegisterProduct";

describe("Async Task E2E Flow", () => {
  let ctx: TestContext;
  let paymentClient: PaymentClient;
  let asyncProductId: string;
  let asyncProductPath: string;

  beforeAll(async () => {
    ctx = await setupTestEnvironment();
    paymentClient = createPaymentClient();

    // Create async product for testing
    const registerProduct = new RegisterProduct(ctx.productRepository, ctx.vendorRepository);
    const asyncProductResult = await registerProduct.execute({
      vendorId: ctx.testVendor.id,
      path: "task/ai-analysis",
      price: TEST_CONFIG.testPrice,
      description: "AI Analysis async task endpoint",
      data: "",
      mimeType: "application/json",
      network: TEST_CONFIG.network,
      type: ProductType.ASYNC,
    });
    asyncProductId = asyncProductResult.product.id;
    asyncProductPath = asyncProductResult.product.path;
  });

  afterAll(async () => {
    await cleanupTestEnvironment(ctx);
  });

  describe("ASYNC Product Registration", () => {
    it("ASYNC型商品を登録できる", async () => {
      const response = await fetch(`${ctx.baseUrl}/admin/vendors/${ctx.testVendor.id}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "task/another-task",
          price: "$0.01",
          description: "Another async task",
          data: "",
          type: "async",
          network: TEST_CONFIG.network,
        }),
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as { product: { type: string } };
      expect(body.product.type).toBe("async");

      // Cleanup
      await ctx.prisma.product.delete({
        where: {
          vendorId_path: {
            vendorId: ctx.testVendor.id,
            path: "task/another-task",
          },
        },
      });
    });
  });

  describe("Full Async Task Flow", () => {
    let taskId: string;

    it("ASYNC商品への支払いでtaskIdを取得", async () => {
      const response = await paymentClient.fetch(
        `${ctx.baseUrl}/${ctx.testVendor.id}/${asyncProductPath}`
      );

      expect(response.status).toBe(200);

      const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE");
      expect(paymentResponseHeader).toBeTruthy();

      const body = (await response.json()) as { taskId: string; message: string };
      expect(body.taskId).toBeTruthy();
      expect(body.message).toContain("Task created");

      taskId = body.taskId;
      console.log(`\n=== Task Created ===`);
      console.log(`Task ID: ${taskId}`);
    });

    it("購入者: タスクステータスを確認できる (pending)", async () => {
      const response = await fetch(`${ctx.baseUrl}/tasks/${taskId}`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe("pending");
    });

    it("販売者: 未処理タスク一覧を取得できる", async () => {
      const response = await fetch(`${ctx.baseUrl}/vendor/tasks`, {
        headers: { "X-API-Key": ctx.testVendor.apiKey },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { tasks: Array<{ id: string; status: string }> };
      expect(body.tasks.length).toBeGreaterThan(0);

      const ourTask = body.tasks.find((t) => t.id === taskId);
      expect(ourTask).toBeTruthy();
      expect(ourTask!.status).toBe("pending");
    });

    it("販売者: タスク処理を開始できる", async () => {
      const response = await fetch(`${ctx.baseUrl}/vendor/tasks/${taskId}/start`, {
        method: "POST",
        headers: { "X-API-Key": ctx.testVendor.apiKey },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { task: { status: string } };
      expect(body.task.status).toBe("processing");
    });

    it("購入者: タスクステータスを確認できる (processing)", async () => {
      const response = await fetch(`${ctx.baseUrl}/tasks/${taskId}`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe("processing");
    });

    it("購入者: 処理中のタスク結果取得は202", async () => {
      const response = await fetch(`${ctx.baseUrl}/tasks/${taskId}/result`);

      expect(response.status).toBe(202);
      const body = (await response.json()) as { status: string; message: string };
      expect(body.status).toBe("processing");
      expect(body.message).toBe("Task is still processing");
    });

    it("販売者: タスクを完了できる", async () => {
      const result = JSON.stringify({
        analysis: "Completed successfully",
        score: 95,
        timestamp: Date.now(),
      });

      const response = await fetch(`${ctx.baseUrl}/vendor/tasks/${taskId}/complete`, {
        method: "POST",
        headers: {
          "X-API-Key": ctx.testVendor.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ result }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { task: { status: string } };
      expect(body.task.status).toBe("completed");
    });

    it("購入者: 完了したタスクの結果を取得できる", async () => {
      const response = await fetch(`${ctx.baseUrl}/tasks/${taskId}/result`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string; result: string };
      expect(body.status).toBe("completed");
      expect(body.result).toBeTruthy();

      const resultData = JSON.parse(body.result) as { analysis: string; score: number };
      expect(resultData.analysis).toBe("Completed successfully");
      expect(resultData.score).toBe(95);

      console.log(`\n=== Task Completed ===`);
      console.log(`Result: ${body.result}`);
    });
  });

  describe("Task Failure Flow", () => {
    let failedTaskId: string;

    it("新しいタスクを作成", async () => {
      const response = await paymentClient.fetch(
        `${ctx.baseUrl}/${ctx.testVendor.id}/${asyncProductPath}`
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { taskId: string };
      failedTaskId = body.taskId;
    });

    it("販売者: タスク処理を開始", async () => {
      const response = await fetch(`${ctx.baseUrl}/vendor/tasks/${failedTaskId}/start`, {
        method: "POST",
        headers: { "X-API-Key": ctx.testVendor.apiKey },
      });

      expect(response.status).toBe(200);
    });

    it("販売者: タスクを失敗としてマーク", async () => {
      const response = await fetch(`${ctx.baseUrl}/vendor/tasks/${failedTaskId}/fail`, {
        method: "POST",
        headers: {
          "X-API-Key": ctx.testVendor.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ errorMessage: "Processing failed: insufficient resources" }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { task: { status: string; errorMessage: string } };
      expect(body.task.status).toBe("failed");
      expect(body.task.errorMessage).toBe("Processing failed: insufficient resources");
    });

    it("購入者: 失敗したタスクのエラーを取得できる", async () => {
      const response = await fetch(`${ctx.baseUrl}/tasks/${failedTaskId}/result`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string; errorMessage: string };
      expect(body.status).toBe("failed");
      expect(body.errorMessage).toBe("Processing failed: insufficient resources");
    });
  });

  describe("Vendor Authentication", () => {
    it("APIキーなしで401", async () => {
      const response = await fetch(`${ctx.baseUrl}/vendor/tasks`);

      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("API key required");
    });

    it("無効なAPIキーで401", async () => {
      const response = await fetch(`${ctx.baseUrl}/vendor/tasks`, {
        headers: { "X-API-Key": "invalid-api-key" },
      });

      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Invalid API key");
    });
  });

  describe("Task Not Found", () => {
    it("存在しないタスクのステータス取得で404", async () => {
      const response = await fetch(`${ctx.baseUrl}/tasks/000000000000000000000000`);

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Task not found");
    });

    it("存在しないタスクの結果取得で404", async () => {
      const response = await fetch(`${ctx.baseUrl}/tasks/000000000000000000000000/result`);

      expect(response.status).toBe(404);
    });
  });

  describe("Database Records", () => {
    it("Payment記録がDBに保存されている（エスクロー対応）", async () => {
      const payments = await ctx.prisma.payment.findMany({
        where: { vendorId: ctx.testVendor.id },
        orderBy: { createdAt: "desc" },
      });

      expect(payments.length).toBeGreaterThan(0);
      expect(payments[0].productId).toBe(asyncProductId);

      // エスクロー有効時: 完了タスクはsettled、失敗タスクはrefunded
      // エスクロー無効時: すべてsettled
      const hasEscrow = !!ctx.escrowService;
      if (hasEscrow) {
        const settledPayments = payments.filter((p) => p.status === "settled");
        const refundedPayments = payments.filter((p) => p.status === "refunded");
        console.log(`\n=== Database Records (Escrow Enabled) ===`);
        console.log(`Payments: ${payments.length}`);
        console.log(`  - Settled: ${settledPayments.length}`);
        console.log(`  - Refunded: ${refundedPayments.length}`);

        // タスク完了でsettled、タスク失敗でrefundedになっているはず
        expect(settledPayments.length).toBeGreaterThan(0);
        expect(refundedPayments.length).toBeGreaterThan(0);

        // settledのPaymentにはreleaseTransactionがある
        const settledWithTx = settledPayments.filter((p) => p.releaseTransaction);
        console.log(`  - With release tx: ${settledWithTx.length}`);
      } else {
        expect(payments[0].status).toBe("settled");
        console.log(`\n=== Database Records ===`);
        console.log(`Payments: ${payments.length}`);
      }
    });

    it("Task記録がDBに保存されている", async () => {
      const tasks = await ctx.prisma.task.findMany({
        where: { vendorId: ctx.testVendor.id },
      });

      expect(tasks.length).toBeGreaterThan(0);
      console.log(`Tasks: ${tasks.length}`);

      const completedTasks = tasks.filter((t) => t.status === "completed");
      const failedTasks = tasks.filter((t) => t.status === "failed");
      console.log(`  - Completed: ${completedTasks.length}`);
      console.log(`  - Failed: ${failedTasks.length}`);
    });
  });
});
