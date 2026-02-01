import type { IProductRepository } from "../../domain/repositories/IProductRepository";
import type { IVendorRepository } from "../../domain/repositories/IVendorRepository";
import type { IPaymentRepository } from "../../domain/repositories/IPaymentRepository";
import type { ITaskRepository } from "../../domain/repositories/ITaskRepository";
import type { IPaymentGateway } from "../ports/IPaymentGateway";
import type { IEscrowService } from "../ports/IEscrowService";
import type { CreateRedeemToken } from "./CreateRedeemToken";
import type { Product } from "../../domain/entities/Product";
import { Payment } from "../../domain/entities/Payment";
import { Task } from "../../domain/entities/Task";
import type { PaymentRequired, SettleResponse, Network } from "@x402/core/types";

const ESCROW_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

export type ProcessX402Result =
  | { type: "payment_required"; paymentRequired: PaymentRequired }
  | { type: "success"; settleResponse: SettleResponse; product: Product }
  | { type: "task_created"; taskId: string; settleResponse: SettleResponse }
  | { type: "redeem_token"; redeemUrl: string; settleResponse: SettleResponse }
  | { type: "verification_failed"; reason: string }
  | { type: "settlement_failed"; reason: string }
  | { type: "not_found"; reason: string };

export interface ProcessX402Input {
  vendorId: string;
  path: string;
  resourceUrl: string;
  paymentHeader?: string;
  requestPayload?: string;
}

interface APIKeyProductData {
  type: "api-key";
}

interface APIKeyRequestPayload {
  vendorId: string;
  name?: string;
  walletAddress: string;
}

export class ProcessX402Request {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly vendorRepository: IVendorRepository,
    private readonly paymentGateway: IPaymentGateway,
    private readonly paymentRepository?: IPaymentRepository,
    private readonly taskRepository?: ITaskRepository,
    private readonly createRedeemToken?: CreateRedeemToken,
    private readonly escrowService?: IEscrowService
  ) {}

  async execute(input: ProcessX402Input): Promise<ProcessX402Result> {
    const vendor = await this.vendorRepository.findById(input.vendorId);
    if (!vendor) {
      return { type: "not_found", reason: "Vendor not found" };
    }

    const product = await this.productRepository.findByVendorIdAndPath(
      input.vendorId,
      input.path
    );
    if (!product) {
      return { type: "not_found", reason: "Product not found" };
    }

    const resourceInfo = {
      url: input.resourceUrl,
      description: product.description,
      mimeType: product.mimeType,
    };

    const payTo = this.escrowService
      ? this.escrowService.getEscrowAddress()
      : vendor.evmAddress;

    const resourceConfig = {
      scheme: "exact",
      network: product.network as Network,
      price: product.price,
      payTo,
      maxTimeoutSeconds: 60,
    };

    const requirements = await this.paymentGateway.buildPaymentRequirements(resourceConfig);

    if (!input.paymentHeader) {
      const paymentRequired = this.paymentGateway.createPaymentRequiredResponse(
        requirements,
        resourceInfo
      );
      return { type: "payment_required", paymentRequired };
    }

    const paymentPayload = this.paymentGateway.parsePaymentHeader(input.paymentHeader);

    const matchingRequirements = this.paymentGateway.findMatchingRequirements(
      requirements,
      paymentPayload
    );

    if (!matchingRequirements) {
      const paymentRequired = this.paymentGateway.createPaymentRequiredResponse(
        requirements,
        resourceInfo
      );
      return { type: "payment_required", paymentRequired };
    }

    const verifyResult = await this.paymentGateway.verifyPayment(
      paymentPayload,
      matchingRequirements
    );

    if (!verifyResult.isValid) {
      return {
        type: "verification_failed",
        reason: verifyResult.invalidReason ?? "Unknown verification error",
      };
    }

    const settleResult = await this.paymentGateway.settlePayment(
      paymentPayload,
      matchingRequirements
    );

    if (!settleResult.success) {
      return {
        type: "settlement_failed",
        reason: settleResult.errorReason ?? "Unknown settlement error",
      };
    }

    if (this.isAPIKeyProduct(product)) {
      return this.handleAPIKeyProduct(
        product,
        settleResult,
        verifyResult.payer ?? "",
        input.requestPayload ?? ""
      );
    }

    if (product.isAsync()) {
      return this.handleAsyncProduct(
        product,
        settleResult,
        verifyResult.payer ?? "",
        input.requestPayload ?? ""
      );
    }

    return {
      type: "success",
      settleResponse: settleResult,
      product,
    };
  }

  private isAPIKeyProduct(product: Product): boolean {
    try {
      const data = JSON.parse(product.data) as APIKeyProductData;
      return data.type === "api-key";
    } catch {
      return false;
    }
  }

  private async handleAPIKeyProduct(
    product: Product,
    settleResult: SettleResponse,
    payer: string,
    requestPayload: string
  ): Promise<ProcessX402Result> {
    if (!this.paymentRepository || !this.createRedeemToken) {
      throw new Error("Payment repository and CreateRedeemToken are required for API key products");
    }

    const payment = Payment.create({
      productId: product.id,
      vendorId: product.vendorId,
      amount: product.price,
      network: settleResult.network,
      payer,
      transaction: settleResult.transaction ?? "",
    });

    await this.paymentRepository.save(payment);

    let parsedPayload: APIKeyRequestPayload;
    try {
      parsedPayload = JSON.parse(requestPayload) as APIKeyRequestPayload;
    } catch {
      parsedPayload = { vendorId: product.vendorId, walletAddress: payer };
    }

    const result = await this.createRedeemToken.execute({
      vendorId: parsedPayload.vendorId,
      name: parsedPayload.name ?? "API Key",
      walletAddress: parsedPayload.walletAddress,
      paymentId: payment.id,
    });

    return {
      type: "redeem_token",
      redeemUrl: result.redeemUrl,
      settleResponse: settleResult,
    };
  }

  private async handleAsyncProduct(
    product: Product,
    settleResult: SettleResponse,
    payer: string,
    requestPayload: string
  ): Promise<ProcessX402Result> {
    if (!this.paymentRepository || !this.taskRepository) {
      throw new Error("Payment and Task repositories are required for ASYNC products");
    }

    const payment = this.escrowService
      ? Payment.createWithEscrow({
          productId: product.id,
          vendorId: product.vendorId,
          amount: product.price,
          network: settleResult.network,
          payer,
          transaction: settleResult.transaction ?? "",
          expiresAt: new Date(Date.now() + ESCROW_TIMEOUT_MS),
        })
      : Payment.create({
          productId: product.id,
          vendorId: product.vendorId,
          amount: product.price,
          network: settleResult.network,
          payer,
          transaction: settleResult.transaction ?? "",
        });

    await this.paymentRepository.save(payment);

    const task = Task.create({
      paymentId: payment.id,
      productId: product.id,
      vendorId: product.vendorId,
      buyerAddress: payer,
      requestPayload,
    });

    await this.taskRepository.save(task);

    return {
      type: "task_created",
      taskId: task.id,
      settleResponse: settleResult,
    };
  }
}
