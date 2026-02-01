import type { ITaskRepository } from "../../domain/repositories/ITaskRepository";
import type { IPaymentRepository } from "../../domain/repositories/IPaymentRepository";
import type { IVendorRepository } from "../../domain/repositories/IVendorRepository";
import type { IEscrowService } from "../ports/IEscrowService";
import type { Task } from "../../domain/entities/Task";
import { PaymentStatus } from "../../domain/entities/Payment";

export interface CompleteTaskInput {
  taskId: string;
  vendorId: string;
  result: string;
}

export interface FailTaskInput {
  taskId: string;
  vendorId: string;
  errorMessage: string;
}

export interface ReportTaskResultOutput {
  success: boolean;
  task?: Task;
  error?: string;
}

export class ReportTaskResult {
  constructor(
    private readonly taskRepository: ITaskRepository,
    private readonly paymentRepository?: IPaymentRepository,
    private readonly vendorRepository?: IVendorRepository,
    private readonly escrowService?: IEscrowService
  ) {}

  async complete(input: CompleteTaskInput): Promise<ReportTaskResultOutput> {
    const task = await this.taskRepository.findById(input.taskId);

    if (!task || task.vendorId !== input.vendorId) {
      return { success: false, error: "Task not found" };
    }

    try {
      const completedTask = task.complete(input.result);
      await this.taskRepository.save(completedTask);

      await this.releaseEscrow(task.paymentId, task.vendorId);

      return { success: true, task: completedTask };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  private async releaseEscrow(paymentId: string, vendorId: string): Promise<void> {
    if (!this.paymentRepository || !this.vendorRepository || !this.escrowService) {
      return;
    }

    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment || payment.status !== PaymentStatus.PENDING_ESCROW) {
      return;
    }

    const vendor = await this.vendorRepository.findById(vendorId);
    if (!vendor) {
      return;
    }

    const result = await this.escrowService.releaseToVendor(payment, vendor.evmAddress);
    if (result.success && result.transaction) {
      const releasedPayment = payment.release(result.transaction);
      await this.paymentRepository.save(releasedPayment);
    }
  }

  async fail(input: FailTaskInput): Promise<ReportTaskResultOutput> {
    const task = await this.taskRepository.findById(input.taskId);

    if (!task || task.vendorId !== input.vendorId) {
      return { success: false, error: "Task not found" };
    }

    try {
      const failedTask = task.fail(input.errorMessage);
      await this.taskRepository.save(failedTask);

      await this.refundEscrow(task.paymentId);

      return { success: true, task: failedTask };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  private async refundEscrow(paymentId: string): Promise<void> {
    if (!this.paymentRepository || !this.escrowService) {
      return;
    }

    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment || payment.status !== PaymentStatus.PENDING_ESCROW) {
      return;
    }

    const result = await this.escrowService.refundToBuyer(payment);
    if (result.success && result.transaction) {
      const refundedPayment = payment.refund(result.transaction);
      await this.paymentRepository.save(refundedPayment);
    }
  }
}
