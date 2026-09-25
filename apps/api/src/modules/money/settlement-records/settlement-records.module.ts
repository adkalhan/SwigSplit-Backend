import { Module } from "@nestjs/common";
import { GroupsModule } from "../../groups/groups.module.js";
import { MoneySharedModule } from "../shared/money-shared.module.js";
import { SettlementRecordsController } from "./settlement-records.controller.js";
import { SettlementRecordsService } from "./settlement-records.service.js";

@Module({
  imports: [GroupsModule, MoneySharedModule],
  controllers: [SettlementRecordsController],
  providers: [SettlementRecordsService],
  exports: [SettlementRecordsService],
})
export class SettlementRecordsModule {}
