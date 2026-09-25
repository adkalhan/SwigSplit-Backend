import { Module } from "@nestjs/common";
import { ConfigModule } from "./shared/config/config.module.js";
import { DatabaseModule } from "./shared/database/database.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { GroupsModule } from "./modules/groups/groups.module.js";
import { InvitationsModule } from "./modules/invitations/invitations.module.js";
import { MoneyModule } from "./modules/money/money.module.js";

@Module({ imports: [ConfigModule, DatabaseModule, AuthModule, HealthModule, UsersModule, GroupsModule, InvitationsModule, MoneyModule] })
export class AppModule {}
