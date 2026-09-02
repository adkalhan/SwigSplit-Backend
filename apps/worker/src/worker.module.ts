import { Inject, Injectable, Module, OnApplicationShutdown } from "@nestjs/common";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";

const workerEnvironmentSchema = z.object({ REDIS_URL: z.string().url() });

@Injectable()
class SystemWorker implements OnApplicationShutdown {
  private readonly connection: IORedis;
  private readonly worker: Worker;

  public constructor(@Inject("WORKER_REDIS_URL") redisUrl: string) {
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.worker = new Worker("swigsplit-system", async () => {
      // Job processors are registered by the owning domain modules in later tasks.
    }, { connection: this.connection });
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.worker.close();
    this.connection.disconnect();
  }
}

@Module({
  providers: [
    { provide: "WORKER_REDIS_URL", useFactory: () => workerEnvironmentSchema.parse(process.env).REDIS_URL },
    SystemWorker,
  ],
})
export class WorkerModule {}
