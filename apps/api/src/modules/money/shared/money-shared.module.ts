import { Module } from "@nestjs/common";
import { IdempotencyService } from "./idempotency.service.js";
import { MoneyService } from "./money.service.js";
import { SerializableTransactionService } from "./serializable-transaction.service.js";

@Module({
  providers: [MoneyService, IdempotencyService, SerializableTransactionService],
  exports: [MoneyService, IdempotencyService, SerializableTransactionService],
})
export class MoneySharedModule {}
