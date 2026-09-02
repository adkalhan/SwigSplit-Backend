import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { ENVIRONMENT } from "../config/config.module.js";
import type { Environment } from "../config/environment.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  public constructor(@Inject(ENVIRONMENT) environment: Environment) {
    super({ datasources: { db: { url: environment.DATABASE_URL } } });
  }

  public async checkHealth(): Promise<void> {
    await this.$queryRawUnsafe("SELECT 1");
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
