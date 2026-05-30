import type { PoolClient, QueryResultRow } from "pg";
import { pool } from "@bahce-shop/db";

type Queryable = PoolClient | typeof pool;

export abstract class BaseRepository<
  T,
  CreateInput,
  UpdateInput,
  Row extends QueryResultRow = QueryResultRow,
> {
  protected abstract tableName: string;
  protected abstract mapRow(row: Row): T;

  protected getExecutor(client?: PoolClient): Queryable {
    return client ?? pool;
  }

  async findById(id: string, client?: PoolClient): Promise<T | null> {
    const result = await this.getExecutor(client).query<Row>(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async deleteById(id: string, client?: PoolClient): Promise<boolean> {
    const result = await this.getExecutor(client).query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  abstract create(input: CreateInput, client?: PoolClient): Promise<T>;
  abstract update(
    id: string,
    input: UpdateInput,
    client?: PoolClient,
  ): Promise<T | null>;
}
