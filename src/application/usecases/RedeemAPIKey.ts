import { APIKey } from "../../domain/entities/APIKey";
import type { IAPIKeyRepository } from "../../domain/repositories/IAPIKeyRepository";
import type { IRedeemTokenRepository } from "../../domain/repositories/IRedeemTokenRepository";

export interface RedeemAPIKeyInput {
  token: string;
}

export type RedeemAPIKeyResult =
  | { success: true; apiKey: APIKey; vendorId: string }
  | { success: false; error: string };

export class RedeemAPIKey {
  constructor(
    private readonly redeemTokenRepository: IRedeemTokenRepository,
    private readonly apiKeyRepository: IAPIKeyRepository
  ) {}

  async execute(input: RedeemAPIKeyInput): Promise<RedeemAPIKeyResult> {
    const redeemToken = await this.redeemTokenRepository.findByToken(input.token);

    if (!redeemToken) {
      return { success: false, error: "Token not found" };
    }

    if (!redeemToken.canRedeem()) {
      return { success: false, error: "Token expired or already redeemed" };
    }

    const apiKey = APIKey.create({
      vendorId: redeemToken.vendorId,
      name: redeemToken.name,
      walletAddress: redeemToken.walletAddress,
    });

    await this.apiKeyRepository.save(apiKey);

    const updatedToken = redeemToken.markAsRedeemed();
    await this.redeemTokenRepository.save(updatedToken);

    return {
      success: true,
      apiKey,
      vendorId: redeemToken.vendorId,
    };
  }
}
