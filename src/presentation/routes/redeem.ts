import { Router } from "express";
import type { RedeemAPIKey } from "../../application/usecases/RedeemAPIKey";

export function createRedeemRoutes(redeemAPIKey: RedeemAPIKey): Router {
  const router = Router();

  router.get("/:token", async (req, res) => {
    const { token } = req.params;

    const result = await redeemAPIKey.execute({ token });

    if (result.success) {
      res.json({
        vendorId: result.vendorId,
        apiKey: result.apiKey.key,
        name: result.apiKey.name,
      });
      return;
    }

    const statusCode = result.error === "Token not found" ? 404 : 400;
    res.status(statusCode).json({ error: result.error });
  });

  return router;
}
