export type ExpenseParticipantDto = {
  userId: string;
  share: string;
};

export type ExpenseDto = {
  id: string;
  title: string;
  amount: string;
  occurredOn: string;
  payerUserId: string;
  groupId: string | null;
  status: "active" | "deleted";
  version: number;
  createdAt: Date;
  updatedAt: Date;
  participants: ExpenseParticipantDto[];
};

export type ExpenseSnapshot = {
  title: string;
  amount: string;
  occurredOn: string;
  payerUserId: string;
  groupId: string | null;
  status: "active" | "deleted";
  participants: ExpenseParticipantDto[];
};
