import type { APIKey } from "../entities/APIKey";

export interface IAPIKeyRepository {
  save(apiKey: APIKey): Promise<APIKey>;
  findByKey(key: string): Promise<APIKey | null>;
  findByVendorId(vendorId: string): Promise<APIKey[]>;
}
