import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared/database/prisma.service.js";
import {
  SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS,
  SERIALIZABLE_TRANSACTION_RETRY_DELAY_MS,
} from "./money.constants.js";

@Injectable()
export class SerializableTransactionService {
  public constructor(private readonly prisma: PrismaService) {}

  // Runs a money mutation serializably and retries only PostgreSQL write-conflict failures.
  public async run<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: "Serializable",
        });
      } catch (error) {
        const hasAttemptsRemaining = attempt < SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS;
        if (!this.isWriteConflict(error) || !hasAttemptsRemaining) {
          throw error;
        }

        await this.waitBeforeRetry(attempt);
      }
    }

    throw new Error("Serializable transaction retry limit was reached");
  }

  // Identifies Prisma's PostgreSQL write-conflict or deadlock error code.
  private isWriteConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    return error.code === "P2034";
  }

  // Adds a short increasing pause before repeating a conflicting transaction.
  private async waitBeforeRetry(attempt: number): Promise<void> {
    const delayMs = SERIALIZABLE_TRANSACTION_RETRY_DELAY_MS * attempt;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }
}
