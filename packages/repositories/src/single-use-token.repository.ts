import type { PoolClient } from "pg";
import { BaseRepository } from "./base.repository.js";
import type { SingleUseTokenRecord } from "./types.js";

type SingleUseTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
};

type CreateSingleUseTokenInput = {
  userId: string;
  tokenHash: string;
  expiresAt: string;
};

export abstract class SingleUseTokenRepository extends BaseRepository<
  SingleUseTokenRecord,
  CreateSingleUseTokenInput,
  never,
  SingleUseTokenRow
> {
  protected mapRow(row: SingleUseTokenRow): SingleUseTokenRecord {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      createdAt: row.created_at.toISOString(),
    };
  }

  async create(
    input: CreateSingleUseTokenInput,
    client?: PoolClient,
  ): Promise<SingleUseTokenRecord> {
    const result = await this.getExecutor(client).query<SingleUseTokenRow>(
      `INSERT INTO ${this.tableName} (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.userId, input.tokenHash, input.expiresAt],
    );

    return this.mapRow(result.rows[0]);
  }

  async update(): Promise<SingleUseTokenRecord | null> {
    throw new Error("Single use token repository does not support update");
  }

  async findByTokenHash(
    tokenHash: string,
    client?: PoolClient,
  ): Promise<SingleUseTokenRecord | null> {
    const result = await this.getExecutor(client).query<SingleUseTokenRow>(
      `SELECT * FROM ${this.tableName} WHERE token_hash = $1`,
      [tokenHash],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async deleteByTokenHash(tokenHash: string, client?: PoolClient): Promise<void> {
    await this.getExecutor(client).query(
      `DELETE FROM ${this.tableName} WHERE token_hash = $1`,
      [tokenHash],
    );
  }

  async deleteByUserId(userId: string, client?: PoolClient): Promise<void> {
    await this.getExecutor(client).query(
      `DELETE FROM ${this.tableName} WHERE user_id = $1`,
      [userId],
    );
  }
}
