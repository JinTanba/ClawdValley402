import type { PrismaClient } from "@prisma/client";
import { Vendor, VendorStatus } from "../../../domain/entities/Vendor";
import type { IVendorRepository } from "../../../domain/repositories/IVendorRepository";

export class PrismaVendorRepository implements IVendorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(vendor: Vendor): Promise<Vendor> {
    const data = vendor.toJSON();

    await this.prisma.vendor.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        name: data.name,
        evmAddress: data.evmAddress,
        apiKey: data.apiKey,
        status: data.status,
        createdAt: data.createdAt,
      },
      update: {
        name: data.name,
        evmAddress: data.evmAddress,
        status: data.status,
      },
    });

    return vendor;
  }

  async findById(id: string): Promise<Vendor | null> {
    const record = await this.prisma.vendor.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return Vendor.reconstruct({
      id: record.id,
      name: record.name,
      evmAddress: record.evmAddress,
      apiKey: record.apiKey,
      status: record.status as VendorStatus,
      createdAt: record.createdAt,
    });
  }

  async findByApiKey(apiKey: string): Promise<Vendor | null> {
    const record = await this.prisma.vendor.findUnique({
      where: { apiKey },
    });

    if (!record) {
      return null;
    }

    return Vendor.reconstruct({
      id: record.id,
      name: record.name,
      evmAddress: record.evmAddress,
      apiKey: record.apiKey,
      status: record.status as VendorStatus,
      createdAt: record.createdAt,
    });
  }
}
