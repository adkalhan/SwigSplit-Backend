import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../shared/database/prisma.service.js";

@Injectable()
export class GroupMembershipService {
  public constructor(private readonly prisma: PrismaService) {}

  public async requireActiveMember(groupId: string, userId: string): Promise<void> {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true },
    });
    if (membership?.status !== "ACTIVE") {
      throw new ForbiddenException("You are not an active member of this group");
    }
  }

  public async add(tx: Prisma.TransactionClient, groupId: string, userId: string): Promise<void> {
    await this.lockActiveGroup(tx, groupId);
    const existing = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true },
    });
    if (existing?.status === "ACTIVE") return;
    if (existing?.status === "REMOVED") {
      throw new ConflictException("This membership must be reactivated");
    }

    await this.ensureCapacity(tx, groupId);
    const now = new Date();
    await tx.groupMember.create({ data: { groupId, userId, status: "ACTIVE", lastJoinedAt: now } });
  }

  public async reactivate(tx: Prisma.TransactionClient, groupId: string, userId: string): Promise<void> {
    await this.lockActiveGroup(tx, groupId);
    const existing = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true },
    });
    if (!existing) {
      throw new ConflictException("This membership does not exist");
    }
    if (existing.status === "ACTIVE") return;

    await this.ensureCapacity(tx, groupId);
    await tx.groupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: { status: "ACTIVE", removedAt: null, lastJoinedAt: new Date() },
    });
  }

  private async lockActiveGroup(tx: Prisma.TransactionClient, groupId: string): Promise<void> {
    const groups = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM groups WHERE id = ${groupId}::uuid AND archived_at IS NULL FOR UPDATE
    `;
    if (groups.length !== 1) {
      throw new NotFoundException("Group not found");
    }
  }

  private async ensureCapacity(tx: Prisma.TransactionClient, groupId: string): Promise<void> {
    const activeCount = await tx.groupMember.count({ where: { groupId, status: "ACTIVE" } });
    if (activeCount >= 20) {
      throw new ConflictException("This group already has 20 active members");
    }
  }

  public async remove(tx: Prisma.TransactionClient, groupId: string, userId: string): Promise<void> {
    const removed = await tx.groupMember.updateMany({
      where: { groupId, userId, status: "ACTIVE" },
      data: { status: "REMOVED", removedAt: new Date() },
    });
    if (removed.count !== 1) {
      throw new ConflictException("This user is not an active member of this group");
    }
  }
}
