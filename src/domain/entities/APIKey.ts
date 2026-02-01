import { ObjectId } from "bson";
import { randomUUID } from "crypto";

export enum APIKeyStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
}

export interface APIKeyProps {
  id: string;
  vendorId: string;
  key: string;
  name: string;
  walletAddress: string;
  status: APIKeyStatus;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface CreateAPIKeyInput {
  vendorId: string;
  name: string;
  walletAddress: string;
  expiresAt?: Date;
}

export interface ReconstructAPIKeyInput {
  id: string;
  vendorId: string;
  key: string;
  name: string;
  walletAddress: string;
  status: APIKeyStatus;
  createdAt: Date;
  expiresAt: Date | null;
}

export class APIKey {
  private constructor(private readonly props: APIKeyProps) {}

  get id(): string {
    return this.props.id;
  }

  get vendorId(): string {
    return this.props.vendorId;
  }

  get key(): string {
    return this.props.key;
  }

  get name(): string {
    return this.props.name;
  }

  get walletAddress(): string {
    return this.props.walletAddress;
  }

  get status(): APIKeyStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get expiresAt(): Date | null {
    return this.props.expiresAt;
  }

  static create(input: CreateAPIKeyInput): APIKey {
    APIKey.validateName(input.name);
    APIKey.validateWalletAddress(input.walletAddress);

    return new APIKey({
      id: new ObjectId().toHexString(),
      vendorId: input.vendorId,
      key: APIKey.generateKey(),
      name: input.name,
      walletAddress: input.walletAddress,
      status: APIKeyStatus.ACTIVE,
      createdAt: new Date(),
      expiresAt: input.expiresAt ?? null,
    });
  }

  static reconstruct(input: ReconstructAPIKeyInput): APIKey {
    return new APIKey({
      id: input.id,
      vendorId: input.vendorId,
      key: input.key,
      name: input.name,
      walletAddress: input.walletAddress,
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

  private static validateWalletAddress(address: string): void {
    if (!address.startsWith("0x")) {
      throw new Error("walletAddress must start with 0x");
    }

    if (address.length !== 42) {
      throw new Error("walletAddress must be 42 characters");
    }

    const hexPart = address.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(hexPart)) {
      throw new Error("walletAddress must be a valid hex string");
    }
  }

  private static generateKey(): string {
    return `ak_${randomUUID().replace(/-/g, "")}`;
  }

  isExpired(): boolean {
    if (!this.props.expiresAt) {
      return false;
    }
    return new Date() > this.props.expiresAt;
  }

  isValid(): boolean {
    return this.props.status === APIKeyStatus.ACTIVE && !this.isExpired();
  }

  toJSON(): APIKeyProps {
    return { ...this.props };
  }
}
