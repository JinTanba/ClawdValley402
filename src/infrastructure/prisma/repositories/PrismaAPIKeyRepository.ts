import type { PrismaClient } from "@prisma/client";
import type { IAPIKeyRepository } from "../../../domain/repositories/IAPIKeyRepository";
import { APIKey, APIKeyStatus } from "../../../domain/entities/APIKey";

export class PrismaAPIKeyRepository implements IAPIKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(apiKey: APIKey): Promise<APIKey> {
    const data = apiKey.toJSON();
    await this.prisma.apiKey.upsert({
      where: { id: data.id },
      update: {
        key: data.key,
        name: data.name,
        walletAddress: data.walletAddress,
        status: data.status,
        expiresAt: data.expiresAt,
      },
      create: {
        id: data.id,
        vendorId: data.vendorId,
        key: data.key,
        name: data.name,
        walletAddress: data.walletAddress,
        status: data.status,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
      },
    });
    return apiKey;
  }

  async findByKey(key: string): Promise<APIKey | null> {
    const record = await this.prisma.apiKey.findUnique({
      where: { key },
    });

    if (!record) {
      return null;
    }

    return APIKey.reconstruct({
      id: record.id,
      vendorId: record.vendorId,
      key: record.key,
      name: record.name,
      walletAddress: record.walletAddress,
      status: record.status as APIKeyStatus,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });
  }

  async findByVendorId(vendorId: string): Promise<APIKey[]> {
    const records = await this.prisma.apiKey.findMany({
      where: { vendorId },
    });

    return records.map((record) =>
      APIKey.reconstruct({
        id: record.id,
        vendorId: record.vendorId,
        key: record.key,
        name: record.name,
        walletAddress: record.walletAddress,
        status: record.status as APIKeyStatus,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      })
    );
  }
}
