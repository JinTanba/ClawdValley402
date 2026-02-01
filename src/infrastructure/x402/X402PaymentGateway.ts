import type { IPaymentGateway } from "../../application/ports/IPaymentGateway";
import { x402ResourceServer } from "@x402/core/server";
import type { FacilitatorClient, ResourceConfig, ResourceInfo } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  PaymentRequired,
  VerifyResponse,
  SettleResponse,
} from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";

export class X402PaymentGateway implements IPaymentGateway {
  private readonly resourceServer: x402ResourceServer;

  constructor(facilitatorClient: FacilitatorClient) {
    this.resourceServer = new x402ResourceServer(facilitatorClient);
    this.resourceServer.register("eip155:*", new ExactEvmScheme());
  }

  async initialize(): Promise<void> {
    await this.resourceServer.initialize();
  }

  async buildPaymentRequirements(config: ResourceConfig): Promise<PaymentRequirements[]> {
    return this.resourceServer.buildPaymentRequirements(config);
  }

  createPaymentRequiredResponse(
    requirements: PaymentRequirements[],
    resourceInfo: ResourceInfo
  ): PaymentRequired {
    return this.resourceServer.createPaymentRequiredResponse(requirements, resourceInfo);
  }

  async verifyPayment(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    return this.resourceServer.verifyPayment(payload, requirements);
  }

  async settlePayment(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    return this.resourceServer.settlePayment(payload, requirements);
  }

  findMatchingRequirements(
    availableRequirements: PaymentRequirements[],
    paymentPayload: PaymentPayload
  ): PaymentRequirements | undefined {
    return this.resourceServer.findMatchingRequirements(availableRequirements, paymentPayload);
  }

  parsePaymentHeader(header: string): PaymentPayload {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    return JSON.parse(decoded) as PaymentPayload;
  }

  encodePaymentRequired(paymentRequired: PaymentRequired): string {
    return Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
  }

  encodeSettleResponse(settleResponse: SettleResponse): string {
    return Buffer.from(JSON.stringify(settleResponse)).toString("base64");
  }
}
