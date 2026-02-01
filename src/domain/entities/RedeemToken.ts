import { ObjectId } from "bson";
import { randomBytes } from "crypto";

export enum RedeemTokenStatus {
  PENDING = "pending",
  REDEEMED = "redeemed",
  EXPIRED = "expired",
}

export interface RedeemTokenProps {
  id: string;
  token: string;
  vendorId: string;
  name: string;
  walletAddress: string;
  paymentId: string;
  status: RedeemTokenStatus;
  createdAt: Date;
  expiresAt: Date;
}

export interface CreateRedeemTokenInput {
  vendorId: string;
  name: string;
  walletAddress: string;
  paymentId: string;
  expiresAt: Date;
}

export interface ReconstructRedeemTokenInput {
  id: string;
  token: string;
  vendorId: string;
  name: string;
  walletAddress: string;
  paymentId: string;
  status: RedeemTokenStatus;
  createdAt: Date;
  expiresAt: Date;
}

export class RedeemToken {
  private constructor(private readonly props: RedeemTokenProps) {}

  get id(): string {
    return this.props.id;
  }

  get token(): string {
    return this.props.token;
  }

  get vendorId(): string {
    return this.props.vendorId;
  }

  get name(): string {
    return this.props.name;
  }

  get walletAddress(): string {
    return this.props.walletAddress;
  }

  get paymentId(): string {
    return this.props.paymentId;
  }

  get status(): RedeemTokenStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  static create(input: CreateRedeemTokenInput): RedeemToken {
    RedeemToken.validateName(input.name);

    return new RedeemToken({
      id: new ObjectId().toHexString(),
      token: RedeemToken.generateToken(),
      vendorId: input.vendorId,
      name: input.name,
      walletAddress: input.walletAddress,
      paymentId: input.paymentId,
      status: RedeemTokenStatus.PENDING,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
    });
  }

  static reconstruct(input: ReconstructRedeemTokenInput): RedeemToken {
    return new RedeemToken({
      id: input.id,
      token: input.token,
      vendorId: input.vendorId,
      name: input.name,
      walletAddress: input.walletAddress,
      paymentId: input.paymentId,
      status: input.status,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    });
  }

  private static validateName(name: string): void {
    if (!name || name.trim() === "") {
      throw new Error("name cannot be empty");
    }
  }

  private static generateToken(): string {
    return randomBytes(32).toString("hex");
  }

  isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  canRedeem(): boolean {
    return this.props.status === RedeemTokenStatus.PENDING && !this.isExpired();
  }

  markAsRedeemed(): RedeemToken {
    return new RedeemToken({
      ...this.props,
      status: RedeemTokenStatus.REDEEMED,
    });
  }

  toJSON(): RedeemTokenProps {
    return { ...this.props };
  }
}
