import type { Payment, PaymentStatus } from "../entities/Payment";

export interface IPaymentRepository {
  save(payment: Payment): Promise<void>;
  findById(id: string): Promise<Payment | null>;
  findByVendorId(vendorId: string): Promise<Payment[]>;
  findByStatus(status: PaymentStatus): Promise<Payment[]>;
  findExpiredPendingEscrow(): Promise<Payment[]>;
}
