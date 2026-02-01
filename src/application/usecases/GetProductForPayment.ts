import { Product } from "../../domain/entities/Product";
import { Vendor } from "../../domain/entities/Vendor";
import type { IProductRepository } from "../../domain/repositories/IProductRepository";
import type { IVendorRepository } from "../../domain/repositories/IVendorRepository";

export interface GetProductForPaymentInput {
  vendorId: string;
  path: string;
}

export interface GetProductForPaymentOutput {
  product: Product;
  vendor: Vendor;
  payTo: string;
}

export class GetProductForPayment {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly vendorRepository: IVendorRepository
  ) {}

  async execute(input: GetProductForPaymentInput): Promise<GetProductForPaymentOutput> {
    const vendor = await this.vendorRepository.findById(input.vendorId);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    const product = await this.productRepository.findByVendorIdAndPath(
      input.vendorId,
      input.path
    );
    if (!product) {
      throw new Error("Product not found");
    }

    return {
      product,
      vendor,
      payTo: vendor.evmAddress,
    };
  }
}
