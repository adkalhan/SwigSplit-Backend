export type SettlementRecordDto = {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  amount: string;
  occurredOn: string;
  groupId: string | null;
  note: string | null;
  createdAt: Date;
};
