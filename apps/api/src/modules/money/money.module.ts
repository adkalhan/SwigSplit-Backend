import { Module } from "@nestjs/common";
import { MoneySharedModule } from "./shared/money-shared.module.js";
import { ExpensesModule } from "./expenses/expenses.module.js";
import { SettlementRecordsModule } from "./settlement-records/settlement-records.module.js";
import { BalancesModule } from "./balances/balances.module.js";

@Module({
  imports: [MoneySharedModule, ExpensesModule, SettlementRecordsModule, BalancesModule],
  exports: [MoneySharedModule, ExpensesModule, SettlementRecordsModule, BalancesModule],
})
export class MoneyModule {}
