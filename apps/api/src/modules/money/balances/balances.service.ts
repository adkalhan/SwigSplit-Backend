import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared/database/prisma.service.js";
import { GroupMembershipService } from "../../groups/group-membership.service.js";
import { MoneyService } from "../shared/money.service.js";
import type {
  BalanceOverview,
  BalanceRow,
  BalanceTotals,
  FriendBalance,
  GroupBalanceEntry,
  GroupPaiseTotals,
  GroupBalanceRow,
  GroupBalanceSummary,
  PaiseTotals,
} from "./balance.types.js";

@Injectable()
export class BalancesService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: GroupMembershipService,
    private readonly money: MoneyService,
  ) {}

  // Returns every non-zero balance between the caller and people they have interacted with.
  public async friendBalances(userId: string): Promise<FriendBalance[]> {
    const balances = await this.queryBalances(null, userId);
    return balances.map((balance) => this.toFriendBalance(userId, balance));
  }

  // Returns all balance data needed to render the user's friend and group landing-page views.
  public async overview(userId: string): Promise<BalanceOverview> {
    const [friendRows, groupRows, memberships] = await Promise.all([
      this.queryBalances(null, userId),
      this.queryGroupBalances(userId),
      this.prisma.groupMember.findMany({
        where: {
          userId,
          status: "ACTIVE",
        },
        select: {
          group: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const friendBalances = friendRows.map((balance) => {
      return this.toFriendBalance(userId, balance);
    });
    const totals = this.totalForRows(userId, friendRows);
    const groupBalances = this.groupSummaries(userId, groupRows, memberships);

    return {
      friendBalances,
      groupBalances,
      totals: this.formatTotals(totals),
    };
  }

  public async groupBalance(
    userId: string,
    groupId: string,
  ): Promise<{ groupId: string; balances: GroupBalanceEntry[] }> {
    await this.memberships.requireActiveMember(groupId, userId);

    const balances = await this.queryBalances(groupId);
    return {
      groupId,
      balances: balances.map((balance) => this.toGroupBalanceEntry(balance)),
    };
  }

  private toFriendBalance(userId: string, balance: BalanceRow): FriendBalance {
    const callerIsLeftUser = balance.left_user_id === userId;
    let counterpartyUserId = balance.left_user_id;
    let callerOwesMoney = balance.net_paise < 0n;

    if (callerIsLeftUser) {
      counterpartyUserId = balance.right_user_id;
      callerOwesMoney = balance.net_paise > 0n;
    }

    let direction: FriendBalance["direction"] = "you_are_owed";
    if (callerOwesMoney) {
      direction = "you_owe";
    }

    return {
      counterpartyUserId,
      direction,
      amount: this.money.formatPaise(this.absolutePaise(balance.net_paise)),
    };
  }

  private toGroupBalanceEntry(balance: BalanceRow): GroupBalanceEntry {
    const leftUserOwesRightUser = balance.net_paise > 0n;
    let fromUserId = balance.right_user_id;
    let toUserId = balance.left_user_id;

    if (leftUserOwesRightUser) {
      fromUserId = balance.left_user_id;
      toUserId = balance.right_user_id;
    }

    return {
      fromUserId,
      toUserId,
      amount: this.money.formatPaise(this.absolutePaise(balance.net_paise)),
    };
  }

  private absolutePaise(value: bigint): bigint {
    if (value < 0n) {
      return -value;
    }

    return value;
  }

  // Adds the caller's debit or credit from each pairwise balance without netting different counterparties.
  private totalForRows(userId: string, balances: BalanceRow[]): PaiseTotals {
    const totals: PaiseTotals = {
      youOwe: 0n,
      youAreOwed: 0n,
    };

    for (const balance of balances) {
      const amount = this.absolutePaise(balance.net_paise);
      if (this.userOwes(userId, balance)) {
        totals.youOwe += amount;
        continue;
      }

      totals.youAreOwed += amount;
    }

    return totals;
  }

  // Builds the caller's position and every group's total outstanding debt for active memberships.
  private groupSummaries(
    userId: string,
    balances: GroupBalanceRow[],
    memberships: Array<{ group: { id: string; name: string } }>,
  ): GroupBalanceSummary[] {
    const totalsByGroupId = new Map<string, GroupPaiseTotals>();

    for (const balance of balances) {
      let totals = totalsByGroupId.get(balance.group_id);
      if (!totals) {
        totals = {
          youOwe: 0n,
          youAreOwed: 0n,
          totalOutstanding: 0n,
        };
        totalsByGroupId.set(balance.group_id, totals);
      }

      const amount = this.absolutePaise(balance.net_paise);
      totals.totalOutstanding += amount;

      if (!this.userIsInBalance(userId, balance)) {
        continue;
      }

      if (this.userOwes(userId, balance)) {
        totals.youOwe += amount;
        continue;
      }

      totals.youAreOwed += amount;
    }

    return memberships.map((membership) => {
      let totals = totalsByGroupId.get(membership.group.id);
      if (!totals) {
        totals = {
          youOwe: 0n,
          youAreOwed: 0n,
          totalOutstanding: 0n,
        };
      }

      return {
        groupId: membership.group.id,
        groupName: membership.group.name,
        totalOutstanding: this.money.formatPaise(totals.totalOutstanding),
        ...this.formatTotals(totals),
      };
    });
  }

  // Converts internal paise totals into decimal strings that are safe to return in JSON.
  private formatTotals(totals: PaiseTotals): BalanceTotals {
    return {
      youOwe: this.money.formatPaise(totals.youOwe),
      youAreOwed: this.money.formatPaise(totals.youAreOwed),
    };
  }

  // Determines whether the caller is the owing side of a normalized pairwise balance.
  private userOwes(userId: string, balance: BalanceRow): boolean {
    const callerIsLeftUser = balance.left_user_id === userId;
    if (callerIsLeftUser) {
      return balance.net_paise > 0n;
    }

    return balance.net_paise < 0n;
  }

  // Checks whether a normalized pairwise balance belongs to the current user.
  private userIsInBalance(userId: string, balance: BalanceRow): boolean {
    return balance.left_user_id === userId || balance.right_user_id === userId;
  }

  // Aggregates either all pairs in one group or every pair involving one specified user.
  private queryBalances(
    groupId: string | null,
    userId: string | null = null,
  ): Promise<BalanceRow[]> {
    return this.prisma.$queryRaw<BalanceRow[]>`
      WITH movements AS (
        SELECT
          ep.user_id AS from_user_id,
          e.payer_user_id AS to_user_id,
          ep.share_paise::numeric AS amount_paise
        FROM expenses e
        JOIN expense_participants ep ON ep.expense_id = e.id
        WHERE e.status = 'ACTIVE'
          AND ep.user_id <> e.payer_user_id
          AND (
            ${groupId}::uuid IS NULL
            OR e.group_id = ${groupId}::uuid
          )
          AND (
            ${userId}::uuid IS NULL
            OR ep.user_id = ${userId}::uuid
            OR e.payer_user_id = ${userId}::uuid
          )

        UNION ALL

        SELECT
          recipient_user_id AS from_user_id,
          sender_user_id AS to_user_id,
          amount_paise::numeric AS amount_paise
        FROM settlement_records
        WHERE (
          ${groupId}::uuid IS NULL
          OR group_id = ${groupId}::uuid
        )
          AND (
            ${userId}::uuid IS NULL
            OR sender_user_id = ${userId}::uuid
            OR recipient_user_id = ${userId}::uuid
          )
      ), normalized AS (
        SELECT
          LEAST(from_user_id, to_user_id) AS left_user_id,
          GREATEST(from_user_id, to_user_id) AS right_user_id,
          CASE
            WHEN from_user_id = LEAST(from_user_id, to_user_id)
              THEN amount_paise
            ELSE -amount_paise
          END AS signed_paise
        FROM movements
      )
      SELECT
        left_user_id,
        right_user_id,
        SUM(signed_paise)::bigint AS net_paise
      FROM normalized
      GROUP BY left_user_id, right_user_id
      HAVING SUM(signed_paise) <> 0
    `;
  }

  // Aggregates every pair in groups where the caller is active while retaining each group ID.
  private queryGroupBalances(userId: string): Promise<GroupBalanceRow[]> {
    return this.prisma.$queryRaw<GroupBalanceRow[]>`
      WITH movements AS (
        SELECT
          e.group_id,
          ep.user_id AS from_user_id,
          e.payer_user_id AS to_user_id,
          ep.share_paise::numeric AS amount_paise
        FROM expenses e
        JOIN expense_participants ep ON ep.expense_id = e.id
        JOIN group_members gm ON gm.group_id = e.group_id
        WHERE e.status = 'ACTIVE'
          AND e.group_id IS NOT NULL
          AND ep.user_id <> e.payer_user_id
          AND gm.user_id = ${userId}::uuid
          AND gm.status = 'ACTIVE'

        UNION ALL

        SELECT
          sr.group_id,
          sr.recipient_user_id AS from_user_id,
          sr.sender_user_id AS to_user_id,
          sr.amount_paise::numeric AS amount_paise
        FROM settlement_records sr
        JOIN group_members gm ON gm.group_id = sr.group_id
        WHERE sr.group_id IS NOT NULL
          AND gm.user_id = ${userId}::uuid
          AND gm.status = 'ACTIVE'
      ), normalized AS (
        SELECT
          group_id,
          LEAST(from_user_id, to_user_id) AS left_user_id,
          GREATEST(from_user_id, to_user_id) AS right_user_id,
          CASE
            WHEN from_user_id = LEAST(from_user_id, to_user_id)
              THEN amount_paise
            ELSE -amount_paise
          END AS signed_paise
        FROM movements
      )
      SELECT
        group_id,
        left_user_id,
        right_user_id,
        SUM(signed_paise)::bigint AS net_paise
      FROM normalized
      GROUP BY group_id, left_user_id, right_user_id
      HAVING SUM(signed_paise) <> 0
    `;
  }
}
