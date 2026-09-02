import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import IORedis from "ioredis";
import { ENVIRONMENT } from "../config/config.module.js";
import type { Environment } from "../config/environment.js";

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly client: IORedis;

  public constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.client = new IORedis(environment.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  public async checkHealth(): Promise<void> {
    if (this.client.status === "wait") await this.client.connect();
    const result = await this.client.ping();
    if (result !== "PONG") throw new Error("Redis health check did not return PONG");
  }

  public getConnection(): IORedis {
    return this.client;
  }

  public async onApplicationShutdown(): Promise<void> {
    if (this.client.status !== "end") this.client.disconnect();
  }
}
