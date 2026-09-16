import { BadRequestException, Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import type { ZodType } from "zod";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser, type AuthenticatedUser } from "../auth/auth-user.js";
import { groupIdSchema } from "../groups/dto/group-input.dto.js";
import type { AppInviteDto, GroupInviteDto } from "./dto/invitation.dto.js";
import { redeemInviteSchema } from "./invitation.schemas.js";
import { InvitationsService } from "./invitations.service.js";

@Controller("v1")
@UseGuards(AuthGuard)
export class InvitationsController {
  public constructor(private readonly invitations: InvitationsService) {}

  @Post("app-invites")
  public async createAppInvite(): Promise<AppInviteDto> {
    return this.invitations.createAppInvite();
  }

  @Post("groups/:groupId/invites")
  public async createGroupInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("groupId") groupId: string,
  ): Promise<GroupInviteDto> {
    return this.invitations.createGroupInvite(user.id, parseInput(groupIdSchema, groupId));
  }

  @Post("invites/redeem")
  public async redeem(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<void> {
    const { inviteToken } = parseInput(redeemInviteSchema, body);
    await this.invitations.redeemForAuthenticatedUser(inviteToken, user.id);
  }
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException("Request validation failed");
  return result.data;
}
