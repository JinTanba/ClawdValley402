import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { IVendorRepository } from "../../domain/repositories/IVendorRepository";
import type { IAPIKeyRepository } from "../../domain/repositories/IAPIKeyRepository";
import type { Vendor } from "../../domain/entities/Vendor";

export interface AuthenticatedRequest extends Request {
  vendor: Vendor;
}

export function createVendorAuthMiddleware(
  vendorRepository: IVendorRepository,
  apiKeyRepository: IAPIKeyRepository
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKeyHeader = req.headers["x-api-key"];

    if (!apiKeyHeader || typeof apiKeyHeader !== "string") {
      res.status(401).json({ error: "API key required" });
      return;
    }

    const apiKey = await apiKeyRepository.findByKey(apiKeyHeader);

    if (!apiKey) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    if (!apiKey.isValid()) {
      res.status(401).json({ error: "API key expired or revoked" });
      return;
    }

    const vendor = await vendorRepository.findById(apiKey.vendorId);

    if (!vendor) {
      res.status(401).json({ error: "Vendor not found" });
      return;
    }

    (req as AuthenticatedRequest).vendor = vendor;
    next();
  };
}
