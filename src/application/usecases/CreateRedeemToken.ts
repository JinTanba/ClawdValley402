import { RedeemToken } from "../../domain/entities/RedeemToken";
import type { IRedeemTokenRepository } from "../../domain/repositories/IRedeemTokenRepository";

export interface CreateRedeemTokenInput {
  vendorId: string;
  name: string;
  walletAddress: string;
  paymentId: string;
}

export interface CreateRedeemTokenResult {
  redeemToken: RedeemToken;
  redeemUrl: string;
}

export class CreateRedeemToken {
  constructor(
    private readonly redeemTokenRepository: IRedeemTokenRepository,
    private readonly expiryHours: number = 24
  ) {}

  async execute(input: CreateRedeemTokenInput): Promise<CreateRedeemTokenResult> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.expiryHours);

    const redeemToken = RedeemToken.create({
      vendorId: input.vendorId,
      name: input.name,
      walletAddress: input.walletAddress,
      paymentId: input.paymentId,
      expiresAt,
    });

    await this.redeemTokenRepository.save(redeemToken);

    return {
      redeemToken,
      redeemUrl: `/redeem/${redeemToken.token}`,
    };
  }
}
