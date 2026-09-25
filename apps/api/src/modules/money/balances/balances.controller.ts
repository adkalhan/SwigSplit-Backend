import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../../auth/auth.guard.js";
import { CurrentUser, type AuthenticatedUser } from "../../auth/auth-user.js";
import { groupIdSchema } from "../../groups/dto/group-input.dto.js";
import { BalancesService } from "./balances.service.js";

@Controller("v1")
@UseGuards(AuthGuard)
export class BalancesController {
  public constructor(private readonly balances: BalancesService) {}

  @Get("balances/friends")
  public friends(@CurrentUser() user: AuthenticatedUser) {
    return this.balances.friendBalances(user.id);
  }

  // Returns all balance data required to render the authenticated user's landing-page summaries.
  @Get("balances/overview")
  public overview(@CurrentUser() user: AuthenticatedUser) {
    return this.balances.overview(user.id);
  }

  @Get("groups/:groupId/balance")
  public group(
    @CurrentUser() user: AuthenticatedUser,
    @Param("groupId") groupId: string,
  ) {
    const validGroupId = groupIdSchema.parse(groupId);
    return this.balances.groupBalance(user.id, validGroupId);
  }
}
