import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { ZodType } from "zod";
import { AuthGuard } from "../../auth/auth.guard.js";
import { CurrentUser, type AuthenticatedUser } from "../../auth/auth-user.js";
import { IdempotencyService } from "../shared/idempotency.service.js";
import { createExpenseSchema, deleteExpenseSchema, updateExpenseSchema } from "./expense.schemas.js";
import { ExpensesService } from "./expenses.service.js";
import type { ExpenseDto } from "./expense.types.js";
@Controller("v1/expenses")
@UseGuards(AuthGuard)
export class ExpensesController {
  public constructor(
    private readonly expenses: ExpensesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  public create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ): Promise<ExpenseDto> {
    const input = parse(createExpenseSchema, body);
    const idempotencyKey = this.idempotency.requireKey(key);
    return this.expenses.create(user.id, idempotencyKey, input);
  }

  @Get(":expenseId")
  public get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("expenseId") expenseId: string,
  ): Promise<ExpenseDto> {
    return this.expenses.findById(user.id, expenseId);
  }

  @Patch(":expenseId")
  public update(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") key: string | undefined,
    @Param("expenseId") expenseId: string,
    @Body() body: unknown,
  ): Promise<ExpenseDto> {
    const input = parse(updateExpenseSchema, body);
    const idempotencyKey = this.idempotency.requireKey(key);
    return this.expenses.update(user.id, idempotencyKey, expenseId, input);
  }

  @Delete(":expenseId")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") key: string | undefined,
    @Param("expenseId") expenseId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const input = parse(deleteExpenseSchema, body);
    const idempotencyKey = this.idempotency.requireKey(key);
    await this.expenses.softDelete(user.id, idempotencyKey, expenseId, input.version);
  }
}

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException("Request validation failed");
  return result.data;
}
