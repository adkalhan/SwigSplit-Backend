import { Module } from "@nestjs/common";
import { TokenService } from "../../shared/auth/token.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";
import { UsersModule } from "../users/users.module.js";

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [SessionService, TokenService, AuthService],
  exports: [SessionService, TokenService, AuthService],
})
export class AuthModule {}
