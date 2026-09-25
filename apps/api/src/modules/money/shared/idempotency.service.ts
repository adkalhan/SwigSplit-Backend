import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { IDEMPOTENCY_RECORD_LIFETIME_MS } from "./money.constants.js";
import type { IdempotencyClaim, StoredIdempotentResponse } from "./idempotency.types.js";

const idempotencyKeySchema = z.string().uuid();

@Injectable()
export class IdempotencyService {
  public requireKey(value: string | undefined): string {
    const parsed = idempotencyKeySchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException("Idempotency-Key must be a UUID");
    return parsed.data;
  }

  public hashRequest(scope: string, body: unknown): string {
    const canonicalBody = this.canonicalJson(body);
    const valueToHash = `${scope}:${canonicalBody}`;

    return createHash("sha256").update(valueToHash, "utf8").digest("hex");
  }

  public async claim<T>(
    tx: Prisma.TransactionClient,
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<IdempotencyClaim<T>> {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO idempotency_records (id, user_id, key, request_hash, expires_at)
      VALUES (gen_random_uuid(), ${userId}::uuid, ${key}, ${requestHash}, ${new Date(Date.now() + IDEMPOTENCY_RECORD_LIFETIME_MS)})
      ON CONFLICT (user_id, key) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 1) {
      return {
        kind: "new",
        recordId: inserted[0].id,
      };
    }

    const existing = await tx.idempotencyRecord.findUnique({
      where: {
        userId_key: { userId, key },
      },
    });

    if (!existing) {
      throw new ConflictException("Idempotency-Key was already used for a different request");
    }

    if (existing.requestHash !== requestHash) {
      throw new ConflictException("Idempotency-Key was already used for a different request");
    }

    if (existing.status !== "COMPLETED" || existing.responseStatus === null) {
      throw new ConflictException("This request is already in progress");
    }

    return {
      kind: "replay",
      response: {
        statusCode: existing.responseStatus,
        body: existing.responseBody as T | null,
      },
    };
  }

  public async complete<T>(
    tx: Prisma.TransactionClient,
    recordId: string,
    response: StoredIdempotentResponse<T>,
  ): Promise<void> {
    if (response.body === null) {
      await tx.idempotencyRecord.update({
        where: { id: recordId },
        data: {
          status: "COMPLETED",
          responseStatus: response.statusCode,
          responseBody: Prisma.JsonNull,
          completedAt: new Date(),
        },
      });
      return;
    }

    await tx.idempotencyRecord.update({
      where: { id: recordId },
      data: {
        status: "COMPLETED",
        responseStatus: response.statusCode,
        responseBody: response.body as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  }

  private canonicalJson(value: unknown): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      const items = value.map((item) => this.canonicalJson(item));
      return `[${items.join(",")}]`;
    }

    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const entries = sortedKeys.map((key) => {
      const serializedKey = JSON.stringify(key);
      const serializedValue = this.canonicalJson(record[key]);
      return `${serializedKey}:${serializedValue}`;
    });

    return `{${entries.join(",")}}`;
  }
}
