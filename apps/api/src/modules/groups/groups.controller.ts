import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { ZodType } from "zod";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser, type AuthenticatedUser } from "../auth/auth-user.js";
import type { GroupDto, GroupSummaryDto } from "./dto/group.dto.js";
import { createGroupSchema, groupIdSchema, updateGroupSchema } from "./dto/group-input.dto.js";
import { GroupsService } from "./groups.service.js";

@Controller("v1/groups")
@UseGuards(AuthGuard)
export class GroupsController {
  public constructor(private readonly groups: GroupsService) {}

  @Post()
  public async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<GroupDto> {
    return this.groups.create(user.id, parseInput(createGroupSchema, body));
  }

  @Get()
  public async findAll(@CurrentUser() user: AuthenticatedUser): Promise<GroupSummaryDto[]> {
    return this.groups.findAll(user.id);
  }

  @Get(":groupId")
  public async findOne(@CurrentUser() user: AuthenticatedUser, @Param("groupId") groupId: string): Promise<GroupDto> {
    return this.groups.findOne(user.id, parseInput(groupIdSchema, groupId));
  }

  @Patch(":groupId")
  public async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("groupId") groupId: string,
    @Body() body: unknown,
  ): Promise<GroupDto> {
    return this.groups.update(user.id, parseInput(groupIdSchema, groupId), parseInput(updateGroupSchema, body));
  }

  @Delete(":groupId")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async archive(@CurrentUser() user: AuthenticatedUser, @Param("groupId") groupId: string): Promise<void> {
    await this.groups.archive(user.id, parseInput(groupIdSchema, groupId));
  }

  @Post(":groupId/restore")
  public async restore(@CurrentUser() user: AuthenticatedUser, @Param("groupId") groupId: string): Promise<GroupDto> {
    return this.groups.restore(user.id, parseInput(groupIdSchema, groupId));
  }

  @Delete(":groupId/permanently")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deletePermanently(@CurrentUser() user: AuthenticatedUser, @Param("groupId") groupId: string): Promise<void> {
    await this.groups.deletePermanently(user.id, parseInput(groupIdSchema, groupId));
  }

  @Delete(":groupId/members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("groupId") groupId: string,
    @Param("userId") userId: string,
  ): Promise<void> {
    await this.groups.removeMember(user.id, parseInput(groupIdSchema, groupId), parseInput(groupIdSchema, userId));
  }
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException("Request validation failed");
  }
  return result.data;
}
