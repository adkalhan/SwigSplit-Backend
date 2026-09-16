import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import type { JobsOptions } from "bullmq";
import { Queue } from "bullmq";
import { RedisService } from "./redis.service.js";

/** Shared queue registry. Task-specific producers and processors are added in later modules. */
@Injectable()
export class BullMqService implements OnApplicationShutdown {
  private readonly systemQueue: Queue;

  public constructor(redis: RedisService) {
    this.systemQueue = new Queue("swigsplit-system", { connection: redis.getConnection() });
  }

  public async enqueue(name: string, data: Record<string, string>, options: JobsOptions): Promise<void> {
    await this.systemQueue.add(name, data, options);
  }

  public async remove(jobId: string): Promise<void> {
    const job = await this.systemQueue.getJob(jobId);
    await job?.remove();
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.systemQueue.close();
  }
}
