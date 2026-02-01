import { describe, expect, it } from "bun:test";
import { Payment, PaymentStatus } from "../../src/domain/entities/Payment";

describe("Payment", () => {
  describe("create", () => {
    it("Paymentを作成できる", () => {
      const payment = Payment.create({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
      });

      expect(payment.productId).toBe("product-123");
      expect(payment.vendorId).toBe("vendor-123");
      expect(payment.amount).toBe("$0.10");
      expect(payment.network).toBe("eip155:84532");
      expect(payment.payer).toBe("0x1234567890123456789012345678901234567890");
      expect(payment.transaction).toBe("0xabcdef1234567890");
      expect(payment.status).toBe(PaymentStatus.SETTLED);
      expect(payment.id).toBeTruthy();
      expect(payment.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("createWithEscrow", () => {
    it("PENDING_ESCROW状態でPaymentを作成できる", () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const payment = Payment.createWithEscrow({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
        expiresAt,
      });

      expect(payment.productId).toBe("product-123");
      expect(payment.vendorId).toBe("vendor-123");
      expect(payment.status).toBe(PaymentStatus.PENDING_ESCROW);
      expect(payment.expiresAt).toEqual(expiresAt);
      expect(payment.releaseTransaction).toBeUndefined();
      expect(payment.refundTransaction).toBeUndefined();
    });
  });

  describe("release", () => {
    it("PENDING_ESCROWからSETTLEDに遷移できる", () => {
      const payment = Payment.createWithEscrow({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const releasedPayment = payment.release("0xreleasetx123");

      expect(releasedPayment.status).toBe(PaymentStatus.SETTLED);
      expect(releasedPayment.releaseTransaction).toBe("0xreleasetx123");
      expect(releasedPayment.releasedAt).toBeInstanceOf(Date);
    });

    it("PENDING_ESCROW以外からはリリースできない", () => {
      const payment = Payment.create({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
      });

      expect(() => payment.release("0xreleasetx123")).toThrow(
        "Cannot release: payment is not in pending_escrow status"
      );
    });
  });

  describe("refund", () => {
    it("PENDING_ESCROWからREFUNDEDに遷移できる", () => {
      const payment = Payment.createWithEscrow({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const refundedPayment = payment.refund("0xrefundtx123");

      expect(refundedPayment.status).toBe(PaymentStatus.REFUNDED);
      expect(refundedPayment.refundTransaction).toBe("0xrefundtx123");
      expect(refundedPayment.refundedAt).toBeInstanceOf(Date);
    });

    it("PENDING_ESCROW以外からは返金できない", () => {
      const payment = Payment.create({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
      });

      expect(() => payment.refund("0xrefundtx123")).toThrow(
        "Cannot refund: payment is not in pending_escrow status"
      );
    });
  });

  describe("isExpired", () => {
    it("期限切れの場合trueを返す", () => {
      const payment = Payment.createWithEscrow({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
        expiresAt: new Date(Date.now() - 1000),
      });

      expect(payment.isExpired()).toBe(true);
    });

    it("期限内の場合falseを返す", () => {
      const payment = Payment.createWithEscrow({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
        expiresAt: new Date(Date.now() + 1000000),
      });

      expect(payment.isExpired()).toBe(false);
    });

    it("expiresAtがない場合falseを返す", () => {
      const payment = Payment.create({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
      });

      expect(payment.isExpired()).toBe(false);
    });
  });

  describe("reconstruct", () => {
    it("既存データからPaymentを復元できる", () => {
      const payment = Payment.reconstruct({
        id: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
        status: PaymentStatus.SETTLED,
        createdAt: new Date("2024-01-01"),
      });

      expect(payment.id).toBe("payment-123");
      expect(payment.productId).toBe("product-123");
      expect(payment.status).toBe(PaymentStatus.SETTLED);
    });
  });

  describe("markAsFailed", () => {
    it("Paymentをfailed状態に変更できる", () => {
      const payment = Payment.create({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
      });

      const failedPayment = payment.markAsFailed();
      expect(failedPayment.status).toBe(PaymentStatus.FAILED);
    });
  });

  describe("toJSON", () => {
    it("JSONに変換できる", () => {
      const payment = Payment.create({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
      });

      const json = payment.toJSON();
      expect(json.productId).toBe("product-123");
      expect(json.vendorId).toBe("vendor-123");
    });
  });
});
