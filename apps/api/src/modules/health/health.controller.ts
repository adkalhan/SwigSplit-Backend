import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service.js";

@Controller()
export class HealthController {
  public constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get("health")
  public health(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  public async ready(): Promise<{ status: "ok"; dependencies: { database: "ok"; redis: "ok" } }> {
    const dependencies = await this.healthService.checkReadiness();
    if (dependencies.database !== "ok" || dependencies.redis !== "ok") {
      throw new ServiceUnavailableException({ status: "unavailable", dependencies });
    }
    return { status: "ok", dependencies: { database: "ok", redis: "ok" } };
  }
}
