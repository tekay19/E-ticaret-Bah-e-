import type { PoolClient } from "pg";
import { BaseRepository } from "./base.repository.js";
import type { RefreshTokenRecord } from "./types.js";

type RefreshTokenRow = {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

type CreateRefreshTokenInput = {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: string;
};

type UpdateRefreshTokenInput = Partial<{
  usedAt: string | null;
  revokedAt: string | null;
}>;

export class RefreshTokenRepository extends BaseRepository<
  RefreshTokenRecord,
  CreateRefreshTokenInput,
  UpdateRefreshTokenInput,
  RefreshTokenRow
> {
  protected tableName = "refresh_tokens";

  protected mapRow(row: RefreshTokenRow): RefreshTokenRecord {
    return {
      id: row.id,
      userId: row.user_id,
      familyId: row.family_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      usedAt: row.used_at?.toISOString() ?? null,
      revokedAt: row.revoked_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }

  async create(input: CreateRefreshTokenInput, client?: PoolClient): Promise<RefreshTokenRecord> {
    const result = await this.getExecutor(client).query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.userId, input.familyId, input.tokenHash, input.expiresAt],
    );

    return this.mapRow(result.rows[0]);
  }

  async update(
    id: string,
    input: UpdateRefreshTokenInput,
    client?: PoolClient,
  ): Promise<RefreshTokenRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.usedAt !== undefined) {
      values.push(input.usedAt);
      fields.push(`used_at = $${values.length}`);
    }
    if (input.revokedAt !== undefined) {
      values.push(input.revokedAt);
      fields.push(`revoked_at = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    values.push(id);
    const result = await this.getExecutor(client).query<RefreshTokenRow>(
      `UPDATE refresh_tokens
       SET ${fields.join(", ")}
       WHERE id = $${values.length}
       RETURNING *`,
      values,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByTokenHash(tokenHash: string, client?: PoolClient): Promise<RefreshTokenRecord | null> {
    const result = await this.getExecutor(client).query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByTokenHashForUpdate(tokenHash: string, client: PoolClient): Promise<RefreshTokenRecord | null> {
    const result = await this.getExecutor(client).query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async revokeFamily(familyId: string, client?: PoolClient): Promise<void> {
    await this.getExecutor(client).query(
      `UPDATE refresh_tokens
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE family_id = $1`,
      [familyId],
    );
  }

  async revokeByUserId(userId: string, client?: PoolClient): Promise<void> {
    await this.getExecutor(client).query(
      `UPDATE refresh_tokens
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE user_id = $1`,
      [userId],
    );
  }
}
