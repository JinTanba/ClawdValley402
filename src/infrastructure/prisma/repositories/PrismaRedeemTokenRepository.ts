import type { PrismaClient } from "@prisma/client";
import type { IRedeemTokenRepository } from "../../../domain/repositories/IRedeemTokenRepository";
import { RedeemToken, RedeemTokenStatus } from "../../../domain/entities/RedeemToken";

export class PrismaRedeemTokenRepository implements IRedeemTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(token: RedeemToken): Promise<RedeemToken> {
    const data = token.toJSON();
    await this.prisma.redeemToken.upsert({
      where: { id: data.id },
      update: {
        status: data.status,
      },
      create: {
        id: data.id,
        token: data.token,
        vendorId: data.vendorId,
        name: data.name,
        walletAddress: data.walletAddress,
        paymentId: data.paymentId,
        status: data.status,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
      },
    });
    return token;
  }

  async findByToken(tokenValue: string): Promise<RedeemToken | null> {
    const record = await this.prisma.redeemToken.findUnique({
      where: { token: tokenValue },
    });

    if (!record) {
      return null;
    }

    return RedeemToken.reconstruct({
      id: record.id,
      token: record.token,
      vendorId: record.vendorId,
      name: record.name,
      walletAddress: record.walletAddress,
      paymentId: record.paymentId,
      status: record.status as RedeemTokenStatus,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });
  }
}
