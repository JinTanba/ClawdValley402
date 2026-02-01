import type { ITaskRepository } from "../../domain/repositories/ITaskRepository";
import type { Task } from "../../domain/entities/Task";

export interface StartTaskProcessingInput {
  taskId: string;
  vendorId: string;
}

export interface StartTaskProcessingOutput {
  success: boolean;
  task?: Task;
  error?: string;
}

export class StartTaskProcessing {
  constructor(private readonly taskRepository: ITaskRepository) {}

  async execute(input: StartTaskProcessingInput): Promise<StartTaskProcessingOutput> {
    const task = await this.taskRepository.findById(input.taskId);

    if (!task || task.vendorId !== input.vendorId) {
      return { success: false, error: "Task not found" };
    }

    try {
      const processingTask = task.startProcessing();
      await this.taskRepository.save(processingTask);
      return { success: true, task: processingTask };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }
}
