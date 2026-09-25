import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../shared/database/prisma.service.js";
import { GroupMembershipService } from "../../groups/group-membership.service.js";
import { IdempotencyService } from "../shared/idempotency.service.js";
import { MoneyService } from "../shared/money.service.js";
import { SerializableTransactionService } from "../shared/serializable-transaction.service.js";
import type { CreateSettlementRecordInput } from "./settlement-record.schemas.js";
import type { SettlementRecordDto } from "./settlement-record.types.js";

@Injectable()
export class SettlementRecordsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: GroupMembershipService,
    private readonly money: MoneyService,
    private readonly idempotency: IdempotencyService,
    private readonly transactions: SerializableTransactionService,
  ) {}

  public async create(
    senderUserId: string,
    key: string,
    input: CreateSettlementRecordInput,
  ): Promise<SettlementRecordDto> {
    this.assertDifferentUsers(senderUserId, input.recipientUserId);

    const amountPaise = this.money.parsePositiveRupees(input.amount);
    await this.requireUser(input.recipientUserId);
    await this.requireGroupMemberships(
      input.groupId,
      senderUserId,
      input.recipientUserId,
    );

    return this.transactions.run(
      async (tx) => {
        const requestHash = this.idempotency.hashRequest(
          "POST:/v1/settlement-records",
          input,
        );
        const claim = await this.idempotency.claim<SettlementRecordDto>(
          tx,
          senderUserId,
          key,
          requestHash,
        );

        if (claim.kind === "replay") {
          return claim.response.body as SettlementRecordDto;
        }

        const settlementRecord = await tx.settlementRecord.create({
          data: {
            senderUserId,
            recipientUserId: input.recipientUserId,
            createdByUserId: senderUserId,
            groupId: input.groupId,
            amountPaise,
            occurredOn: this.dateForDatabase(input.occurredOn),
            note: input.note,
          },
        });

        const response = this.dto(settlementRecord);
        await this.idempotency.complete(tx, claim.recordId, {
          statusCode: 201,
          body: response,
        });

        return response;
      },
    );
  }

  private assertDifferentUsers(senderUserId: string, recipientUserId: string): void {
    if (senderUserId === recipientUserId) {
      throw new ConflictException("Settlement parties must differ");
    }
  }

  private async requireUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }
  }

  private async requireGroupMemberships(
    groupId: string | null | undefined,
    senderUserId: string,
    recipientUserId: string,
  ): Promise<void> {
    if (groupId === undefined || groupId === null) {
      return;
    }

    await this.memberships.requireActiveMember(groupId, senderUserId);
    await this.memberships.requireActiveMember(groupId, recipientUserId);
  }

  private dto(record: any): SettlementRecordDto {
    return {
      id: record.id,
      senderUserId: record.senderUserId,
      recipientUserId: record.recipientUserId,
      amount: this.money.formatPaise(record.amountPaise),
      occurredOn: record.occurredOn.toISOString().slice(0, 10),
      groupId: record.groupId,
      note: record.note,
      createdAt: record.createdAt,
    };
  }

  private dateForDatabase(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
  }
}
