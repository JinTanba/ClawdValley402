import type { PrismaClient, Product as PrismaProduct } from "@prisma/client";
import { Product, ProductStatus, ProductType } from "../../../domain/entities/Product";
import type { IProductRepository } from "../../../domain/repositories/IProductRepository";

export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(product: Product): Promise<Product> {
    const data = product.toJSON();

    await this.prisma.product.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        vendorId: data.vendorId,
        path: data.path,
        price: data.price,
        network: data.network,
        description: data.description,
        mimeType: data.mimeType,
        data: data.data,
        type: data.type,
        status: data.status,
        createdAt: data.createdAt,
      },
      update: {
        path: data.path,
        price: data.price,
        network: data.network,
        description: data.description,
        mimeType: data.mimeType,
        data: data.data,
        type: data.type,
        status: data.status,
      },
    });

    return product;
  }

  async findById(id: string): Promise<Product | null> {
    const record = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return Product.reconstruct({
      id: record.id,
      vendorId: record.vendorId,
      path: record.path,
      price: record.price,
      network: record.network,
      description: record.description,
      mimeType: record.mimeType,
      data: record.data,
      type: record.type as ProductType,
      status: record.status as ProductStatus,
      createdAt: record.createdAt,
    });
  }

  async findByVendorIdAndPath(vendorId: string, path: string): Promise<Product | null> {
    const record = await this.prisma.product.findUnique({
      where: {
        vendorId_path: {
          vendorId,
          path,
        },
      },
    });

    if (!record) {
      return null;
    }

    return Product.reconstruct({
      id: record.id,
      vendorId: record.vendorId,
      path: record.path,
      price: record.price,
      network: record.network,
      description: record.description,
      mimeType: record.mimeType,
      data: record.data,
      type: record.type as ProductType,
      status: record.status as ProductStatus,
      createdAt: record.createdAt,
    });
  }

  async findByVendorId(vendorId: string): Promise<Product[]> {
    const records = await this.prisma.product.findMany({
      where: { vendorId },
    });

    return records.map((record: PrismaProduct) =>
      Product.reconstruct({
        id: record.id,
        vendorId: record.vendorId,
        path: record.path,
        price: record.price,
        network: record.network,
        description: record.description,
        mimeType: record.mimeType,
        data: record.data,
        type: record.type as ProductType,
        status: record.status as ProductStatus,
        createdAt: record.createdAt,
      })
    );
  }
}
