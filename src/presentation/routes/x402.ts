import { Router } from "express";
import type { Request, Response } from "express";
import type { ProcessX402Request } from "../../application/usecases/ProcessX402Request";
import type { IPaymentGateway } from "../../application/ports/IPaymentGateway";

export function createX402Routes(
  processX402Request: ProcessX402Request,
  paymentGateway: IPaymentGateway
): Router {
  const router = Router();

  router.get("/:vendorId/*productPath", async (req: Request, res: Response) => {
    const { vendorId: vendorIdParam, productPath } = req.params;
    const vendorId = Array.isArray(vendorIdParam) ? vendorIdParam[0] : vendorIdParam;
    const path = Array.isArray(productPath) ? productPath.join("/") : productPath;

    const paymentHeader = req.headers["payment-signature"] || req.headers["x-payment"];
    const headerValue = paymentHeader
      ? Array.isArray(paymentHeader)
        ? paymentHeader[0]
        : paymentHeader
      : undefined;

    const resourceUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

    let requestPayload: string | undefined;
    if (req.body && Object.keys(req.body).length > 0) {
      requestPayload = JSON.stringify(req.body);
    }

    const result = await processX402Request.execute({
      vendorId,
      path,
      resourceUrl,
      paymentHeader: headerValue,
      requestPayload,
    });

    switch (result.type) {
      case "payment_required": {
        const requirementsHeader = paymentGateway.encodePaymentRequired(result.paymentRequired);
        res.status(402);
        res.set("PAYMENT-REQUIRED", requirementsHeader);
        res.json({
          error: "Payment Required",
          message: "This endpoint requires payment",
        });
        break;
      }

      case "success": {
        const settlementHeader = paymentGateway.encodeSettleResponse(result.settleResponse);
        res.set("PAYMENT-RESPONSE", settlementHeader);

        try {
          const productData = JSON.parse(result.product.data);
          res.set("Content-Type", result.product.mimeType);
          res.json(productData);
        } catch {
          res.set("Content-Type", result.product.mimeType);
          res.send(result.product.data);
        }
        break;
      }

      case "verification_failed":
        res.status(402).json({
          error: "Payment verification failed",
          reason: result.reason,
        });
        break;

      case "settlement_failed":
        res.status(500).json({
          error: "Payment settlement failed",
          reason: result.reason,
        });
        break;

      case "task_created": {
        const settlementHeader = paymentGateway.encodeSettleResponse(result.settleResponse);
        res.set("PAYMENT-RESPONSE", settlementHeader);
        res.status(200).json({
          taskId: result.taskId,
          message: "Task created. Poll /tasks/:taskId/result for results.",
        });
        break;
      }

      case "not_found":
        res.status(404).json({ error: result.reason });
        break;
    }
  });

  return router;
}
