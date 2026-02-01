import { describe, expect, it, beforeEach } from "bun:test";
import express from "express";
import request from "supertest";
import { createVendorRoutes } from "../../src/presentation/routes/vendor";
import { createVendorAuthMiddleware } from "../../src/presentation/middleware/vendorAuth";
import type { IVendorRepository } from "../../src/domain/repositories/IVendorRepository";
import type { ITaskRepository } from "../../src/domain/repositories/ITaskRepository";
import type { IAPIKeyRepository } from "../../src/domain/repositories/IAPIKeyRepository";
import { Vendor, VendorStatus } from "../../src/domain/entities/Vendor";
import { Task, TaskStatus } from "../../src/domain/entities/Task";
import { APIKey } from "../../src/domain/entities/APIKey";
import { GetVendorTasks } from "../../src/application/usecases/GetVendorTasks";
import { StartTaskProcessing } from "../../src/application/usecases/StartTaskProcessing";
import { ReportTaskResult } from "../../src/application/usecases/ReportTaskResult";

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

class InMemoryAPIKeyRepository implements IAPIKeyRepository {
  private keys: Map<string, APIKey> = new Map();

  async save(apiKey: APIKey): Promise<APIKey> {
    this.keys.set(apiKey.key, apiKey);
    return apiKey;
  }

  async findByKey(key: string): Promise<APIKey | null> {
    return this.keys.get(key) ?? null;
  }

  async findByVendorId(vendorId: string): Promise<APIKey[]> {
    return Array.from(this.keys.values()).filter((k) => k.vendorId === vendorId);
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
}

describe("Vendor API", () => {
  let vendorRepository: InMemoryVendorRepository;
  let apiKeyRepository: InMemoryAPIKeyRepository;
  let taskRepository: InMemoryTaskRepository;
  let testVendor: Vendor;
  let testAPIKey: APIKey;
  let app: express.Express;
  const validWalletAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(async () => {
    vendorRepository = new InMemoryVendorRepository();
    apiKeyRepository = new InMemoryAPIKeyRepository();
    taskRepository = new InMemoryTaskRepository();

    testVendor = Vendor.reconstruct({
      id: "vendor-123",
      name: "Test Vendor",
      evmAddress: "0x1234567890123456789012345678901234567890",
      apiKey: null,
      status: VendorStatus.ACTIVE,
      createdAt: new Date(),
    });
    await vendorRepository.save(testVendor);

    testAPIKey = APIKey.create({
      vendorId: testVendor.id,
      name: "Test Key",
      walletAddress: validWalletAddress,
    });
    await apiKeyRepository.save(testAPIKey);

    const getVendorTasks = new GetVendorTasks(taskRepository);
    const startTaskProcessing = new StartTaskProcessing(taskRepository);
    const reportTaskResult = new ReportTaskResult(taskRepository);

    app = express();
    app.use(express.json());
    app.use(
      "/vendor",
      createVendorAuthMiddleware(vendorRepository, apiKeyRepository),
      createVendorRoutes(getVendorTasks, startTaskProcessing, reportTaskResult)
    );
  });

  describe("GET /vendor/tasks", () => {
    it("未処理タスク一覧を取得できる", async () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: testVendor.id,
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: JSON.stringify({ input: "test" }),
      });
      await taskRepository.save(task);

      const response = await request(app)
        .get("/vendor/tasks")
        .set("X-API-Key", testAPIKey.key);

      expect(response.status).toBe(200);
      expect(response.body.tasks.length).toBe(1);
      expect(response.body.tasks[0].id).toBe(task.id);
    });

    it("APIキーなしで401", async () => {
      const response = await request(app).get("/vendor/tasks");
      expect(response.status).toBe(401);
    });
  });

  describe("POST /vendor/tasks/:taskId/start", () => {
    it("タスクの処理を開始できる", async () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: testVendor.id,
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: JSON.stringify({ input: "test" }),
      });
      await taskRepository.save(task);

      const response = await request(app)
        .post(`/vendor/tasks/${task.id}/start`)
        .set("X-API-Key", testAPIKey.key);

      expect(response.status).toBe(200);
      expect(response.body.task.status).toBe(TaskStatus.PROCESSING);
    });

    it("存在しないタスクで404", async () => {
      const response = await request(app)
        .post("/vendor/tasks/non-existent/start")
        .set("X-API-Key", testAPIKey.key);

      expect(response.status).toBe(404);
    });
  });

  describe("POST /vendor/tasks/:taskId/complete", () => {
    it("タスクを完了できる", async () => {
      const task = Task.reconstruct({
        id: "task-processing",
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: testVendor.id,
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
        status: TaskStatus.PROCESSING,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await taskRepository.save(task);

      const response = await request(app)
        .post(`/vendor/tasks/${task.id}/complete`)
        .set("X-API-Key", testAPIKey.key)
        .send({ result: JSON.stringify({ output: "success" }) });

      expect(response.status).toBe(200);
      expect(response.body.task.status).toBe(TaskStatus.COMPLETED);
    });
  });

  describe("POST /vendor/tasks/:taskId/fail", () => {
    it("タスクを失敗状態にできる", async () => {
      const task = Task.reconstruct({
        id: "task-processing",
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: testVendor.id,
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
        status: TaskStatus.PROCESSING,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await taskRepository.save(task);

      const response = await request(app)
        .post(`/vendor/tasks/${task.id}/fail`)
        .set("X-API-Key", testAPIKey.key)
        .send({ errorMessage: "Processing failed" });

      expect(response.status).toBe(200);
      expect(response.body.task.status).toBe(TaskStatus.FAILED);
    });
  });
});
