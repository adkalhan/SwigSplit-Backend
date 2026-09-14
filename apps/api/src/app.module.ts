import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module.js";
import { DatabaseModule } from "./shared/database/database.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { UsersModule } from "./modules/users/users.module.js";

@Module({ imports: [ConfigModule, DatabaseModule, AuthModule, HealthModule, UsersModule] })
export class AppModule {}
