import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { ENVIRONMENT } from "../../shared/config/config.module.js";
import { PrismaService } from "../../shared/database/prisma.service.js";
import type { Environment } from "../../shared/config/environment.js";

export type CreatedSession = { id: string; userId: string; refreshToken: string };

@Injectable()
export class SessionService {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  public async create(userId: string, tx: Prisma.TransactionClient): Promise<CreatedSession> {
    const refreshToken = randomBytes(32).toString("base64url");
    const session = await tx.session.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: this.expiryDate(),
      },
    });
    return { id: session.id, userId, refreshToken };
  }

  public async rotate(refreshToken: string): Promise<CreatedSession> {
    const tokenHash = this.hashToken(refreshToken);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.session.findUnique({ where: { tokenHash } });
      if (!current || current.expiresAt <= new Date()) {
        throw new UnauthorizedException("Authentication is required");
      }
      if (current.revokedAt) {
        await this.revokeAllActiveForUser(tx, current.userId);
        throw new UnauthorizedException("Authentication is required");
      }

      const revokedCount = await this.revokeActiveById(tx, current.id);
      if (revokedCount !== 1) {
        await this.revokeAllActiveForUser(tx, current.userId);
        throw new UnauthorizedException("Authentication is required");
      }

      const replacement = await this.create(current.userId, tx);
      await tx.session.update({
        where: { id: current.id },
        data: { replacedBySessionId: replacement.id },
      });
      return replacement;
    }, { isolationLevel: "Serializable" });
  }

  public async revoke(sessionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.revokeActiveById(tx, sessionId);
    });
  }

  private async revokeActiveById(tx: Prisma.TransactionClient, sessionId: string): Promise<number> {
    const result = await tx.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  private async revokeAllActiveForUser(tx: Prisma.TransactionClient, userId: string): Promise<number> {
    const result = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  private expiryDate(): Date {
    return new Date(Date.now() + this.environment.REFRESH_TOKEN_TTL_SECONDS * 1_000);
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
}
