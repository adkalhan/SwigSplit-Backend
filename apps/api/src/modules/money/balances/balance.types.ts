export type BalanceRow = {
  left_user_id: string;
  right_user_id: string;
  net_paise: bigint;
};

export type GroupBalanceRow = BalanceRow & {
  group_id: string;
};

export type FriendBalance = {
  counterpartyUserId: string;
  direction: "you_owe" | "you_are_owed";
  amount: string;
};

export type GroupBalanceEntry = {
  fromUserId: string;
  toUserId: string;
  amount: string;
};

export type BalanceTotals = {
  youOwe: string;
  youAreOwed: string;
};

export type PaiseTotals = {
  youOwe: bigint;
  youAreOwed: bigint;
};

export type GroupPaiseTotals = PaiseTotals & {
  totalOutstanding: bigint;
};

export type GroupBalanceSummary = BalanceTotals & {
  groupId: string;
  groupName: string;
  totalOutstanding: string;
};

export type BalanceOverview = {
  friendBalances: FriendBalance[];
  groupBalances: GroupBalanceSummary[];
  totals: BalanceTotals;
};
