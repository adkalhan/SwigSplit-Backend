import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ENVIRONMENT } from "../../shared/config/config.module.js";
import type { Environment } from "../../shared/config/environment.js";

@Injectable()
export class InviteTokenService {
  public constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {}

  public create(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: this.hash(token) };
  }

  public hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  public signupUrl(token: string): string {
    const url = new URL("/signup", this.environment.APP_WEB_URL);
    url.searchParams.set("invite", token);
    return url.toString();
  }
}
