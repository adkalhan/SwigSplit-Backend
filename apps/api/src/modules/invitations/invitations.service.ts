import { ConflictException, Injectable } from "@nestjs/common";
import { InviteStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../shared/database/prisma.service.js";
import type { InviteRedemptionPort } from "../auth/auth.service.js";
import { GroupMembershipService } from "../groups/group-membership.service.js";
import type { AppInviteDto, GroupInviteDto } from "./dto/invitation.dto.js";
import { InviteTokenService } from "./invite-token.service.js";

type LockedInvite = {
  id: string;
  groupId?: string;
  status: InviteStatus;
  expiresAt: Date;
};

@Injectable()
export class InvitationsService implements InviteRedemptionPort {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: GroupMembershipService,
    private readonly tokens: InviteTokenService,
  ) {}

  public async createAppInvite(): Promise<AppInviteDto> {
    const { token, tokenHash } = this.tokens.create();
    const expiresAt = this.inviteExpiry();
    const invite = await this.prisma.app_invites.create({ data: { tokenHash, expiresAt } });
    return { id: invite.id, kind: "app", expiresAt: invite.expiresAt, signupUrl: this.tokens.signupUrl(token) };
  }

  public async createGroupInvite(userId: string, groupId: string): Promise<GroupInviteDto> {
    await this.memberships.requireActiveMember(groupId, userId);
    const { token, tokenHash } = this.tokens.create();
    const expiresAt = this.inviteExpiry();
    const invite = await this.prisma.group_invites.create({ data: { groupId, tokenHash, expiresAt } });
    return { id: invite.id, kind: "group", expiresAt: invite.expiresAt, signupUrl: this.tokens.signupUrl(token) };
  }

  public async redeemForAuthenticatedUser(inviteToken: string, userId: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.redeem(tx, inviteToken, userId));
  }

  public async redeem(tx: Prisma.TransactionClient, inviteToken: string, userId: string): Promise<void> {
    const tokenHash = this.tokens.hash(inviteToken);
    const groupInvites = await tx.$queryRaw<LockedInvite[]>`
      SELECT id, group_id AS "groupId", status, expires_at AS "expiresAt"
      FROM group_invites WHERE token_hash = ${tokenHash} FOR UPDATE
    `;
    const appInvites = await tx.$queryRaw<LockedInvite[]>`
      SELECT id, status, expires_at AS "expiresAt"
      FROM app_invites WHERE token_hash = ${tokenHash} FOR UPDATE
    `;
    if (groupInvites.length + appInvites.length !== 1) {
      throw new ConflictException("This invite is invalid or has already been used");
    }

    const invite = groupInvites[0] ?? appInvites[0];
    if (invite.status !== "PENDING" || invite.expiresAt <= new Date()) {
      throw new ConflictException("This invite is expired or has already been used");
    }

    if (invite.groupId) {
      const membership = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId: invite.groupId, userId } },
        select: { status: true },
      });
      if (!membership) {
        await this.memberships.add(tx, invite.groupId, userId);
      } else if (membership.status === "REMOVED") {
        await this.memberships.reactivate(tx, invite.groupId, userId);
      }
      await tx.group_invites.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      return;
    }
    await tx.app_invites.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
  }

  private inviteExpiry(): Date {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  }
}
