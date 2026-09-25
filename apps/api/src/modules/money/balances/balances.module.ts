import { Module } from "@nestjs/common";
import { GroupsModule } from "../../groups/groups.module.js";
import { MoneySharedModule } from "../shared/money-shared.module.js";
import { BalancesController } from "./balances.controller.js";
import { BalancesService } from "./balances.service.js";

@Module({
  imports: [GroupsModule, MoneySharedModule],
  controllers: [BalancesController],
  providers: [BalancesService],
  exports: [BalancesService],
})
export class BalancesModule {}
