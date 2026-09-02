import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module.js";
import { DatabaseModule } from "./shared/database/database.module.js";
import { HealthModule } from "./modules/health/health.module.js";

@Module({ imports: [ConfigModule, DatabaseModule, HealthModule] })
export class AppModule {}
