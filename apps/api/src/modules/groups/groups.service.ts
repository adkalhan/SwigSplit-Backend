import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BullMqService } from "../../shared/database/bullmq.service.js";
import { PrismaService } from "../../shared/database/prisma.service.js";
import type { GroupDto, GroupSummaryDto } from "./dto/group.dto.js";
import type { CreateGroupDto, UpdateGroupDto } from "./dto/group-input.dto.js";
import { GroupMembershipService } from "./group-membership.service.js";

@Injectable()
export class GroupsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: GroupMembershipService,
    private readonly queue: BullMqService,
  ) {}

  public async create(ownerId: string, input: CreateGroupDto): Promise<GroupDto> {
    const group = await this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({ data: { name: input.name } });
      await tx.groupMember.create({
        data: { groupId: group.id, userId: ownerId, status: "ACTIVE" },
      });
      return group;
    });
    return this.findOne(ownerId, group.id);
  }

  public async findAll(userId: string): Promise<GroupSummaryDto[]> {
    return this.prisma.group.findMany({
      where: { archivedAt: null, members: { some: { userId, status: "ACTIVE" } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true },
    });
  }

  public async findOne(userId: string, groupId: string): Promise<GroupDto> {
    await this.memberships.requireActiveMember(groupId, userId);
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        archivedAt: null,
        members: { some: { userId, status: "ACTIVE" } },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        members: {
          where: { status: "ACTIVE" },
          orderBy: { joinedAt: "asc" },
          select: {
            userId: true,
            status: true,
            joinedAt: true,
            lastJoinedAt: true,
            user: { select: { phoneE164: true } },
          },
        },
      },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }
    return {
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      members: group.members.map((member) => ({
        userId: member.userId,
        phone: member.user.phoneE164,
        status: member.status === "ACTIVE" ? "active" : "removed",
        joinedAt: member.joinedAt,
        lastJoinedAt: member.lastJoinedAt,
      })),
    };
  }

  public async update(userId: string, groupId: string, input: UpdateGroupDto): Promise<GroupDto> {
    await this.memberships.requireActiveMember(groupId, userId);
    const updated = await this.prisma.group.updateMany({
      where: { id: groupId, archivedAt: null },
      data: { name: input.name },
    });
    if (updated.count !== 1) {
      throw new NotFoundException("Group not found");
    }
    return this.findOne(userId, groupId);
  }

  public async archive(userId: string, groupId: string): Promise<void> {
    await this.memberships.requireActiveMember(groupId, userId);
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
    const archived = await this.prisma.group.updateMany({
      where: { id: groupId, archivedAt: null },
      data: { archivedAt: now, purgeAfter },
    });
    if (archived.count !== 1) {
      throw new NotFoundException("Group not found");
    }
    await this.queue.enqueue("purge-group", { groupId }, {
      delay: purgeAfter.getTime() - now.getTime(),
      jobId: this.purgeJobId(groupId),
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  public async restore(userId: string, groupId: string): Promise<GroupDto> {
    await this.memberships.requireActiveMember(groupId, userId);
    const restored = await this.prisma.group.updateMany({
      where: { id: groupId, archivedAt: { not: null }, purgeAfter: { gt: new Date() } },
      data: { archivedAt: null, purgeAfter: null },
    });
    if (restored.count !== 1) {
      throw new ConflictException("This group cannot be restored");
    }
    await this.queue.remove(this.purgeJobId(groupId));
    return this.findOne(userId, groupId);
  }

  public async deletePermanently(userId: string, groupId: string): Promise<void> {
    await this.memberships.requireActiveMember(groupId, userId);
    const group = await this.prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!group) {
      throw new NotFoundException("Group not found");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.group_invites.deleteMany({ where: { groupId } });
      await tx.groupMember.deleteMany({ where: { groupId } });
      await tx.group.delete({ where: { id: groupId } });
    });
    await this.queue.remove(this.purgeJobId(groupId));
  }

  public async removeMember(requesterId: string, groupId: string, userId: string): Promise<void> {
    await this.memberships.requireActiveMember(groupId, requesterId);
    await this.prisma.$transaction((tx) => this.memberships.remove(tx, groupId, userId));
  }

  private purgeJobId(groupId: string): string {
    return `purge-group-${groupId}`;
  }
}
