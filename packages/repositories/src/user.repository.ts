import type { PoolClient } from "pg";
import { BaseRepository } from "./base.repository.js";
import type { UserRecord } from "./types.js";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: UserRecord["role"];
  email_verified_at: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
};

type CreateUserInput = {
  email: string;
  passwordHash: string;
  role?: UserRecord["role"];
};

type UpdateUserInput = Partial<{
  passwordHash: string;
  role: UserRecord["role"];
  emailVerifiedAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
}>;

export class UserRepository extends BaseRepository<
  UserRecord,
  CreateUserInput,
  UpdateUserInput,
  UserRow
> {
  protected tableName = "users";

  protected mapRow(row: UserRow): UserRecord {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role,
      emailVerifiedAt: row.email_verified_at?.toISOString() ?? null,
      failedLoginAttempts: row.failed_login_attempts,
      lockedUntil: row.locked_until?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async create(input: CreateUserInput, client?: PoolClient): Promise<UserRecord> {
    const result = await this.getExecutor(client).query<UserRow>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.email, input.passwordHash, input.role ?? "customer"],
    );

    return this.mapRow(result.rows[0]);
  }

  async update(
    id: string,
    input: UpdateUserInput,
    client?: PoolClient,
  ): Promise<UserRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.passwordHash !== undefined) {
      values.push(input.passwordHash);
      fields.push(`password_hash = $${values.length}`);
    }
    if (input.role !== undefined) {
      values.push(input.role);
      fields.push(`role = $${values.length}`);
    }
    if (input.emailVerifiedAt !== undefined) {
      values.push(input.emailVerifiedAt);
      fields.push(`email_verified_at = $${values.length}`);
    }
    if (input.failedLoginAttempts !== undefined) {
      values.push(input.failedLoginAttempts);
      fields.push(`failed_login_attempts = $${values.length}`);
    }
    if (input.lockedUntil !== undefined) {
      values.push(input.lockedUntil);
      fields.push(`locked_until = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    values.push(id);
    const result = await this.getExecutor(client).query<UserRow>(
      `UPDATE users
       SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByEmail(email: string, client?: PoolClient): Promise<UserRecord | null> {
    const result = await this.getExecutor(client).query<UserRow>(
      `SELECT * FROM users WHERE email = $1`,
      [email],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
}
