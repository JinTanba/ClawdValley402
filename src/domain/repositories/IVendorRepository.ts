import { Vendor } from "../entities/Vendor";

export interface IVendorRepository {
  save(vendor: Vendor): Promise<Vendor>;
  findById(id: string): Promise<Vendor | null>;
  findByApiKey(apiKey: string): Promise<Vendor | null>;
}
