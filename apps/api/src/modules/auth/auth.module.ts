import { Global, Module } from "@nestjs/common";
import { AuthGuard } from "./auth.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";
import { UsersModule } from "../users/users.module.js";
import { TokenService } from "./token.service.js";
import { InvitationsModule } from "../invitations/invitations.module.js";

@Global()
@Module({
  imports: [UsersModule, InvitationsModule],
  controllers: [AuthController],
  providers: [SessionService, TokenService, AuthGuard, AuthService],
  exports: [SessionService, TokenService, AuthGuard, AuthService],
})
export class AuthModule {}
