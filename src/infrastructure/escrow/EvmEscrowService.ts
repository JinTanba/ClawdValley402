import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  type Address,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { IEscrowService, EscrowResult } from "../../application/ports/IEscrowService";
import { Payment, PaymentStatus } from "../../domain/entities/Payment";

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export class EvmEscrowService implements IEscrowService {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly escrowAddress: Address;
  private readonly usdcAddress: Address;

  constructor(
    privateKey: string,
    usdcAddress: string = "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    rpcUrl?: string
  ) {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    this.escrowAddress = account.address;
    this.usdcAddress = usdcAddress as Address;

    const transport = http(rpcUrl);

    this.walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport,
    });

    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport,
    });
  }

  getEscrowAddress(): string {
    return this.escrowAddress;
  }

  async releaseToVendor(
    payment: Payment,
    vendorAddress: string
  ): Promise<EscrowResult> {
    if (payment.status !== PaymentStatus.PENDING_ESCROW) {
      return {
        success: false,
        errorReason: "Payment is not in pending_escrow status",
      };
    }

    try {
      const amount = this.parseAmount(payment.amount);

      const hash = await this.walletClient.writeContract({
        address: this.usdcAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [vendorAddress as Address, amount],
      });

      await this.publicClient.waitForTransactionReceipt({ hash });

      return {
        success: true,
        transaction: hash,
      };
    } catch (error) {
      return {
        success: false,
        errorReason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async refundToBuyer(payment: Payment): Promise<EscrowResult> {
    if (payment.status !== PaymentStatus.PENDING_ESCROW) {
      return {
        success: false,
        errorReason: "Payment is not in pending_escrow status",
      };
    }

    try {
      const amount = this.parseAmount(payment.amount);

      const hash = await this.walletClient.writeContract({
        address: this.usdcAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [payment.payer as Address, amount],
      });

      await this.publicClient.waitForTransactionReceipt({ hash });

      return {
        success: true,
        transaction: hash,
      };
    } catch (error) {
      return {
        success: false,
        errorReason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private parseAmount(amount: string): bigint {
    const numericAmount = amount.replace(/[^0-9.]/g, "");
    return parseUnits(numericAmount, 6);
  }
}
