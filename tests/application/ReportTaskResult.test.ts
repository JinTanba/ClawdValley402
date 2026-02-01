import { describe, expect, it, beforeEach } from "bun:test";
import { ReportTaskResult } from "../../src/application/usecases/ReportTaskResult";
import type { ITaskRepository } from "../../src/domain/repositories/ITaskRepository";
import type { IPaymentRepository } from "../../src/domain/repositories/IPaymentRepository";
import type { IVendorRepository } from "../../src/domain/repositories/IVendorRepository";
import type { IEscrowService, EscrowResult } from "../../src/application/ports/IEscrowService";
import { Task, TaskStatus } from "../../src/domain/entities/Task";
import { Payment, PaymentStatus } from "../../src/domain/entities/Payment";
import { Vendor } from "../../src/domain/entities/Vendor";

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

class InMemoryPaymentRepository implements IPaymentRepository {
  private payments: Map<string, Payment> = new Map();

  async save(payment: Payment): Promise<void> {
    this.payments.set(payment.id, payment);
  }

  async findById(id: string): Promise<Payment | null> {
    return this.payments.get(id) ?? null;
  }

  async findByVendorId(vendorId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter((p) => p.vendorId === vendorId);
  }

  async findByStatus(status: PaymentStatus): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter((p) => p.status === status);
  }

  async findExpiredPendingEscrow(): Promise<Payment[]> {
    const now = new Date();
    return Array.from(this.payments.values()).filter(
      (p) => p.status === PaymentStatus.PENDING_ESCROW && p.expiresAt && p.expiresAt < now
    );
  }
}

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

class MockEscrowService implements IEscrowService {
  releaseResult: EscrowResult = { success: true, transaction: "0xreleasetx123" };
  refundResult: EscrowResult = { success: true, transaction: "0xrefundtx123" };

  getEscrowAddress(): string {
    return "0xEscrowAddress1234567890123456789012345678";
  }

  async releaseToVendor(_payment: Payment, _vendorAddress: string): Promise<EscrowResult> {
    return this.releaseResult;
  }

  async refundToBuyer(_payment: Payment): Promise<EscrowResult> {
    return this.refundResult;
  }
}

describe("ReportTaskResult", () => {
  let taskRepository: InMemoryTaskRepository;
  let paymentRepository: InMemoryPaymentRepository;
  let vendorRepository: InMemoryVendorRepository;
  let escrowService: MockEscrowService;
  let reportTaskResult: ReportTaskResult;
  let processingTask: Task;
  let testVendor: Vendor;
  let pendingEscrowPayment: Payment;

  beforeEach(async () => {
    taskRepository = new InMemoryTaskRepository();
    paymentRepository = new InMemoryPaymentRepository();
    vendorRepository = new InMemoryVendorRepository();
    escrowService = new MockEscrowService();
    reportTaskResult = new ReportTaskResult(
      taskRepository,
      paymentRepository,
      vendorRepository,
      escrowService
    );

    testVendor = Vendor.create({
      name: "Test Vendor",
      evmAddress: "0x1234567890123456789012345678901234567890",
    });
    await vendorRepository.save(testVendor);

    pendingEscrowPayment = Payment.createWithEscrow({
      productId: "product-123",
      vendorId: testVendor.id,
      amount: "$0.10",
      network: "eip155:84532",
      payer: "0x1234567890123456789012345678901234567890",
      transaction: "0xabcdef1234567890",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await paymentRepository.save(pendingEscrowPayment);

    processingTask = Task.reconstruct({
      id: "task-123",
      paymentId: pendingEscrowPayment.id,
      productId: "product-123",
      vendorId: testVendor.id,
      buyerAddress: "0x1234567890123456789012345678901234567890",
      requestPayload: JSON.stringify({ input: "test" }),
      status: TaskStatus.PROCESSING,
      result: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await taskRepository.save(processingTask);
  });

  describe("complete", () => {
    it("タスクを完了状態にできる", async () => {
      const result = await reportTaskResult.complete({
        taskId: processingTask.id,
        vendorId: testVendor.id,
        result: JSON.stringify({ output: "success" }),
      });

      expect(result.success).toBe(true);
      expect(result.task?.status).toBe(TaskStatus.COMPLETED);
      expect(result.task?.result).toBe(JSON.stringify({ output: "success" }));
    });

    it("タスク完了時にエスクローをVendorにリリースする", async () => {
      const result = await reportTaskResult.complete({
        taskId: processingTask.id,
        vendorId: testVendor.id,
        result: JSON.stringify({ output: "success" }),
      });

      expect(result.success).toBe(true);

      const updatedPayment = await paymentRepository.findById(pendingEscrowPayment.id);
      expect(updatedPayment?.status).toBe(PaymentStatus.SETTLED);
      expect(updatedPayment?.releaseTransaction).toBe("0xreleasetx123");
      expect(updatedPayment?.releasedAt).toBeInstanceOf(Date);
    });

    it("存在しないタスクの場合エラー", async () => {
      const result = await reportTaskResult.complete({
        taskId: "non-existent",
        vendorId: testVendor.id,
        result: "{}",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Task not found");
    });

    it("異なるvendorのタスクは完了できない", async () => {
      const result = await reportTaskResult.complete({
        taskId: processingTask.id,
        vendorId: "other-vendor",
        result: "{}",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Task not found");
    });

    it("pending状態のタスクは完了できない", async () => {
      const pendingTask = Task.create({
        paymentId: "payment-456",
        productId: "product-123",
        vendorId: testVendor.id,
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });
      await taskRepository.save(pendingTask);

      const result = await reportTaskResult.complete({
        taskId: pendingTask.id,
        vendorId: testVendor.id,
        result: "{}",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot complete: task is not in processing status");
    });
  });

  describe("fail", () => {
    it("タスクを失敗状態にできる", async () => {
      const result = await reportTaskResult.fail({
        taskId: processingTask.id,
        vendorId: testVendor.id,
        errorMessage: "Processing failed",
      });

      expect(result.success).toBe(true);
      expect(result.task?.status).toBe(TaskStatus.FAILED);
      expect(result.task?.errorMessage).toBe("Processing failed");
    });

    it("タスク失敗時にエスクローを購入者に返金する", async () => {
      const result = await reportTaskResult.fail({
        taskId: processingTask.id,
        vendorId: testVendor.id,
        errorMessage: "Processing failed",
      });

      expect(result.success).toBe(true);

      const updatedPayment = await paymentRepository.findById(pendingEscrowPayment.id);
      expect(updatedPayment?.status).toBe(PaymentStatus.REFUNDED);
      expect(updatedPayment?.refundTransaction).toBe("0xrefundtx123");
      expect(updatedPayment?.refundedAt).toBeInstanceOf(Date);
    });

    it("存在しないタスクの場合エラー", async () => {
      const result = await reportTaskResult.fail({
        taskId: "non-existent",
        vendorId: testVendor.id,
        errorMessage: "error",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Task not found");
    });

    it("pending状態のタスクは失敗にできない", async () => {
      const pendingTask = Task.create({
        paymentId: "payment-456",
        productId: "product-123",
        vendorId: testVendor.id,
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });
      await taskRepository.save(pendingTask);

      const result = await reportTaskResult.fail({
        taskId: pendingTask.id,
        vendorId: testVendor.id,
        errorMessage: "error",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot fail: task is not in processing status");
    });
  });
});
