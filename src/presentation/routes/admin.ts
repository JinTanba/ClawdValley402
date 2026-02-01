import { Router } from "express";
import type { Request, Response } from "express";
import type { RegisterVendor } from "../../application/usecases/RegisterVendor";
import type { RegisterProduct } from "../../application/usecases/RegisterProduct";

export function createAdminRoutes(
  registerVendor: RegisterVendor,
  registerProduct: RegisterProduct
): Router {
  const router = Router();

  router.post("/vendors", async (req: Request, res: Response) => {
    try {
      const { name, evmAddress } = req.body;
      const result = await registerVendor.execute({ name, evmAddress });

      res.status(201).json({
        vendor: {
          id: result.vendor.id,
          name: result.vendor.name,
          evmAddress: result.vendor.evmAddress,
          apiKey: result.vendor.apiKey,
          status: result.vendor.status,
          createdAt: result.vendor.createdAt,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(400).json({ error: message });
    }
  });

  router.post("/vendors/:id/products", async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const vendorId = Array.isArray(idParam) ? idParam[0] : idParam;
      const { path, price, network, description, mimeType, data, type } = req.body;

      const result = await registerProduct.execute({
        vendorId,
        path,
        price,
        network,
        description,
        mimeType,
        data,
        type,
      });

      res.status(201).json({
        product: {
          id: result.product.id,
          vendorId: result.product.vendorId,
          path: result.product.path,
          price: result.product.price,
          network: result.product.network,
          description: result.product.description,
          mimeType: result.product.mimeType,
          type: result.product.type,
          status: result.product.status,
          createdAt: result.product.createdAt,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Vendor not found") {
        res.status(404).json({ error: message });
      } else {
        res.status(400).json({ error: message });
      }
    }
  });

  return router;
}
