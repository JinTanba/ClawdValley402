import { ObjectId } from "bson";

export enum PaymentStatus {
  PENDING_ESCROW = "pending_escrow",
  SETTLED = "settled",
  REFUNDED = "refunded",
  FAILED = "failed",
}

export interface PaymentProps {
  id: string;
  productId: string;
  vendorId: string;
  amount: string;
  network: string;
  payer: string;
  transaction: string;
  status: PaymentStatus;
  createdAt: Date;
  releaseTransaction?: string;
  refundTransaction?: string;
  releasedAt?: Date;
  refundedAt?: Date;
  expiresAt?: Date;
}

export interface CreatePaymentInput {
  productId: string;
  vendorId: string;
  amount: string;
  network: string;
  payer: string;
  transaction: string;
}

export interface CreateWithEscrowInput {
  productId: string;
  vendorId: string;
  amount: string;
  network: string;
  payer: string;
  transaction: string;
  expiresAt: Date;
}

export interface ReconstructPaymentInput {
  id: string;
  productId: string;
  vendorId: string;
  amount: string;
  network: string;
  payer: string;
  transaction: string;
  status: PaymentStatus;
  createdAt: Date;
  releaseTransaction?: string;
  refundTransaction?: string;
  releasedAt?: Date;
  refundedAt?: Date;
  expiresAt?: Date;
}

export class Payment {
  private constructor(private readonly props: PaymentProps) {}

  get id(): string {
    return this.props.id;
  }

  get productId(): string {
    return this.props.productId;
  }

  get vendorId(): string {
    return this.props.vendorId;
  }

  get amount(): string {
    return this.props.amount;
  }

  get network(): string {
    return this.props.network;
  }

  get payer(): string {
    return this.props.payer;
  }

  get transaction(): string {
    return this.props.transaction;
  }

  get status(): PaymentStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get releaseTransaction(): string | undefined {
    return this.props.releaseTransaction;
  }

  get refundTransaction(): string | undefined {
    return this.props.refundTransaction;
  }

  get releasedAt(): Date | undefined {
    return this.props.releasedAt;
  }

  get refundedAt(): Date | undefined {
    return this.props.refundedAt;
  }

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  static create(input: CreatePaymentInput): Payment {
    return new Payment({
      id: new ObjectId().toHexString(),
      productId: input.productId,
      vendorId: input.vendorId,
      amount: input.amount,
      network: input.network,
      payer: input.payer,
      transaction: input.transaction,
      status: PaymentStatus.SETTLED,
      createdAt: new Date(),
    });
  }

  static createWithEscrow(input: CreateWithEscrowInput): Payment {
    return new Payment({
      id: new ObjectId().toHexString(),
      productId: input.productId,
      vendorId: input.vendorId,
      amount: input.amount,
      network: input.network,
      payer: input.payer,
      transaction: input.transaction,
      status: PaymentStatus.PENDING_ESCROW,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
    });
  }

  static reconstruct(input: ReconstructPaymentInput): Payment {
    return new Payment({
      id: input.id,
      productId: input.productId,
      vendorId: input.vendorId,
      amount: input.amount,
      network: input.network,
      payer: input.payer,
      transaction: input.transaction,
      status: input.status,
      createdAt: input.createdAt,
      releaseTransaction: input.releaseTransaction,
      refundTransaction: input.refundTransaction,
      releasedAt: input.releasedAt,
      refundedAt: input.refundedAt,
      expiresAt: input.expiresAt,
    });
  }

  markAsFailed(): Payment {
    return new Payment({
      ...this.props,
      status: PaymentStatus.FAILED,
    });
  }

  release(transaction: string): Payment {
    if (this.props.status !== PaymentStatus.PENDING_ESCROW) {
      throw new Error("Cannot release: payment is not in pending_escrow status");
    }
    return new Payment({
      ...this.props,
      status: PaymentStatus.SETTLED,
      releaseTransaction: transaction,
      releasedAt: new Date(),
    });
  }

  refund(transaction: string): Payment {
    if (this.props.status !== PaymentStatus.PENDING_ESCROW) {
      throw new Error("Cannot refund: payment is not in pending_escrow status");
    }
    return new Payment({
      ...this.props,
      status: PaymentStatus.REFUNDED,
      refundTransaction: transaction,
      refundedAt: new Date(),
    });
  }

  isExpired(): boolean {
    if (!this.props.expiresAt) {
      return false;
    }
    return new Date() > this.props.expiresAt;
  }

  toJSON(): PaymentProps {
    return { ...this.props };
  }
}
