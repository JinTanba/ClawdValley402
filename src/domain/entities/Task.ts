import { ObjectId } from "bson";

export enum TaskStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface TaskProps {
  id: string;
  paymentId: string;
  productId: string;
  vendorId: string;
  buyerAddress: string;
  requestPayload: string;
  status: TaskStatus;
  result: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  paymentId: string;
  productId: string;
  vendorId: string;
  buyerAddress: string;
  requestPayload: string;
}

export interface ReconstructTaskInput {
  id: string;
  paymentId: string;
  productId: string;
  vendorId: string;
  buyerAddress: string;
  requestPayload: string;
  status: TaskStatus;
  result: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Task {
  private constructor(private readonly props: TaskProps) {}

  get id(): string {
    return this.props.id;
  }

  get paymentId(): string {
    return this.props.paymentId;
  }

  get productId(): string {
    return this.props.productId;
  }

  get vendorId(): string {
    return this.props.vendorId;
  }

  get buyerAddress(): string {
    return this.props.buyerAddress;
  }

  get requestPayload(): string {
    return this.props.requestPayload;
  }

  get status(): TaskStatus {
    return this.props.status;
  }

  get result(): string | null {
    return this.props.result;
  }

  get errorMessage(): string | null {
    return this.props.errorMessage;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(input: CreateTaskInput): Task {
    const now = new Date();
    return new Task({
      id: new ObjectId().toHexString(),
      paymentId: input.paymentId,
      productId: input.productId,
      vendorId: input.vendorId,
      buyerAddress: input.buyerAddress,
      requestPayload: input.requestPayload,
      status: TaskStatus.PENDING,
      result: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstruct(input: ReconstructTaskInput): Task {
    return new Task({
      id: input.id,
      paymentId: input.paymentId,
      productId: input.productId,
      vendorId: input.vendorId,
      buyerAddress: input.buyerAddress,
      requestPayload: input.requestPayload,
      status: input.status,
      result: input.result,
      errorMessage: input.errorMessage,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
  }

  startProcessing(): Task {
    if (this.props.status !== TaskStatus.PENDING) {
      throw new Error("Cannot start processing: task is not in pending status");
    }
    return new Task({
      ...this.props,
      status: TaskStatus.PROCESSING,
      updatedAt: new Date(),
    });
  }

  complete(result: string): Task {
    if (this.props.status !== TaskStatus.PROCESSING) {
      throw new Error("Cannot complete: task is not in processing status");
    }
    return new Task({
      ...this.props,
      status: TaskStatus.COMPLETED,
      result,
      updatedAt: new Date(),
    });
  }

  fail(errorMessage: string): Task {
    if (this.props.status !== TaskStatus.PROCESSING) {
      throw new Error("Cannot fail: task is not in processing status");
    }
    return new Task({
      ...this.props,
      status: TaskStatus.FAILED,
      errorMessage,
      updatedAt: new Date(),
    });
  }

  toJSON(): TaskProps {
    return { ...this.props };
  }
}
