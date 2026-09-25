import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../../auth/auth.guard.js";
import { CurrentUser, type AuthenticatedUser } from "../../auth/auth-user.js";
import { IdempotencyService } from "../shared/idempotency.service.js";
import { createSettlementRecordSchema } from "./settlement-record.schemas.js";
import { SettlementRecordsService } from "./settlement-records.service.js";

@Controller("v1/settlement-records")
@UseGuards(AuthGuard)
export class SettlementRecordsController {
  public constructor(
    private readonly records: SettlementRecordsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  public create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const parsed = createSettlementRecordSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Request validation failed");

    const idempotencyKey = this.idempotency.requireKey(key);
    return this.records.create(user.id, idempotencyKey, parsed.data);
  }
}
