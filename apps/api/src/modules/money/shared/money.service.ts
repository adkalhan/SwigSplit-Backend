import { BadRequestException, Injectable } from "@nestjs/common";
import {
  MAXIMUM_AMOUNT_PAISE,
  MINIMUM_AMOUNT_PAISE,
  PAISE_PER_RUPEE,
} from "./money.constants.js";
import type { ExactShareInput } from "./money.types.js";

const RUPEE_DECIMAL = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

@Injectable()
export class MoneyService {
  // Converts a client-supplied rupee amount into validated integer paise for database storage.
  public parsePositiveRupees(value: string): bigint {
    const match = RUPEE_DECIMAL.exec(value);
    if (!match) throw new BadRequestException("amount must be an exact decimal rupee string");

    const wholeRupees = BigInt(match[1]);
    let fractionalRupees = "";
    if (match[2] !== undefined) {
      fractionalRupees = match[2];
    }

    const twoDigitPaise = fractionalRupees.padEnd(2, "0");
    const paise = wholeRupees * PAISE_PER_RUPEE + BigInt(twoDigitPaise);
    if (paise < MINIMUM_AMOUNT_PAISE || paise > MAXIMUM_AMOUNT_PAISE) {
      throw new BadRequestException("amount must be between 0.01 and 100000.00 rupees");
    }
    return paise;
  }

  // Converts stored paise into a fixed two-decimal rupee string for API responses.
  public formatPaise(value: bigint): string {
    const isNegative = value < 0n;
    let unsignedPaise = value;
    if (isNegative) {
      unsignedPaise = -value;
    }

    const wholeRupees = unsignedPaise / PAISE_PER_RUPEE;
    const remainingPaise = unsignedPaise % PAISE_PER_RUPEE;
    const twoDigitPaise = remainingPaise.toString().padStart(2, "0");
    let sign = "";
    if (isNegative) {
      sign = "-";
    }

    return `${sign}${wholeRupees}.${twoDigitPaise}`;
  }

  public assertExactShares(amountPaise: bigint, shares: ExactShareInput[]): Map<string, bigint> {
    if (shares.length === 0) throw new BadRequestException("at least one participant is required");

    const parsed = new Map<string, bigint>();
    let total = 0n;
    for (const share of shares) {
      if (parsed.has(share.userId)) throw new BadRequestException("participants must be unique");
      const sharePaise = this.parsePositiveRupees(share.share);
      parsed.set(share.userId, sharePaise);
      total += sharePaise;
    }
    if (total !== amountPaise) throw new BadRequestException("participant shares must equal the expense amount");
    return parsed;
  }
}
