import { describe, expect, it, beforeEach } from "bun:test";
import express from "express";
import request from "supertest";
import { createTasksRoutes } from "../../src/presentation/routes/tasks";
import type { ITaskRepository } from "../../src/domain/repositories/ITaskRepository";
import { Task, TaskStatus } from "../../src/domain/entities/Task";
import { GetTaskStatus } from "../../src/application/usecases/GetTaskStatus";
import { GetTaskResult } from "../../src/application/usecases/GetTaskResult";

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

describe("Tasks API (Buyer)", () => {
  let taskRepository: InMemoryTaskRepository;
  let app: express.Express;

  beforeEach(() => {
    taskRepository = new InMemoryTaskRepository();

    const getTaskStatus = new GetTaskStatus(taskRepository);
    const getTaskResult = new GetTaskResult(taskRepository);

    app = express();
    app.use(express.json());
    app.use("/tasks", createTasksRoutes(getTaskStatus, getTaskResult));
  });

  describe("GET /tasks/:taskId", () => {
    it("タスクのステータスを取得できる", async () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });
      await taskRepository.save(task);

      const response = await request(app).get(`/tasks/${task.id}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(TaskStatus.PENDING);
    });

    it("存在しないタスクで404", async () => {
      const response = await request(app).get("/tasks/non-existent");

      expect(response.status).toBe(404);
    });
  });

  describe("GET /tasks/:taskId/result", () => {
    it("完了タスクの結果を取得できる", async () => {
      const task = Task.reconstruct({
        id: "task-completed",
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
        status: TaskStatus.COMPLETED,
        result: JSON.stringify({ output: "success" }),
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await taskRepository.save(task);

      const response = await request(app).get(`/tasks/${task.id}/result`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(TaskStatus.COMPLETED);
      expect(response.body.result).toBe(JSON.stringify({ output: "success" }));
    });

    it("pending状態のタスクは202", async () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });
      await taskRepository.save(task);

      const response = await request(app).get(`/tasks/${task.id}/result`);

      expect(response.status).toBe(202);
      expect(response.body.status).toBe(TaskStatus.PENDING);
    });

    it("失敗タスクのエラーを取得できる", async () => {
      const task = Task.reconstruct({
        id: "task-failed",
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
        status: TaskStatus.FAILED,
        result: null,
        errorMessage: "Processing error",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await taskRepository.save(task);

      const response = await request(app).get(`/tasks/${task.id}/result`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(TaskStatus.FAILED);
      expect(response.body.errorMessage).toBe("Processing error");
    });

    it("存在しないタスクで404", async () => {
      const response = await request(app).get("/tasks/non-existent/result");

      expect(response.status).toBe(404);
    });
  });
});
