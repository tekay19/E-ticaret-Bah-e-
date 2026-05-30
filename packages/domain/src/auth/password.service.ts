import argon2 from "argon2";

export class PasswordService {
  async hash(plainText: string) {
    return argon2.hash(plainText, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(plainText: string, hash: string) {
    return argon2.verify(hash, plainText);
  }
}
