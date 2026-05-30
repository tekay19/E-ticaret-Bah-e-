import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, importPKCS8, importSPKI, jwtVerify } from "jose";
import { env, type AuthenticatedUser, type TokenPair, type UserRole } from "@bahce-shop/shared";

const encoder = new TextEncoder();

export class TokenService {
  private async getPrivateKey() {
    return importPKCS8(env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n"), "RS256");
  }

  private async getPublicKey() {
    return importSPKI(env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n"), "RS256");
  }

  async signAccessToken(user: {
    id: string;
    email: string;
    role: UserRole;
    emailVerifiedAt: string | null;
  }) {
    const privateKey = await this.getPrivateKey();

    return new SignJWT({
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(`${env.JWT_ACCESS_TOKEN_TTL_MINUTES}m`)
      .sign(privateKey);
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const publicKey = await this.getPublicKey();
    const verified = await jwtVerify(token, publicKey);

    return {
      id: verified.payload.sub ?? "",
      email: typeof verified.payload.email === "string" ? verified.payload.email : "",
      role: verified.payload.role as UserRole,
      emailVerifiedAt:
        typeof verified.payload.emailVerifiedAt === "string"
          ? verified.payload.emailVerifiedAt
          : null,
    };
  }

  async issueTokenPair(user: {
    id: string;
    email: string;
    role: UserRole;
    emailVerifiedAt: string | null;
  }): Promise<TokenPair & { refreshTokenHash: string; familyId: string; refreshExpiresAt: string }> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = randomBytes(32).toString("hex");
    const refreshTokenHash = this.hashOpaqueToken(refreshToken);
    const refreshExpiresAt = new Date(
      Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    return {
      accessToken,
      refreshToken,
      refreshTokenHash,
      familyId: randomUUID(),
      refreshExpiresAt,
    };
  }

  issueSingleUseToken() {
    const token = randomBytes(32).toString("hex");

    return {
      token,
      tokenHash: this.hashOpaqueToken(token),
    };
  }

  hashOpaqueToken(token: string) {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
}
