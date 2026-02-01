import { describe, expect, it, beforeEach } from "bun:test";
import { GetVendorTasks } from "../../src/application/usecases/GetVendorTasks";
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

describe("GetVendorTasks", () => {
  let taskRepository: InMemoryTaskRepository;
  let getVendorTasks: GetVendorTasks;

  beforeEach(() => {
    taskRepository = new InMemoryTaskRepository();
    getVendorTasks = new GetVendorTasks(taskRepository);
  });

  describe("execute", () => {
    it("vendorの未処理タスクを取得できる", async () => {
      const task1 = Task.create({
        paymentId: "payment-1",
        productId: "product-1",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: JSON.stringify({ input: "test1" }),
      });
      const task2 = Task.create({
        paymentId: "payment-2",
        productId: "product-1",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: JSON.stringify({ input: "test2" }),
      });

      await taskRepository.save(task1);
      await taskRepository.save(task2);

      const result = await getVendorTasks.execute({ vendorId: "vendor-123" });

      expect(result.tasks.length).toBe(2);
      expect(result.tasks[0].status).toBe(TaskStatus.PENDING);
    });

    it("処理中のタスクは含まれない", async () => {
      const pendingTask = Task.create({
        paymentId: "payment-1",
        productId: "product-1",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });

      const processingTask = Task.reconstruct({
        id: "task-processing",
        paymentId: "payment-2",
        productId: "product-1",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
        status: TaskStatus.PROCESSING,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await taskRepository.save(pendingTask);
      await taskRepository.save(processingTask);

      const result = await getVendorTasks.execute({ vendorId: "vendor-123" });

      expect(result.tasks.length).toBe(1);
      expect(result.tasks[0].status).toBe(TaskStatus.PENDING);
    });

    it("他のvendorのタスクは含まれない", async () => {
      const task1 = Task.create({
        paymentId: "payment-1",
        productId: "product-1",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });
      const task2 = Task.create({
        paymentId: "payment-2",
        productId: "product-2",
        vendorId: "vendor-other",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });

      await taskRepository.save(task1);
      await taskRepository.save(task2);

      const result = await getVendorTasks.execute({ vendorId: "vendor-123" });

      expect(result.tasks.length).toBe(1);
      expect(result.tasks[0].vendorId).toBe("vendor-123");
    });
  });
});
