import { Vendor } from "../../domain/entities/Vendor";
import type { IVendorRepository } from "../../domain/repositories/IVendorRepository";

export interface RegisterVendorInput {
  name: string;
  evmAddress: string;
}

export interface RegisterVendorOutput {
  vendor: Vendor;
}

export class RegisterVendor {
  constructor(private readonly vendorRepository: IVendorRepository) {}

  async execute(input: RegisterVendorInput): Promise<RegisterVendorOutput> {
    const vendor = Vendor.create({
      name: input.name,
      evmAddress: input.evmAddress,
    });

    await this.vendorRepository.save(vendor);

    return { vendor };
  }
}
