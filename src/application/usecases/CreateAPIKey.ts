import { APIKey } from "../../domain/entities/APIKey";
import type { IAPIKeyRepository } from "../../domain/repositories/IAPIKeyRepository";

export interface CreateAPIKeyInput {
  vendorId: string;
  name: string;
  walletAddress: string;
  expiresAt?: Date;
}

export interface CreateAPIKeyResult {
  apiKey: APIKey;
}

export class CreateAPIKey {
  constructor(private readonly apiKeyRepository: IAPIKeyRepository) {}

  async execute(input: CreateAPIKeyInput): Promise<CreateAPIKeyResult> {
    const apiKey = APIKey.create({
      vendorId: input.vendorId,
      name: input.name,
      walletAddress: input.walletAddress,
      expiresAt: input.expiresAt,
    });

    await this.apiKeyRepository.save(apiKey);

    return { apiKey };
  }
}
