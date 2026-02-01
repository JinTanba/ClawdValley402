import { Router } from "express";
import type { Response } from "express";
import type { GetVendorTasks } from "../../application/usecases/GetVendorTasks";
import type { StartTaskProcessing } from "../../application/usecases/StartTaskProcessing";
import type { ReportTaskResult } from "../../application/usecases/ReportTaskResult";
import type { AuthenticatedRequest } from "../middleware/vendorAuth";

export function createVendorRoutes(
  getVendorTasks: GetVendorTasks,
  startTaskProcessing: StartTaskProcessing,
  reportTaskResult: ReportTaskResult
): Router {
  const router = Router();

  router.get("/tasks", async (req, res: Response) => {
    const vendor = (req as AuthenticatedRequest).vendor;
    const result = await getVendorTasks.execute({ vendorId: vendor.id });

    res.json({
      tasks: result.tasks.map((task) => ({
        id: task.id,
        productId: task.productId,
        buyerAddress: task.buyerAddress,
        requestPayload: task.requestPayload,
        status: task.status,
        createdAt: task.createdAt,
      })),
    });
  });

  router.post("/tasks/:taskId/start", async (req, res: Response) => {
    const vendor = (req as AuthenticatedRequest).vendor;
    const taskId = req.params.taskId;

    const result = await startTaskProcessing.execute({
      taskId,
      vendorId: vendor.id,
    });

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json({
      task: {
        id: result.task!.id,
        status: result.task!.status,
        updatedAt: result.task!.updatedAt,
      },
    });
  });

  router.post("/tasks/:taskId/complete", async (req, res: Response) => {
    const vendor = (req as AuthenticatedRequest).vendor;
    const taskId = req.params.taskId;
    const { result: taskResult } = req.body;

    const result = await reportTaskResult.complete({
      taskId,
      vendorId: vendor.id,
      result: taskResult,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      task: {
        id: result.task!.id,
        status: result.task!.status,
        updatedAt: result.task!.updatedAt,
      },
    });
  });

  router.post("/tasks/:taskId/fail", async (req, res: Response) => {
    const vendor = (req as AuthenticatedRequest).vendor;
    const taskId = req.params.taskId;
    const { errorMessage } = req.body;

    const result = await reportTaskResult.fail({
      taskId,
      vendorId: vendor.id,
      errorMessage,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      task: {
        id: result.task!.id,
        status: result.task!.status,
        errorMessage: result.task!.errorMessage,
        updatedAt: result.task!.updatedAt,
      },
    });
  });

  return router;
}
