import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import type { ZodType } from "zod";
import { TokenService } from "../../shared/auth/token.service.js";
import { AuthService, type AuthResponse } from "./auth.service.js";
import { refreshSessionSchema, registerSchema } from "./auth.schemas.js";

@Controller("v1/auth")
export class AuthController {
  public constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Post("register")
  public async register(@Body() body: unknown): Promise<AuthResponse> {
    return this.auth.register(parseBody(registerSchema, body));
  }

  @Post("refresh")
  public async refresh(@Body() body: unknown): Promise<AuthResponse> {
    const { refreshToken } = parseBody(refreshSessionSchema, body);
    return this.auth.refresh(refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async logout(@Headers("authorization") authorization?: string): Promise<void> {
    const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    const claims = await this.tokens.verifyAccessToken(accessToken);
    await this.auth.logout(claims.sessionId);
  }
}

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException("Request validation failed");
  }
  return result.data;
}
