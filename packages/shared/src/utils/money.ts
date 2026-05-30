import { ValidationError } from "../errors/auth-errors.js";

export class Money {
  constructor(private readonly cents: bigint) {
    if (cents < 0n) {
      throw new ValidationError("Para degeri negatif olamaz.");
    }
  }

  static fromCents(cents: number | bigint | string) {
    return new Money(BigInt(cents));
  }

  toCents() {
    return this.cents;
  }

  toNumber() {
    return Number(this.cents);
  }

  toFormattedTRY() {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
    }).format(Number(this.cents) / 100);
  }
}
