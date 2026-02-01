import { ObjectId } from "bson";

export enum ProductStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
}

export enum ProductType {
  IMMEDIATE = "immediate",
  ASYNC = "async",
}

export interface ProductProps {
  id: string;
  vendorId: string;
  path: string;
  price: string;
  network: string;
  description: string;
  mimeType: string;
  data: string;
  type: ProductType;
  status: ProductStatus;
  createdAt: Date;
}

export interface CreateProductInput {
  vendorId: string;
  path: string;
  price: string;
  network?: string;
  description: string;
  mimeType?: string;
  data: string;
  type?: ProductType;
}

export interface ReconstructProductInput {
  id: string;
  vendorId: string;
  path: string;
  price: string;
  network: string;
  description: string;
  mimeType: string;
  data: string;
  type: ProductType;
  status: ProductStatus;
  createdAt: Date;
}

export class Product {
  private constructor(private readonly props: ProductProps) {}

  get id(): string {
    return this.props.id;
  }

  get vendorId(): string {
    return this.props.vendorId;
  }

  get path(): string {
    return this.props.path;
  }

  get price(): string {
    return this.props.price;
  }

  get network(): string {
    return this.props.network;
  }

  get description(): string {
    return this.props.description;
  }

  get mimeType(): string {
    return this.props.mimeType;
  }

  get data(): string {
    return this.props.data;
  }

  get type(): ProductType {
    return this.props.type;
  }

  get status(): ProductStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  static create(input: CreateProductInput): Product {
    Product.validatePath(input.path);
    Product.validatePrice(input.price);

    return new Product({
      id: new ObjectId().toHexString(),
      vendorId: input.vendorId,
      path: input.path,
      price: input.price,
      network: input.network ?? "eip155:84532",
      description: input.description,
      mimeType: input.mimeType ?? "application/json",
      data: input.data,
      type: input.type ?? ProductType.IMMEDIATE,
      status: ProductStatus.ACTIVE,
      createdAt: new Date(),
    });
  }

  static reconstruct(input: ReconstructProductInput): Product {
    return new Product({
      id: input.id,
      vendorId: input.vendorId,
      path: input.path,
      price: input.price,
      network: input.network,
      description: input.description,
      mimeType: input.mimeType,
      data: input.data,
      type: input.type,
      status: input.status,
      createdAt: input.createdAt,
    });
  }

  isAsync(): boolean {
    return this.props.type === ProductType.ASYNC;
  }

  private static validatePath(path: string): void {
    if (!path || path.trim() === "") {
      throw new Error("path cannot be empty");
    }
  }

  private static validatePrice(price: string): void {
    if (!price.startsWith("$")) {
      throw new Error("price must start with $");
    }

    const numericPart = price.slice(1);
    if (isNaN(parseFloat(numericPart))) {
      throw new Error("price must contain a valid number");
    }
  }

  toJSON(): ProductProps {
    return { ...this.props };
  }
}
