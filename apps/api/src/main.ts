import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import type { IncomingMessage } from "node:http";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import { AppModule } from "./app.module.js";
import { loadEnvironment } from "./shared/config/environment.js";
import { HttpExceptionFilter } from "./shared/errors/http-exception.filter.js";

async function bootstrap(): Promise<void> {
  const environment = loadEnvironment();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: environment.BODY_LIMIT_BYTES,
      genReqId: (request: IncomingMessage) => request.headers["x-request-id"]?.toString() ?? crypto.randomUUID(),
      logger: { level: environment.LOG_LEVEL, redact: ["req.headers.authorization", "req.headers.cookie"] },
    }),
  );
  await app.register(compress);
  await app.register(cors, {
    origin: environment.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(environment.PORT, "0.0.0.0");
  Logger.log(`API listening on port ${environment.PORT}`, "Bootstrap");
}

void bootstrap();
