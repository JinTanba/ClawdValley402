import type { ITaskRepository } from "../../domain/repositories/ITaskRepository";
import type { TaskStatus } from "../../domain/entities/Task";

export interface GetTaskStatusInput {
  taskId: string;
}

export interface GetTaskStatusOutput {
  found: boolean;
  status?: TaskStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class GetTaskStatus {
  constructor(private readonly taskRepository: ITaskRepository) {}

  async execute(input: GetTaskStatusInput): Promise<GetTaskStatusOutput> {
    const task = await this.taskRepository.findById(input.taskId);

    if (!task) {
      return { found: false };
    }

    return {
      found: true,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
