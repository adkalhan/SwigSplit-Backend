import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { jwtVerify, SignJWT } from "jose";
import { ENVIRONMENT } from "../../shared/config/config.module.js";
import type { Environment } from "../../shared/config/environment.js";

export type AccessTokenClaims = { userId: string; sessionId: string };

@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;

  public constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {
    this.secret = new TextEncoder().encode(environment.ACCESS_TOKEN_SECRET);
  }

  public async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1_000);
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.userId)
      .setAudience("swigsplit-api")
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.environment.ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.secret);
  }

  public async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ["HS256"],
        audience: "swigsplit-api",
      });
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
        throw new Error("Access token is missing required claims");
      }
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw new UnauthorizedException("Authentication is required");
    }
  }
}
