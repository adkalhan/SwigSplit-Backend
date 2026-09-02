import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../shared/database/prisma.service.js";
import { RedisService } from "../../shared/database/redis.service.js";

export type ReadinessResult = { database: "ok" | "unavailable"; redis: "ok" | "unavailable" };

@Injectable()
export class HealthService {
  public constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  public async checkReadiness(): Promise<ReadinessResult> {
    const [database, redis] = await Promise.allSettled([this.prisma.checkHealth(), this.redis.checkHealth()]);
    return {
      database: database.status === "fulfilled" ? "ok" : "unavailable",
      redis: redis.status === "fulfilled" ? "ok" : "unavailable",
    };
  }
}
