import type { PoolClient } from "pg";
import { BaseRepository } from "./base.repository.js";
import type { BrandRecord } from "./types.js";

type BrandRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: Date;
};

export type CreateBrandInput = {
  name: string;
  slug: string;
  logoUrl?: string | null;
};

export type UpdateBrandInput = Partial<CreateBrandInput>;

export class BrandRepository extends BaseRepository<
  BrandRecord,
  CreateBrandInput,
  UpdateBrandInput,
  BrandRow
> {
  protected tableName = "brands";

  protected mapRow(row: BrandRow): BrandRecord {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logo_url,
      createdAt: row.created_at.toISOString(),
    };
  }

  async create(input: CreateBrandInput, client?: PoolClient): Promise<BrandRecord> {
    const result = await this.getExecutor(client).query<BrandRow>(
      `INSERT INTO brands (name, slug, logo_url)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.name, input.slug, input.logoUrl ?? null],
    );

    return this.mapRow(result.rows[0]);
  }

  async update(
    id: string,
    input: UpdateBrandInput,
    client?: PoolClient,
  ): Promise<BrandRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      values.push(input.name);
      fields.push(`name = $${values.length}`);
    }
    if (input.slug !== undefined) {
      values.push(input.slug);
      fields.push(`slug = $${values.length}`);
    }
    if (input.logoUrl !== undefined) {
      values.push(input.logoUrl);
      fields.push(`logo_url = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    values.push(id);
    const result = await this.getExecutor(client).query<BrandRow>(
      `UPDATE brands SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async list(client?: PoolClient): Promise<BrandRecord[]> {
    const result = await this.getExecutor(client).query<BrandRow>(
      `SELECT * FROM brands ORDER BY name ASC`,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findBySlug(slug: string, client?: PoolClient): Promise<BrandRecord | null> {
    const result = await this.getExecutor(client).query<BrandRow>(
      `SELECT * FROM brands WHERE slug = $1`,
      [slug],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
}
