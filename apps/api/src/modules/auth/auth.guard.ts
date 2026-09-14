import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { PrismaService } from "../../shared/database/prisma.service.js";
import type { AuthenticatedUser } from "./auth-user.js";
import { TokenService } from "./token.service.js";

type AuthenticatedRequest = FastifyRequest & { authenticatedUser?: AuthenticatedUser };

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException("Authentication is required");
    }

    const claims = await this.tokens.verifyAccessToken(authorization.slice("Bearer ".length));
    const session = await this.prisma.session.findFirst({
      where: {
        id: claims.sessionId,
        userId: claims.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true },
    });
    if (!session) {
      throw new UnauthorizedException("Authentication is required");
    }

    request.authenticatedUser = { id: session.userId, sessionId: session.id };
    return true;
  }
}
