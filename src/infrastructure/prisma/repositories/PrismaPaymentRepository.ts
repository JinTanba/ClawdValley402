import type { PrismaClient, Payment as PrismaPayment } from "@prisma/client";
import { Payment, PaymentStatus } from "../../../domain/entities/Payment";
import type { IPaymentRepository } from "../../../domain/repositories/IPaymentRepository";

export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(payment: Payment): Promise<void> {
    const data = payment.toJSON();

    await this.prisma.payment.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        productId: data.productId,
        vendorId: data.vendorId,
        amount: data.amount,
        network: data.network,
        payer: data.payer,
        transaction: data.transaction,
        status: data.status,
        releaseTransaction: data.releaseTransaction,
        refundTransaction: data.refundTransaction,
        releasedAt: data.releasedAt,
        refundedAt: data.refundedAt,
        expiresAt: data.expiresAt,
        createdAt: data.createdAt,
      },
      update: {
        status: data.status,
        releaseTransaction: data.releaseTransaction,
        refundTransaction: data.refundTransaction,
        releasedAt: data.releasedAt,
        refundedAt: data.refundedAt,
      },
    });
  }

  async findById(id: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  async findByVendorId(vendorId: string): Promise<Payment[]> {
    const records = await this.prisma.payment.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
    });

    return records.map((record: PrismaPayment) => this.toDomain(record));
  }

  async findByStatus(status: PaymentStatus): Promise<Payment[]> {
    const records = await this.prisma.payment.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
    });

    return records.map((record: PrismaPayment) => this.toDomain(record));
  }

  async findExpiredPendingEscrow(): Promise<Payment[]> {
    const records = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING_ESCROW,
        expiresAt: { lt: new Date() },
      },
      orderBy: { createdAt: "asc" },
    });

    return records.map((record: PrismaPayment) => this.toDomain(record));
  }

  private toDomain(record: PrismaPayment): Payment {
    return Payment.reconstruct({
      id: record.id,
      productId: record.productId,
      vendorId: record.vendorId,
      amount: record.amount,
      network: record.network,
      payer: record.payer,
      transaction: record.transaction,
      status: record.status as PaymentStatus,
      createdAt: record.createdAt,
      releaseTransaction: record.releaseTransaction ?? undefined,
      refundTransaction: record.refundTransaction ?? undefined,
      releasedAt: record.releasedAt ?? undefined,
      refundedAt: record.refundedAt ?? undefined,
      expiresAt: record.expiresAt ?? undefined,
    });
  }
}
