import { describe, expect, it, beforeEach } from "bun:test";
import { EvmEscrowService } from "../../../src/infrastructure/escrow/EvmEscrowService";
import { Payment, PaymentStatus } from "../../../src/domain/entities/Payment";

describe("EvmEscrowService", () => {
  const TEST_PRIVATE_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const TEST_VENDOR_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  let escrowService: EvmEscrowService;

  beforeEach(() => {
    escrowService = new EvmEscrowService(TEST_PRIVATE_KEY);
  });

  describe("getEscrowAddress", () => {
    it("秘密鍵からエスクローアドレスを導出できる", () => {
      const address = escrowService.getEscrowAddress();
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("同じ秘密鍵からは同じアドレスが導出される", () => {
      const anotherService = new EvmEscrowService(TEST_PRIVATE_KEY);
      expect(escrowService.getEscrowAddress()).toBe(
        anotherService.getEscrowAddress()
      );
    });

    it("Foundryの最初のアカウントアドレスが導出される", () => {
      expect(escrowService.getEscrowAddress()).toBe(
        "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
      );
    });
  });

  describe("releaseToVendor", () => {
    it("PENDING_ESCROW以外のステータスの場合エラー", async () => {
      const payment = Payment.create({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
      });

      const result = await escrowService.releaseToVendor(
        payment,
        TEST_VENDOR_ADDRESS
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(
        "Payment is not in pending_escrow status"
      );
    });
  });

  describe("refundToBuyer", () => {
    it("PENDING_ESCROW以外のステータスの場合エラー", async () => {
      const payment = Payment.create({
        productId: "product-123",
        vendorId: "vendor-123",
        amount: "$0.10",
        network: "eip155:84532",
        payer: "0x1234567890123456789012345678901234567890",
        transaction: "0xabcdef1234567890",
      });

      const result = await escrowService.refundToBuyer(payment);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(
        "Payment is not in pending_escrow status"
      );
    });
  });
});
