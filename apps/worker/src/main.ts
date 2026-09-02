import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module.js";

async function bootstrap(): Promise<void> {
  const worker = await NestFactory.createApplicationContext(WorkerModule);
  worker.enableShutdownHooks();
}

void bootstrap();
