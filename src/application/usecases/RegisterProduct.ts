import { Product, ProductType } from "../../domain/entities/Product";
import type { IProductRepository } from "../../domain/repositories/IProductRepository";
import type { IVendorRepository } from "../../domain/repositories/IVendorRepository";

export interface RegisterProductInput {
  vendorId: string;
  path: string;
  price: string;
  network?: string;
  description: string;
  mimeType?: string;
  data: string;
  type?: ProductType;
}

export interface RegisterProductOutput {
  product: Product;
}

export class RegisterProduct {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly vendorRepository: IVendorRepository
  ) {}

  async execute(input: RegisterProductInput): Promise<RegisterProductOutput> {
    const vendor = await this.vendorRepository.findById(input.vendorId);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    const existingProduct = await this.productRepository.findByVendorIdAndPath(
      input.vendorId,
      input.path
    );
    if (existingProduct) {
      throw new Error("Product with this path already exists");
    }

    const product = Product.create({
      vendorId: input.vendorId,
      path: input.path,
      price: input.price,
      network: input.network,
      description: input.description,
      mimeType: input.mimeType,
      data: input.data,
      type: input.type,
    });

    await this.productRepository.save(product);

    return { product };
  }
}
