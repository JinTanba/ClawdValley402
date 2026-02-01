import { Product } from "../entities/Product";

export interface IProductRepository {
  save(product: Product): Promise<Product>;
  findById(id: string): Promise<Product | null>;
  findByVendorIdAndPath(vendorId: string, path: string): Promise<Product | null>;
  findByVendorId(vendorId: string): Promise<Product[]>;
}
