import type { Task, TaskStatus } from "../entities/Task";

export interface ITaskRepository {
  save(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  findByVendorId(vendorId: string): Promise<Task[]>;
  findByVendorIdAndStatus(vendorId: string, status: TaskStatus): Promise<Task[]>;
  findPendingByVendorId(vendorId: string): Promise<Task[]>;
}
