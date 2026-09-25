import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared/database/prisma.service.js";
import { GroupMembershipService } from "../../groups/group-membership.service.js";
import { IdempotencyService } from "../shared/idempotency.service.js";
import { MoneyService } from "../shared/money.service.js";
import { SerializableTransactionService } from "../shared/serializable-transaction.service.js";
import type { CreateExpenseInput, UpdateExpenseInput } from "./expense.schemas.js";
import type { ExpenseDto, ExpenseSnapshot } from "./expense.types.js";

@Injectable()
export class ExpensesService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: GroupMembershipService,
    private readonly money: MoneyService,
    private readonly idempotency: IdempotencyService,
    private readonly transactions: SerializableTransactionService,
  ) {}

  public async create(
    userId: string,
    key: string,
    input: CreateExpenseInput,
  ): Promise<ExpenseDto> {
    const amountPaise = this.money.parsePositiveRupees(input.amount);
    const shares = this.money.assertExactShares(amountPaise, input.participants);
    const participantUserIds = [...shares.keys()];

    await this.authorizeNew(
      userId,
      input.payerUserId,
      participantUserIds,
      input.groupId,
    );

    return this.transactions.run(
      async (tx) => {
        const requestHash = this.idempotency.hashRequest("POST:/v1/expenses", input);
        const claim = await this.idempotency.claim<ExpenseDto>(
          tx,
          userId,
          key,
          requestHash,
        );

        if (claim.kind === "replay") {
          return claim.response.body as ExpenseDto;
        }

        const expense = await tx.expense.create({
          data: {
            title: input.title,
            amountPaise,
            occurredOn: this.dateForDatabase(input.occurredOn),
            payerUserId: input.payerUserId,
            createdByUserId: userId,
            groupId: input.groupId,
            participants: {
              create: this.participantsForDatabase(shares),
            },
          },
          include: {
            participants: true,
          },
        });

        const response = this.dto(expense);
        await this.appendRevision(
          tx,
          expense.id,
          expense.version,
          "CREATED",
          userId,
          this.snapshot(expense),
        );
        await this.idempotency.complete(tx, claim.recordId, {
          statusCode: 201,
          body: response,
        });

        return response;
      },
    );
  }

  public async findById(userId: string, id: string): Promise<ExpenseDto> {
    const expense = await this.load(id);
    await this.authorizeExisting(userId, expense);

    return this.dto(expense);
  }

  public async update(
    userId: string,
    key: string,
    id: string,
    input: UpdateExpenseInput,
  ): Promise<ExpenseDto> {
    return this.transactions.run(
      async (tx) => {
        const endpoint = `PATCH:/v1/expenses/${id}`;
        const requestHash = this.idempotency.hashRequest(endpoint, input);
        const claim = await this.idempotency.claim<ExpenseDto>(
          tx,
          userId,
          key,
          requestHash,
        );

        if (claim.kind === "replay") {
          return claim.response.body as ExpenseDto;
        }

        const currentExpense = await this.load(id, tx);
        await this.authorizeExisting(userId, currentExpense);
        this.assertCurrentVersion(currentExpense, input.version);

        let amountPaise = currentExpense.amountPaise;
        if (input.amount !== undefined) {
          amountPaise = this.money.parsePositiveRupees(input.amount);
        }

        let participants = this.participantInputs(currentExpense);
        if (input.participants !== undefined) {
          participants = input.participants;
        }
        const shares = this.money.assertExactShares(amountPaise, participants);

        let payerUserId = currentExpense.payerUserId;
        if (input.payerUserId !== undefined) {
          payerUserId = input.payerUserId;
        }

        let groupId = currentExpense.groupId;
        if (input.groupId !== undefined) {
          groupId = input.groupId;
        }

        await this.authorizeNew(userId, payerUserId, [...shares.keys()], groupId);

        let title = currentExpense.title;
        if (input.title !== undefined) {
          title = input.title;
        }

        let occurredOn = currentExpense.occurredOn;
        if (input.occurredOn !== undefined) {
          occurredOn = this.dateForDatabase(input.occurredOn);
        }

        await tx.expenseParticipant.deleteMany({
          where: { expenseId: id },
        });

        const updatedExpense = await tx.expense.update({
          where: { id },
          data: {
            title,
            amountPaise,
            occurredOn,
            payerUserId,
            groupId,
            version: { increment: 1 },
            participants: {
              create: this.participantsForDatabase(shares),
            },
          },
          include: {
            participants: true,
          },
        });

        const response = this.dto(updatedExpense);
        await this.appendRevision(
          tx,
          id,
          updatedExpense.version,
          "UPDATED",
          userId,
          this.snapshot(updatedExpense),
        );
        await this.idempotency.complete(tx, claim.recordId, {
          statusCode: 200,
          body: response,
        });

        return response;
      },
    );
  }

  public async softDelete(
    userId: string,
    key: string,
    id: string,
    version: number,
  ): Promise<void> {
    await this.transactions.run(
      async (tx) => {
        const endpoint = `DELETE:/v1/expenses/${id}`;
        const requestHash = this.idempotency.hashRequest(endpoint, { version });
        const claim = await this.idempotency.claim<null>(tx, userId, key, requestHash);

        if (claim.kind === "replay") {
          return;
        }

        const currentExpense = await this.load(id, tx);
        await this.authorizeExisting(userId, currentExpense);

        const isActive = currentExpense.status === "ACTIVE";
        const hasRequestedVersion = currentExpense.version === version;
        if (!isActive || !hasRequestedVersion) {
          throw new ConflictException("Expense version is stale");
        }

        const deletedExpense = await tx.expense.update({
          where: { id },
          data: {
            status: "DELETED",
            deletedAt: new Date(),
            version: { increment: 1 },
          },
          include: {
            participants: true,
          },
        });

        await this.appendRevision(
          tx,
          id,
          deletedExpense.version,
          "DELETED",
          userId,
          this.snapshot(deletedExpense),
        );
        await this.idempotency.complete(tx, claim.recordId, {
          statusCode: 204,
          body: null,
        });
      },
    );
  }

  private async load(
    id: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<any> {
    const expense = await tx.expense.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!expense) {
      throw new NotFoundException("Expense not found");
    }

    return expense;
  }

  // Verifies the expense's people and group membership without requiring the creator to be involved.
  private async authorizeNew(
    creatorUserId: string,
    payerUserId: string,
    participantUserIds: string[],
    groupId?: string | null,
  ): Promise<void> {
    const involvedUserIds = [...new Set([payerUserId, ...participantUserIds])];

    const foundUserCount = await this.prisma.user.count({
      where: {
        id: { in: involvedUserIds },
      },
    });
    if (foundUserCount !== involvedUserIds.length) {
      throw new NotFoundException("User not found");
    }

    if (groupId === undefined || groupId === null) {
      return;
    }

    const groupMemberUserIds = [...new Set([creatorUserId, ...involvedUserIds])];
    for (const userId of groupMemberUserIds) {
      await this.memberships.requireActiveMember(groupId, userId);
    }
  }

  private async authorizeExisting(callerUserId: string, expense: any): Promise<void> {
    const callerIsPayer = callerUserId === expense.payerUserId;
    const callerIsParticipant = expense.participants.some(
      (participant: any) => participant.userId === callerUserId,
    );

    if (callerIsPayer || callerIsParticipant) {
      return;
    }

    if (expense.groupId !== null) {
      await this.memberships.requireActiveMember(expense.groupId, callerUserId);
      return;
    }

    throw new ForbiddenException("You cannot access this expense");
  }

  private assertCurrentVersion(expense: any, requestedVersion: number): void {
    const isActive = expense.status === "ACTIVE";
    const hasRequestedVersion = expense.version === requestedVersion;

    if (!isActive || !hasRequestedVersion) {
      throw new ConflictException({
        message: "Expense version is stale",
        expense: this.dto(expense),
      });
    }
  }

  private participantInputs(expense: any): ExpenseSnapshot["participants"] {
    return expense.participants.map((participant: any) => {
      return {
        userId: participant.userId,
        share: this.money.formatPaise(participant.sharePaise),
      };
    });
  }

  private participantsForDatabase(shares: Map<string, bigint>) {
    return [...shares].map(([userId, sharePaise]) => {
      return { userId, sharePaise };
    });
  }

  private dto(expense: any): ExpenseDto {
    return {
      id: expense.id,
      title: expense.title,
      amount: this.money.formatPaise(expense.amountPaise),
      occurredOn: this.dateForResponse(expense.occurredOn),
      payerUserId: expense.payerUserId,
      groupId: expense.groupId,
      status: this.statusForResponse(expense.status),
      version: expense.version,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
      participants: this.participantInputs(expense),
    };
  }

  private snapshot(expense: any): ExpenseSnapshot {
    const participants = this.participantInputs(expense);
    participants.sort((first, second) => first.userId.localeCompare(second.userId));

    return {
      title: expense.title,
      amount: this.money.formatPaise(expense.amountPaise),
      occurredOn: this.dateForResponse(expense.occurredOn),
      payerUserId: expense.payerUserId,
      groupId: expense.groupId,
      status: this.statusForResponse(expense.status),
      participants,
    };
  }

  // Adds the immutable resulting state for one expense version to the audit history.
  private async appendRevision(
    tx: Prisma.TransactionClient,
    expenseId: string,
    version: number,
    event: "CREATED" | "UPDATED" | "DELETED",
    changedByUserId: string,
    snapshot: ExpenseSnapshot,
  ): Promise<void> {
    await tx.expenseRevision.create({
      data: {
        expenseId,
        version,
        event,
        changedByUserId,
        afterSnapshot: snapshot as any,
      },
    });
  }

  private dateForDatabase(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
  }

  private dateForResponse(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private statusForResponse(status: string): "active" | "deleted" {
    if (status === "DELETED") {
      return "deleted";
    }

    return "active";
  }
}
