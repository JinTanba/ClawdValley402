import type { PrismaClient, Task as PrismaTask } from "@prisma/client";
import { Task, TaskStatus } from "../../../domain/entities/Task";
import type { ITaskRepository } from "../../../domain/repositories/ITaskRepository";

export class PrismaTaskRepository implements ITaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(task: Task): Promise<void> {
    const data = task.toJSON();

    await this.prisma.task.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        paymentId: data.paymentId,
        productId: data.productId,
        vendorId: data.vendorId,
        buyerAddress: data.buyerAddress,
        requestPayload: data.requestPayload,
        status: data.status,
        result: data.result,
        errorMessage: data.errorMessage,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
      update: {
        status: data.status,
        result: data.result,
        errorMessage: data.errorMessage,
        updatedAt: data.updatedAt,
      },
    });
  }

  async findById(id: string): Promise<Task | null> {
    const record = await this.prisma.task.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByVendorId(vendorId: string): Promise<Task[]> {
    const records = await this.prisma.task.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((record: PrismaTask) => this.toDomain(record));
  }

  async findByVendorIdAndStatus(vendorId: string, status: TaskStatus): Promise<Task[]> {
    const records = await this.prisma.task.findMany({
      where: { vendorId, status },
      orderBy: { createdAt: "asc" },
    });

    return records.map((record: PrismaTask) => this.toDomain(record));
  }

  async findPendingByVendorId(vendorId: string): Promise<Task[]> {
    return this.findByVendorIdAndStatus(vendorId, TaskStatus.PENDING);
  }

  private toDomain(record: PrismaTask): Task {
    return Task.reconstruct({
      id: record.id,
      paymentId: record.paymentId,
      productId: record.productId,
      vendorId: record.vendorId,
      buyerAddress: record.buyerAddress,
      requestPayload: record.requestPayload,
      status: record.status as TaskStatus,
      result: record.result,
      errorMessage: record.errorMessage,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
