import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser, type AuthenticatedUser } from "../auth/auth-user.js";
import { UsersService } from "./users.service.js";

@Controller("v1/user")
export class UsersController {
  public constructor(private readonly users: UsersService) {}

  @Get()
  @UseGuards(AuthGuard)
  public async getCurrentUser(@CurrentUser() user: AuthenticatedUser): Promise<{ id: string; phone: string; phoneVerified: boolean }> {
    return this.users.getAuthenticatedUser(user.id);
  }
}
