import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import type { PrivateKeyAccount } from "viem/accounts";
import { TEST_CONFIG } from "./setup";

type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PaymentClient {
  fetch: FetchFunction;
  account: PrivateKeyAccount;
}

export function createPaymentClient(privateKey?: `0x${string}`): PaymentClient {
  const key = privateKey ?? (TEST_CONFIG.clientPrivateKey as `0x${string}`);
  const account = privateKeyToAccount(key);

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: "eip155:*",
        client: new ExactEvmScheme(account),
      },
    ],
  });

  return {
    fetch: fetchWithPayment,
    account,
  };
}

export function decodePaymentResponse(header: string): unknown {
  return decodePaymentResponseHeader(header);
}

export function decodePaymentRequired(header: string): unknown {
  return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
}

export function encodePaymentPayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
