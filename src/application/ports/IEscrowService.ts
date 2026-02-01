import type { Payment } from "../../domain/entities/Payment";

export interface EscrowResult {
  success: boolean;
  transaction?: string;
  errorReason?: string;
}

export interface IEscrowService {
  getEscrowAddress(): string;
  releaseToVendor(payment: Payment, vendorAddress: string): Promise<EscrowResult>;
  refundToBuyer(payment: Payment): Promise<EscrowResult>;
}
