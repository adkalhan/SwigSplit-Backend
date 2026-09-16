import { Module } from "@nestjs/common";
import { GroupMembershipService } from "./group-membership.service.js";
import { GroupsController } from "./groups.controller.js";
import { GroupsService } from "./groups.service.js";

@Module({
  controllers: [GroupsController],
  providers: [GroupMembershipService, GroupsService],
  exports: [GroupMembershipService],
})
export class GroupsModule {}
