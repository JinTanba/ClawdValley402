import { Router } from "express";
import type { Request, Response } from "express";
import type { GetTaskStatus } from "../../application/usecases/GetTaskStatus";
import type { GetTaskResult } from "../../application/usecases/GetTaskResult";
import { TaskStatus } from "../../domain/entities/Task";

export function createTasksRoutes(
  getTaskStatus: GetTaskStatus,
  getTaskResult: GetTaskResult
): Router {
  const router = Router();

  router.get("/:taskId", async (req: Request, res: Response) => {
    const taskId = req.params.taskId;
    const result = await getTaskStatus.execute({ taskId });

    if (!result.found) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json({
      status: result.status,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    });
  });

  router.get("/:taskId/result", async (req: Request, res: Response) => {
    const taskId = req.params.taskId;
    const result = await getTaskResult.execute({ taskId });

    if (!result.found) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (result.status === TaskStatus.PENDING || result.status === TaskStatus.PROCESSING) {
      res.status(202).json({
        status: result.status,
        message: "Task is still processing",
      });
      return;
    }

    res.json({
      status: result.status,
      result: result.result,
      errorMessage: result.errorMessage,
    });
  });

  return router;
}
