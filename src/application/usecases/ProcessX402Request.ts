import type { IProductRepository } from "../../domain/repositories/IProductRepository";
import type { IVendorRepository } from "../../domain/repositories/IVendorRepository";
import type { IPaymentGateway } from "../ports/IPaymentGateway";
import type { Product } from "../../domain/entities/Product";
import type { PaymentRequired, SettleResponse, Network } from "@x402/core/types";

export type ProcessX402Result =
  | { type: "payment_required"; paymentRequired: PaymentRequired }
  | { type: "success"; settleResponse: SettleResponse; product: Product }
  | { type: "verification_failed"; reason: string }
  | { type: "settlement_failed"; reason: string }
  | { type: "not_found"; reason: string };

export interface ProcessX402Input {
  vendorId: string;
  path: string;
  resourceUrl: string;
  paymentHeader?: string;
}

export class ProcessX402Request {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly vendorRepository: IVendorRepository,
    private readonly paymentGateway: IPaymentGateway
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

    const resourceConfig = {
      scheme: "exact",
      network: product.network as Network,
      price: product.price,
      payTo: vendor.evmAddress,
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

    return {
      type: "success",
      settleResponse: settleResult,
      product,
    };
  }
}
