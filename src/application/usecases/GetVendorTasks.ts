import type { ITaskRepository } from "../../domain/repositories/ITaskRepository";
import type { Task } from "../../domain/entities/Task";

export interface GetVendorTasksInput {
  vendorId: string;
}

export interface GetVendorTasksOutput {
  tasks: Task[];
}

export class GetVendorTasks {
  constructor(private readonly taskRepository: ITaskRepository) {}

  async execute(input: GetVendorTasksInput): Promise<GetVendorTasksOutput> {
    const tasks = await this.taskRepository.findPendingByVendorId(input.vendorId);
    return { tasks };
  }
}
