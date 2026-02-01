import type { ITaskRepository } from "../../domain/repositories/ITaskRepository";
import type { TaskStatus } from "../../domain/entities/Task";

export interface GetTaskResultInput {
  taskId: string;
}

export interface GetTaskResultOutput {
  found: boolean;
  status?: TaskStatus;
  result?: string;
  errorMessage?: string;
}

export class GetTaskResult {
  constructor(private readonly taskRepository: ITaskRepository) {}

  async execute(input: GetTaskResultInput): Promise<GetTaskResultOutput> {
    const task = await this.taskRepository.findById(input.taskId);

    if (!task) {
      return { found: false };
    }

    return {
      found: true,
      status: task.status,
      result: task.result ?? undefined,
      errorMessage: task.errorMessage ?? undefined,
    };
  }
}
