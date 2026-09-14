import { ConflictException, Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma, type User } from "@prisma/client";
import { PrismaService } from "../../shared/database/prisma.service.js";
import type { RegisterInput } from "./auth.schemas.js";
import { SessionService } from "./session.service.js";
import { UsersService } from "../users/users.service.js";
import { TokenService } from "./token.service.js";

export const INVITE_REDEMPTION_PORT = Symbol("INVITE_REDEMPTION_PORT");

export interface InviteRedemptionPort {
  redeem(tx: Prisma.TransactionClient, inviteToken: string, userId: string): Promise<void>;
}

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    @Optional() @Inject(INVITE_REDEMPTION_PORT) private readonly inviteRedemption?: InviteRedemptionPort,
  ) {}

  public async register(input: RegisterInput): Promise<AuthResponse> {
    let registration: { user: User; session: { id: string; userId: string; refreshToken: string } };
    try {
      registration = await this.createRegistration(input);
    } catch (error) {
      if (!this.isPhoneUniquenessConflict(error)) throw error;
      registration = await this.createRegistration(input);
    }
    return this.issueResponse(registration.session);
  }

  private async createRegistration(
    input: RegisterInput,
  ): Promise<{ user: User; session: { id: string; userId: string; refreshToken: string } }> {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.users.findByPhone(tx, input.phone) ?? await this.users.create(tx, input.phone);
      if (input.inviteToken) {
        if (!this.inviteRedemption) {
          throw new ConflictException("Invite redemption is not available");
        }
        await this.inviteRedemption.redeem(tx, input.inviteToken, user.id);
      }
      const session = await this.sessions.create(user.id, tx);
      return { user, session };
    });
  }

  public async refresh(refreshToken: string): Promise<AuthResponse> {
    const session = await this.sessions.rotate(refreshToken);
    return this.issueResponse(session);
  }

  public async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }

  private isPhoneUniquenessConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.includes("phone_e164")
      : typeof target === "string" && target.includes("phone_e164");
  }

  private async issueResponse(session: { id: string; userId: string; refreshToken: string }): Promise<AuthResponse> {
    return {
      accessToken: await this.tokens.signAccessToken({ userId: session.userId, sessionId: session.id }),
      refreshToken: session.refreshToken,
    };
  }
}
