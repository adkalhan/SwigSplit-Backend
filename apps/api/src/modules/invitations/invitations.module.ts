import { Module } from "@nestjs/common";
import { INVITE_REDEMPTION_PORT } from "../auth/auth.service.js";
import { GroupsModule } from "../groups/groups.module.js";
import { InvitationsController } from "./invitations.controller.js";
import { InvitationsService } from "./invitations.service.js";
import { InviteTokenService } from "./invite-token.service.js";

@Module({
  imports: [GroupsModule],
  controllers: [InvitationsController],
  providers: [
    InviteTokenService,
    InvitationsService,
    { provide: INVITE_REDEMPTION_PORT, useExisting: InvitationsService },
  ],
  exports: [INVITE_REDEMPTION_PORT],
})
export class InvitationsModule {}
