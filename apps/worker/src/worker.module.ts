import { Inject, Injectable, Module, OnApplicationShutdown } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const workerEnvironmentSchema = z.object({
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
});

type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

@Injectable()
class SystemWorker implements OnApplicationShutdown {
  private readonly connection: IORedis;
  private readonly worker: Worker;
  private readonly prisma: PrismaClient;

  public constructor(@Inject("WORKER_ENVIRONMENT") environment: WorkerEnvironment) {
    this.connection = new IORedis(environment.REDIS_URL, { maxRetriesPerRequest: null });
    this.prisma = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
    this.worker = new Worker("swigsplit-system", (job) => this.process(job), { connection: this.connection });
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.worker.close();
    await this.prisma.$disconnect();
    this.connection.disconnect();
  }

  private async process(job: Job): Promise<void> {
    if (job.name !== "purge-group" || typeof job.data.groupId !== "string") return;
    const group = await this.prisma.group.findFirst({
      where: {
        id: job.data.groupId,
        archivedAt: { not: null },
        purgeAfter: { lte: new Date() },
      },
      select: { id: true },
    });
    if (!group) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.group_invites.deleteMany({ where: { groupId: group.id } });
      await tx.groupMember.deleteMany({ where: { groupId: group.id } });
      await tx.group.delete({ where: { id: group.id } });
    });
  }
}

@Module({
  providers: [
    { provide: "WORKER_ENVIRONMENT", useFactory: (): WorkerEnvironment => workerEnvironmentSchema.parse(process.env) },
    SystemWorker,
  ],
})
export class WorkerModule {}
