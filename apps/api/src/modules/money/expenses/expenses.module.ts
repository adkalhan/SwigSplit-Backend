import { Module } from "@nestjs/common";
import { GroupsModule } from "../../groups/groups.module.js";
import { MoneySharedModule } from "../shared/money-shared.module.js";
import { ExpensesController } from "./expenses.controller.js";
import { ExpensesService } from "./expenses.service.js";
@Module({
  imports: [GroupsModule, MoneySharedModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
