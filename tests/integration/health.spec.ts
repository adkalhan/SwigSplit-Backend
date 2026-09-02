import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { HealthModule } from "../../apps/api/src/modules/health/health.module.js";
import { HealthService } from "../../apps/api/src/modules/health/health.service.js";
import { HttpExceptionFilter } from "../../apps/api/src/shared/errors/http-exception.filter.js";

describe("operational endpoints", () => {
  let app: NestFastifyApplication;
  let readiness: { checkReadiness: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    readiness = { checkReadiness: vi.fn() };
    const module = await Test.createTestingModule({ imports: [HealthModule] })
      .overrideProvider(HealthService)
      .useValue(readiness)
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => { await app.close(); });

  it("returns liveness without checking dependencies", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(readiness.checkReadiness).not.toHaveBeenCalled();
  });

  it.each([
    [{ database: "ok", redis: "ok" }, 200],
    [{ database: "unavailable", redis: "ok" }, 503],
    [{ database: "ok", redis: "unavailable" }, 503],
  ] as const)("reports readiness for %o", async (dependencies, expectedStatus) => {
    readiness.checkReadiness.mockResolvedValue(dependencies);
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(expectedStatus);
    expect(response.json()).toMatchObject({ status: expectedStatus === 200 ? "ok" : "unavailable", dependencies });
  });
});
