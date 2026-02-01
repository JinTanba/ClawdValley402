import { describe, expect, it, beforeEach, mock } from "bun:test";
import { X402PaymentGateway } from "../../../src/infrastructure/x402/X402PaymentGateway";
import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
} from "@x402/core/types";

class MockFacilitatorClient implements FacilitatorClient {
  verifyResult: VerifyResponse = { isValid: true, payer: "0x1234" };
  settleResult: SettleResponse = {
    success: true,
    transaction: "0xabc123",
    network: "eip155:84532",
    payer: "0x1234",
  };

  async verify(
    _paymentPayload: PaymentPayload,
    _paymentRequirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    return this.verifyResult;
  }

  async settle(
    _paymentPayload: PaymentPayload,
    _paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    return this.settleResult;
  }

  async getSupported(): Promise<SupportedResponse> {
    return {
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: "eip155:84532",
        },
      ],
      extensions: [],
      signers: {},
    };
  }
}

describe("X402PaymentGateway", () => {
  let gateway: X402PaymentGateway;
  let mockFacilitator: MockFacilitatorClient;

  beforeEach(async () => {
    mockFacilitator = new MockFacilitatorClient();
    gateway = new X402PaymentGateway(mockFacilitator);
    await gateway.initialize();
  });

  describe("initialize", () => {
    it("初期化後にbuildPaymentRequirementsが使用可能", async () => {
      const requirements = await gateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: "0x1234567890123456789012345678901234567890",
        price: "$0.001",
        network: "eip155:84532",
      });

      expect(requirements).toBeDefined();
      expect(requirements.length).toBeGreaterThan(0);
      expect(requirements[0].scheme).toBe("exact");
    });
  });

  describe("buildPaymentRequirements", () => {
    it("ResourceConfigから支払い要件を構築する", async () => {
      const config = {
        scheme: "exact",
        payTo: "0x1234567890123456789012345678901234567890",
        price: "$0.001",
        network: "eip155:84532" as const,
      };

      const requirements = await gateway.buildPaymentRequirements(config);

      expect(requirements[0].scheme).toBe("exact");
      expect(requirements[0].network).toBe("eip155:84532");
      expect(requirements[0].payTo).toBe("0x1234567890123456789012345678901234567890");
    });
  });

  describe("createPaymentRequiredResponse", () => {
    it("402レスポンス用のPaymentRequiredを作成する", async () => {
      const requirements = await gateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: "0x1234567890123456789012345678901234567890",
        price: "$0.001",
        network: "eip155:84532",
      });

      const resourceInfo = {
        url: "http://localhost:3000/vendor1/weather",
        description: "Weather API",
        mimeType: "application/json",
      };

      const paymentRequired = gateway.createPaymentRequiredResponse(
        requirements,
        resourceInfo
      );

      expect(paymentRequired.x402Version).toBe(2);
      expect(paymentRequired.accepts).toEqual(requirements);
      expect(paymentRequired.resource.url).toBe(resourceInfo.url);
      expect(paymentRequired.resource.description).toBe(resourceInfo.description);
    });
  });

  describe("verifyPayment", () => {
    it("ファシリテータで支払いを検証する", async () => {
      const requirements = await gateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: "0x1234567890123456789012345678901234567890",
        price: "$0.001",
        network: "eip155:84532",
      });

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/weather",
          description: "Weather API",
          mimeType: "application/json",
        },
        accepted: requirements[0],
        payload: { signature: "0xabc" },
      };

      const result = await gateway.verifyPayment(payload, requirements[0]);

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe("0x1234");
    });

    it("検証失敗時にisValid=falseを返す", async () => {
      mockFacilitator.verifyResult = {
        isValid: false,
        invalidReason: "Invalid signature",
      };

      const requirements = await gateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: "0x1234567890123456789012345678901234567890",
        price: "$0.001",
        network: "eip155:84532",
      });

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/weather",
          description: "Weather API",
          mimeType: "application/json",
        },
        accepted: requirements[0],
        payload: { signature: "invalid" },
      };

      const result = await gateway.verifyPayment(payload, requirements[0]);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("Invalid signature");
    });
  });

  describe("settlePayment", () => {
    it("オンチェーンで支払いを決済する", async () => {
      const requirements = await gateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: "0x1234567890123456789012345678901234567890",
        price: "$0.001",
        network: "eip155:84532",
      });

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/weather",
          description: "Weather API",
          mimeType: "application/json",
        },
        accepted: requirements[0],
        payload: { signature: "0xabc" },
      };

      const result = await gateway.settlePayment(payload, requirements[0]);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xabc123");
      expect(result.network).toBe("eip155:84532");
    });

    it("決済失敗時にsuccess=falseを返す", async () => {
      mockFacilitator.settleResult = {
        success: false,
        errorReason: "Insufficient funds",
        transaction: "",
        network: "eip155:84532",
      };

      const requirements = await gateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: "0x1234567890123456789012345678901234567890",
        price: "$0.001",
        network: "eip155:84532",
      });

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/weather",
          description: "Weather API",
          mimeType: "application/json",
        },
        accepted: requirements[0],
        payload: { signature: "0xabc" },
      };

      const result = await gateway.settlePayment(payload, requirements[0]);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("Insufficient funds");
    });
  });

  describe("parsePaymentHeader", () => {
    it("Base64エンコードされたヘッダーをパースする", async () => {
      const requirements = await gateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: "0x1234567890123456789012345678901234567890",
        price: "$0.001",
        network: "eip155:84532",
      });

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/weather",
          description: "Weather API",
          mimeType: "application/json",
        },
        accepted: requirements[0],
        payload: { signature: "0xabc" },
      };

      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      const parsed = gateway.parsePaymentHeader(encoded);

      expect(parsed.x402Version).toBe(2);
      expect(parsed.payload.signature).toBe("0xabc");
    });
  });

  describe("encodePaymentRequired", () => {
    it("PaymentRequiredをBase64エンコードする", async () => {
      const requirements = await gateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: "0x1234567890123456789012345678901234567890",
        price: "$0.001",
        network: "eip155:84532",
      });

      const paymentRequired = gateway.createPaymentRequiredResponse(requirements, {
        url: "http://localhost:3000/vendor1/weather",
        description: "Weather API",
        mimeType: "application/json",
      });

      const encoded = gateway.encodePaymentRequired(paymentRequired);
      const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));

      expect(decoded.x402Version).toBe(2);
      expect(decoded.accepts).toBeDefined();
    });
  });

  describe("encodeSettleResponse", () => {
    it("SettleResponseをBase64エンコードする", () => {
      const settleResponse: SettleResponse = {
        success: true,
        transaction: "0xabc123",
        network: "eip155:84532",
        payer: "0x1234",
      };

      const encoded = gateway.encodeSettleResponse(settleResponse);
      const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));

      expect(decoded.success).toBe(true);
      expect(decoded.transaction).toBe("0xabc123");
    });
  });

  describe("findMatchingRequirements", () => {
    it("支払いペイロードに一致する要件を見つける", async () => {
      const requirements = await gateway.buildPaymentRequirements({
        scheme: "exact",
        payTo: "0x1234567890123456789012345678901234567890",
        price: "$0.001",
        network: "eip155:84532",
      });

      const payload: PaymentPayload = {
        x402Version: 2,
        resource: {
          url: "http://localhost:3000/vendor1/weather",
          description: "Weather API",
          mimeType: "application/json",
        },
        accepted: requirements[0],
        payload: { signature: "0xabc" },
      };

      const matched = gateway.findMatchingRequirements(requirements, payload);

      expect(matched).toBeDefined();
      expect(matched?.scheme).toBe("exact");
    });
  });
});
