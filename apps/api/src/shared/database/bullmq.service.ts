import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { Queue } from "bullmq";
import { RedisService } from "./redis.service.js";

/** Shared queue registry. Task-specific producers and processors are added in later modules. */
@Injectable()
export class BullMqService implements OnApplicationShutdown {
  private readonly systemQueue: Queue;

  public constructor(redis: RedisService) {
    this.systemQueue = new Queue("swigsplit-system", { connection: redis.getConnection() });
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.systemQueue.close();
  }
}
