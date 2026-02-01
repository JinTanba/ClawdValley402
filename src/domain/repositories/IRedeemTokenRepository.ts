import type { RedeemToken } from "../entities/RedeemToken";

export interface IRedeemTokenRepository {
  save(token: RedeemToken): Promise<RedeemToken>;
  findByToken(token: string): Promise<RedeemToken | null>;
}
