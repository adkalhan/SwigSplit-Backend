export type GroupMemberDto = {
  userId: string;
  phone: string;
  status: "active" | "removed";
  joinedAt: Date;
  lastJoinedAt: Date;
};

export type GroupDto = {
  id: string;
  name: string;
  createdAt: Date;
  members: GroupMemberDto[];
};

export type GroupSummaryDto = Pick<GroupDto, "id" | "name" | "createdAt">;
