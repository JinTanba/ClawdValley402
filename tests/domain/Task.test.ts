import { describe, expect, it } from "bun:test";
import { Task, TaskStatus } from "../../src/domain/entities/Task";

describe("Task", () => {
  describe("create", () => {
    it("Taskを作成できる", () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: JSON.stringify({ input: "test" }),
      });

      expect(task.paymentId).toBe("payment-123");
      expect(task.productId).toBe("product-123");
      expect(task.vendorId).toBe("vendor-123");
      expect(task.buyerAddress).toBe("0x1234567890123456789012345678901234567890");
      expect(task.requestPayload).toBe(JSON.stringify({ input: "test" }));
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.result).toBeNull();
      expect(task.errorMessage).toBeNull();
      expect(task.id).toBeTruthy();
      expect(task.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("reconstruct", () => {
    it("既存データからTaskを復元できる", () => {
      const task = Task.reconstruct({
        id: "task-123",
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: JSON.stringify({ input: "test" }),
        status: TaskStatus.COMPLETED,
        result: JSON.stringify({ output: "result" }),
        errorMessage: null,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      });

      expect(task.id).toBe("task-123");
      expect(task.status).toBe(TaskStatus.COMPLETED);
      expect(task.result).toBe(JSON.stringify({ output: "result" }));
    });
  });

  describe("startProcessing", () => {
    it("Taskをprocessing状態に変更できる", () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });

      const processingTask = task.startProcessing();
      expect(processingTask.status).toBe(TaskStatus.PROCESSING);
    });

    it("pending以外の状態からはエラー", () => {
      const task = Task.reconstruct({
        id: "task-123",
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
        status: TaskStatus.COMPLETED,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(() => task.startProcessing()).toThrow(
        "Cannot start processing: task is not in pending status"
      );
    });
  });

  describe("complete", () => {
    it("Taskをcompleted状態に変更できる", () => {
      const task = Task.reconstruct({
        id: "task-123",
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
        status: TaskStatus.PROCESSING,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const completedTask = task.complete(JSON.stringify({ result: "success" }));
      expect(completedTask.status).toBe(TaskStatus.COMPLETED);
      expect(completedTask.result).toBe(JSON.stringify({ result: "success" }));
    });

    it("processing以外の状態からはエラー", () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });

      expect(() => task.complete("result")).toThrow(
        "Cannot complete: task is not in processing status"
      );
    });
  });

  describe("fail", () => {
    it("Taskをfailed状態に変更できる", () => {
      const task = Task.reconstruct({
        id: "task-123",
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
        status: TaskStatus.PROCESSING,
        result: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const failedTask = task.fail("Something went wrong");
      expect(failedTask.status).toBe(TaskStatus.FAILED);
      expect(failedTask.errorMessage).toBe("Something went wrong");
    });

    it("processing以外の状態からはエラー", () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });

      expect(() => task.fail("error")).toThrow(
        "Cannot fail: task is not in processing status"
      );
    });
  });

  describe("toJSON", () => {
    it("JSONに変換できる", () => {
      const task = Task.create({
        paymentId: "payment-123",
        productId: "product-123",
        vendorId: "vendor-123",
        buyerAddress: "0x1234567890123456789012345678901234567890",
        requestPayload: "{}",
      });

      const json = task.toJSON();
      expect(json.paymentId).toBe("payment-123");
      expect(json.vendorId).toBe("vendor-123");
    });
  });
});
