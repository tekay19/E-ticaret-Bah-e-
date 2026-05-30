import { withTransaction } from "@bahce-shop/db";
import {
  ConflictError,
  ForbiddenError,
  InvalidCredentialsError,
  AccountLockedError,
  UnauthorizedError,
  ValidationError,
  env,
} from "@bahce-shop/shared";
import {
  CustomerRepository,
  EmailVerificationTokenRepository,
  PasswordResetTokenRepository,
  RefreshTokenRepository,
  UserRepository,
} from "@bahce-shop/repositories";
import { createEmailQueue } from "@bahce-shop/workers";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";

type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type PublicUser = {
  id: string;
  email: string;
  role: string;
  emailVerifiedAt: string | null;
};

type RefreshResult =
  | {
      reused: false;
      user: PublicUser;
      accessToken: string;
      refreshToken: string;
    }
  | {
      reused: true;
    };

export class AuthService {
  private readonly users = new UserRepository();
  private readonly customers = new CustomerRepository();
  private readonly refreshTokens = new RefreshTokenRepository();
  private readonly emailVerificationTokens = new EmailVerificationTokenRepository();
  private readonly passwordResetTokens = new PasswordResetTokenRepository();
  private readonly passwords = new PasswordService();
  private readonly tokens = new TokenService();
  private readonly emailQueue = createEmailQueue();

  async register(input: RegisterInput) {
    const existingUser = await this.users.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictError("Bu email adresi zaten kayitli.", "email_in_use");
    }

    const passwordHash = await this.passwords.hash(input.password);

    const result = await withTransaction(async (client) => {
      const user = await this.users.create(
        {
          email: input.email,
          passwordHash,
        },
        client,
      );

      await this.customers.create(
        {
          userId: user.id,
          fullName: input.fullName,
          phone: input.phone ?? null,
        },
        client,
      );

      const token = this.tokens.issueSingleUseToken();
      await this.emailVerificationTokens.deleteByUserId(user.id, client);
      await this.emailVerificationTokens.create(
        {
          userId: user.id,
          tokenHash: token.tokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        client,
      );

      return {
        user,
        verificationToken: token.token,
      };
    });

    await this.emailQueue.add("verify-email", {
      to: result.user.email,
      template: "verify-email",
      vars: {
        verificationUrl: `${env.WEB_BASE_URL}/#verify-email?token=${result.verificationToken}`,
      },
    });

    return {
      user: this.toPublicUser(result.user),
    };
  }

  async login(input: LoginInput) {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw new AccountLockedError(user.lockedUntil);
    }

    const isValid = await this.passwords.verify(input.password, user.passwordHash);
    if (!isValid) {
      const nextAttempts = user.failedLoginAttempts + 1;
      const lockedUntil =
        nextAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

      await this.users.update(user.id, {
        failedLoginAttempts: nextAttempts,
        lockedUntil,
      });

      if (lockedUntil) {
        throw new AccountLockedError(lockedUntil);
      }

      throw new InvalidCredentialsError();
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenError("Email adresinizi dogrulamadan giris yapamazsiniz.");
    }

    await this.users.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    const pair = await this.tokens.issueTokenPair(user);
    await this.refreshTokens.create({
      userId: user.id,
      familyId: pair.familyId,
      tokenHash: pair.refreshTokenHash,
      expiresAt: pair.refreshExpiresAt,
    });

    return {
      user: this.toPublicUser(user),
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.tokens.hashOpaqueToken(refreshToken);
    const result = await withTransaction<RefreshResult>(async (client) => {
      const record = await this.refreshTokens.findByTokenHashForUpdate(tokenHash, client);

      if (!record || new Date(record.expiresAt) <= new Date() || record.revokedAt) {
        throw new UnauthorizedError("Refresh token gecersiz veya suresi dolmus.");
      }

      if (record.usedAt) {
        await this.refreshTokens.revokeFamily(record.familyId, client);
        return { reused: true };
      }

      const user = await this.users.findById(record.userId, client);
      if (!user) {
        throw new UnauthorizedError();
      }

      if (!user.emailVerifiedAt) {
        throw new ForbiddenError("Email adresinizi dogrulamadan oturum yenileyemezsiniz.");
      }

      const nextPair = await this.tokens.issueTokenPair(user);

      await this.refreshTokens.update(
        record.id,
        {
          usedAt: new Date().toISOString(),
        },
        client,
      );

      await this.refreshTokens.create(
        {
          userId: user.id,
          familyId: record.familyId,
          tokenHash: nextPair.refreshTokenHash,
          expiresAt: nextPair.refreshExpiresAt,
        },
        client,
      );

      return {
        reused: false,
        user: this.toPublicUser(user),
        accessToken: nextPair.accessToken,
        refreshToken: nextPair.refreshToken,
      };
    });

    if (result.reused) {
      throw new UnauthorizedError("Refresh token yeniden kullanildi, tum oturumlar iptal edildi.");
    }

    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  async logout(refreshToken: string) {
    const tokenHash = this.tokens.hashOpaqueToken(refreshToken);
    const record = await this.refreshTokens.findByTokenHash(tokenHash);

    if (!record) {
      return { success: true };
    }

    await this.refreshTokens.update(record.id, {
      revokedAt: new Date().toISOString(),
    });

    return { success: true };
  }

  async verifyEmail(token: string) {
    const tokenHash = this.tokens.hashOpaqueToken(token);
    const record = await this.emailVerificationTokens.findByTokenHash(tokenHash);

    if (!record || new Date(record.expiresAt) <= new Date()) {
      throw new ValidationError("Email dogrulama token'i gecersiz veya suresi dolmus.");
    }

    const updatedUser = await withTransaction(async (client) => {
      const user = await this.users.update(
        record.userId,
        {
          emailVerifiedAt: new Date().toISOString(),
        },
        client,
      );

      await this.emailVerificationTokens.deleteByTokenHash(tokenHash, client);
      return user;
    });

    if (!updatedUser) {
      throw new ValidationError("Kullanici bulunamadi.");
    }

    return {
      user: this.toPublicUser(updatedUser),
      success: true,
    };
  }

  async forgotPassword(email: string) {
    const user = await this.users.findByEmail(email);
    if (!user) {
      return { success: true };
    }

    const token = this.tokens.issueSingleUseToken();
    await withTransaction(async (client) => {
      await this.passwordResetTokens.deleteByUserId(user.id, client);
      await this.passwordResetTokens.create(
        {
          userId: user.id,
          tokenHash: token.tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        client,
      );
    });

    await this.emailQueue.add("reset-password", {
      to: user.email,
      template: "reset-password",
      vars: {
        resetUrl: `${env.WEB_BASE_URL}/#reset-password?token=${token.token}`,
      },
    });

    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.tokens.hashOpaqueToken(token);
    const record = await this.passwordResetTokens.findByTokenHash(tokenHash);

    if (!record || new Date(record.expiresAt) <= new Date()) {
      throw new ValidationError("Sifre sifirlama token'i gecersiz veya suresi dolmus.");
    }

    const passwordHash = await this.passwords.hash(newPassword);

    await withTransaction(async (client) => {
      await this.users.update(
        record.userId,
        {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
        client,
      );
      await this.passwordResetTokens.deleteByTokenHash(tokenHash, client);
      await this.refreshTokens.revokeByUserId(record.userId, client);
    });

    return { success: true };
  }

  async createAdmin(email: string, password: string) {
    const existingUser = await this.users.findByEmail(email);
    if (existingUser) {
      throw new ConflictError("Bu email adresi zaten kayitli.", "email_in_use");
    }

    const passwordHash = await this.passwords.hash(password);

    const user = await withTransaction(async (client) => {
      const createdUser = await this.users.create(
        {
          email,
          passwordHash,
          role: "admin",
        },
        client,
      );

      await this.customers.create(
        {
          userId: createdUser.id,
          fullName: "Admin User",
        },
        client,
      );

      return this.users.update(
        createdUser.id,
        {
          emailVerifiedAt: new Date().toISOString(),
        },
        client,
      );
    });

    if (!user) {
      throw new ValidationError("Admin kullanici olusturulamadi.");
    }

    return {
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    role: string;
    emailVerifiedAt: string | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }
}
