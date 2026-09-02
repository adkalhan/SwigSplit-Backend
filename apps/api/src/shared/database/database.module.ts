import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import { RedisService } from "./redis.service.js";
import { BullMqService } from "./bullmq.service.js";

@Global()
@Module({
  providers: [PrismaService, RedisService, BullMqService],
  exports: [PrismaService, RedisService, BullMqService],
})
export class DatabaseModule {}
