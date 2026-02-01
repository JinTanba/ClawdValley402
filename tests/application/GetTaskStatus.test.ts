import { describe, expect, it, beforeEach } from "bun:test";
import { GetTaskStatus } from "../../src/application/usecases/GetTaskStatus";
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

describe("GetTaskStatus", () => {
  let taskRepository: InMemoryTaskRepository;
  let getTaskStatus: GetTaskStatus;

  beforeEach(() => {
    taskRepository = new InMemoryTaskRepository();
    getTaskStatus = new GetTaskStatus(taskRepository);
  });

  describe("execute", () => {
    it("タスクのステータスを取得できる", async () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });
      await taskRepository.save(task);

      const result = await getTaskStatus.execute({ taskId: task.id });

      expect(result.found).toBe(true);
      expect(result.status).toBe(TaskStatus.PENDING);
    });

    it("completed状態のタスクを取得できる", async () => {
      const task = Task.reconstruct({
        id: "task-completed",
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
        status: TaskStatus.COMPLETED,
        result: JSON.stringify({ output: "done" }),
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await taskRepository.save(task);

      const result = await getTaskStatus.execute({ taskId: task.id });

      expect(result.found).toBe(true);
      expect(result.status).toBe(TaskStatus.COMPLETED);
    });

    it("存在しないタスクの場合", async () => {
      const result = await getTaskStatus.execute({ taskId: "non-existent" });

      expect(result.found).toBe(false);
      expect(result.status).toBeUndefined();
    });
  });
});
