import "dotenv/config";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  maxUint256,
  formatUnits,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
]);

async function main() {
  const privateKey = process.env.TEST_ADDER_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    throw new Error("TEST_ADDER_PRIVATE_KEY is not set in .env");
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`Account: ${account.address}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });

  // Check USDC balance
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });

  const decimals = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  console.log(`USDC Balance: ${formatUnits(balance, decimals)} USDC`);

  // Check current allowance
  const currentAllowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, PERMIT2_ADDRESS],
  });

  console.log(`Current Permit2 Allowance: ${formatUnits(currentAllowance, decimals)} USDC`);

  if (currentAllowance >= maxUint256 / 2n) {
    console.log("Permit2 already has sufficient allowance. Skipping approval.");
    return;
  }

  console.log("\nApproving Permit2 for unlimited USDC...");

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [PERMIT2_ADDRESS, maxUint256],
  });

  console.log(`Transaction submitted: ${hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "success") {
    console.log(`\nApproval successful!`);
    console.log(`Transaction: https://sepolia.basescan.org/tx/${hash}`);

    // Verify new allowance
    const newAllowance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, PERMIT2_ADDRESS],
    });

    console.log(`New Permit2 Allowance: ${formatUnits(newAllowance, decimals)} USDC`);
  } else {
    console.error("Approval failed!");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
