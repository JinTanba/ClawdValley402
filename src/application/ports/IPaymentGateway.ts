import type {
  PaymentPayload,
  PaymentRequirements,
  PaymentRequired,
  VerifyResponse,
  SettleResponse,
} from "@x402/core/types";
import type { ResourceConfig, ResourceInfo } from "@x402/core/server";

export interface IPaymentGateway {
  initialize(): Promise<void>;

  buildPaymentRequirements(config: ResourceConfig): Promise<PaymentRequirements[]>;

  createPaymentRequiredResponse(
    requirements: PaymentRequirements[],
    resourceInfo: ResourceInfo
  ): PaymentRequired;

  verifyPayment(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse>;

  settlePayment(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse>;

  findMatchingRequirements(
    availableRequirements: PaymentRequirements[],
    paymentPayload: PaymentPayload
  ): PaymentRequirements | undefined;

  parsePaymentHeader(header: string): PaymentPayload;

  encodePaymentRequired(paymentRequired: PaymentRequired): string;

  encodeSettleResponse(settleResponse: SettleResponse): string;
}
