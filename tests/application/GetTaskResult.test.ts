import { describe, expect, it, beforeEach } from "bun:test";
import { GetTaskResult } from "../../src/application/usecases/GetTaskResult";
import type { ITaskRepository } from "../../src/domain/repositories/ITaskRepository";
import { Task, TaskStatus } from "../../src/domain/entities/Task";

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

describe("GetTaskResult", () => {
  let taskRepository: InMemoryTaskRepository;
  let getTaskResult: GetTaskResult;

  beforeEach(() => {
    taskRepository = new InMemoryTaskRepository();
    getTaskResult = new GetTaskResult(taskRepository);
  });

  describe("execute", () => {
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

      const result = await getTaskResult.execute({ taskId: task.id });

      expect(result.found).toBe(true);
      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(result.result).toBe(JSON.stringify({ output: "success" }));
    });

    it("失敗タスクのエラーメッセージを取得できる", async () => {
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

      const result = await getTaskResult.execute({ taskId: task.id });

      expect(result.found).toBe(true);
      expect(result.status).toBe(TaskStatus.FAILED);
      expect(result.errorMessage).toBe("Processing error");
    });

    it("pending状態のタスクは結果がまだない", async () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });
      await taskRepository.save(task);

      const result = await getTaskResult.execute({ taskId: task.id });

      expect(result.found).toBe(true);
      expect(result.status).toBe(TaskStatus.PENDING);
      expect(result.result).toBeUndefined();
    });

    it("存在しないタスクの場合", async () => {
      const result = await getTaskResult.execute({ taskId: "non-existent" });

      expect(result.found).toBe(false);
    });
  });
});
