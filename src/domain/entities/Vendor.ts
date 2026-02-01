import { ObjectId } from "bson";

export enum VendorStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

export interface VendorProps {
  id: string;
  name: string;
  evmAddress: string;
  apiKey: string | null;
  status: VendorStatus;
  createdAt: Date;
}

export interface CreateVendorInput {
  name: string;
  evmAddress: string;
}

export interface ReconstructVendorInput {
  id: string;
  name: string;
  evmAddress: string;
  apiKey: string | null;
  status: VendorStatus;
  createdAt: Date;
}

export class Vendor {
  private constructor(private readonly props: VendorProps) {}

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get evmAddress(): string {
    return this.props.evmAddress;
  }

  get apiKey(): string | null {
    return this.props.apiKey;
  }

  get status(): VendorStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  static create(input: CreateVendorInput): Vendor {
    Vendor.validateEvmAddress(input.evmAddress);

    return new Vendor({
      id: new ObjectId().toHexString(),
      name: input.name,
      evmAddress: input.evmAddress,
      apiKey: null,
      status: VendorStatus.ACTIVE,
      createdAt: new Date(),
    });
  }

  static reconstruct(input: ReconstructVendorInput): Vendor {
    return new Vendor({
      id: input.id,
      name: input.name,
      evmAddress: input.evmAddress,
      apiKey: input.apiKey,
      status: input.status,
      createdAt: input.createdAt,
    });
  }

  private static validateEvmAddress(address: string): void {
    if (!address.startsWith("0x")) {
      throw new Error("evmAddress must start with 0x");
    }

    if (address.length !== 42) {
      throw new Error("evmAddress must be 42 characters");
    }

    const hexPart = address.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(hexPart)) {
      throw new Error("evmAddress must be a valid hex string");
    }
  }

  toJSON(): VendorProps {
    return { ...this.props };
  }
}
