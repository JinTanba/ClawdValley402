import { describe, expect, it, beforeEach } from "bun:test";
import { StartTaskProcessing } from "../../src/application/usecases/StartTaskProcessing";
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

describe("StartTaskProcessing", () => {
  let taskRepository: InMemoryTaskRepository;
  let startTaskProcessing: StartTaskProcessing;
  let testTask: Task;

  beforeEach(async () => {
    taskRepository = new InMemoryTaskRepository();
    startTaskProcessing = new StartTaskProcessing(taskRepository);

    testTask = Task.create({
      paymentId: "payment-123",
      productId: "product-123",
      vendorId: "vendor-123",
      buyerAddress: "0x1234567890123456789012345678901234567890",
      requestPayload: JSON.stringify({ input: "test" }),
    });
    await taskRepository.save(testTask);
  });

  describe("execute", () => {
    it("タスクをprocessing状態に変更できる", async () => {
      const result = await startTaskProcessing.execute({
        taskId: testTask.id,
        vendorId: "vendor-123",
      });

      expect(result.success).toBe(true);
      expect(result.task?.status).toBe(TaskStatus.PROCESSING);
    });

    it("存在しないタスクの場合エラー", async () => {
      const result = await startTaskProcessing.execute({
        taskId: "non-existent",
        vendorId: "vendor-123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Task not found");
    });

    it("異なるvendorのタスクは処理開始できない", async () => {
      const result = await startTaskProcessing.execute({
        taskId: testTask.id,
        vendorId: "other-vendor",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Task not found");
    });

    it("既にprocessing状態のタスクは開始できない", async () => {
      await startTaskProcessing.execute({
        taskId: testTask.id,
        vendorId: "vendor-123",
      });

      const result = await startTaskProcessing.execute({
        taskId: testTask.id,
        vendorId: "vendor-123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot start processing: task is not in pending status");
    });
  });
});
