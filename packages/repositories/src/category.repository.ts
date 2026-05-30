import type { PoolClient } from "pg";
import { withTransaction } from "@bahce-shop/db";
import { BaseRepository } from "./base.repository.js";
import type { CategoryRecord, CategoryTreeNode } from "./types.js";

type CategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  sort_order: number;
  is_active: boolean;
  product_count?: string | number | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateCategoryInput = {
  parentId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type UpdateCategoryInput = Partial<Omit<CreateCategoryInput, "parentId">>;

export class CategoryRepository extends BaseRepository<
  CategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryRow
> {
  protected tableName = "categories";

  protected mapRow(row: CategoryRow): CategoryRecord {
    return {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.image_url,
      metaTitle: row.meta_title,
      metaDescription: row.meta_description,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      productCount: row.product_count === undefined || row.product_count === null ? undefined : Number(row.product_count),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async create(input: CreateCategoryInput, client?: PoolClient): Promise<CategoryRecord> {
    const result = await this.getExecutor(client).query<CategoryRow>(
      `INSERT INTO categories (
         parent_id, name, slug, description, image_url, meta_title, meta_description, sort_order, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.parentId ?? null,
        input.name,
        input.slug,
        input.description ?? null,
        input.imageUrl ?? null,
        input.metaTitle ?? null,
        input.metaDescription ?? null,
        input.sortOrder ?? 0,
        input.isActive ?? true,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async update(
    id: string,
    input: UpdateCategoryInput,
    client?: PoolClient,
  ): Promise<CategoryRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const mapping: Record<keyof UpdateCategoryInput, string> = {
      name: "name",
      slug: "slug",
      description: "description",
      imageUrl: "image_url",
      metaTitle: "meta_title",
      metaDescription: "meta_description",
      sortOrder: "sort_order",
      isActive: "is_active",
    };

    for (const [key, column] of Object.entries(mapping) as [
      keyof UpdateCategoryInput,
      string,
    ][]) {
      if (input[key] !== undefined) {
        values.push(input[key]);
        fields.push(`${column} = $${values.length}`);
      }
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    values.push(id);
    const result = await this.getExecutor(client).query<CategoryRow>(
      `UPDATE categories
       SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findBySlug(slug: string, client?: PoolClient): Promise<CategoryRecord | null> {
    const result = await this.getExecutor(client).query<CategoryRow>(
      `SELECT * FROM categories WHERE slug = $1`,
      [slug],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async listActive(client?: PoolClient): Promise<CategoryRecord[]> {
    const result = await this.getExecutor(client).query<CategoryRow>(
      `SELECT c.*, COUNT(p.id)::INT AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = TRUE
       WHERE c.is_active = TRUE
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.name ASC`,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async listAll(client?: PoolClient): Promise<CategoryRecord[]> {
    const result = await this.getExecutor(client).query<CategoryRow>(
      `SELECT c.*, COUNT(p.id)::INT AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.name ASC`,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async getTree(client?: PoolClient): Promise<CategoryTreeNode[]> {
    const categories = await this.listActive(client);
    return this.buildTree(categories);
  }

  async getAdminTree(client?: PoolClient): Promise<CategoryTreeNode[]> {
    const categories = await this.listAll(client);
    return this.buildTree(categories);
  }

  private buildTree(categories: CategoryRecord[]): CategoryTreeNode[] {
    const byId = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    for (const category of categories) {
      byId.set(category.id, { ...category, children: [] });
    }

    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async getDescendants(id: string, client?: PoolClient): Promise<CategoryRecord[]> {
    const result = await this.getExecutor(client).query<CategoryRow>(
      `SELECT c.*
       FROM categories c
       JOIN category_closure cc ON cc.descendant_id = c.id
       WHERE cc.ancestor_id = $1 AND cc.depth > 0
       ORDER BY cc.depth ASC, c.sort_order ASC, c.name ASC`,
      [id],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async getAncestors(id: string, client?: PoolClient): Promise<CategoryRecord[]> {
    const result = await this.getExecutor(client).query<CategoryRow>(
      `SELECT c.*
       FROM categories c
       JOIN category_closure cc ON cc.ancestor_id = c.id
       WHERE cc.descendant_id = $1
       ORDER BY cc.depth DESC`,
      [id],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async move(id: string, newParentId: string | null): Promise<CategoryRecord | null> {
    return withTransaction(async (client) => {
      await client.query(`UPDATE categories SET parent_id = $1, updated_at = NOW() WHERE id = $2`, [
        newParentId,
        id,
      ]);

      await client.query(
        `DELETE FROM category_closure
         WHERE descendant_id IN (
           SELECT descendant_id FROM category_closure WHERE ancestor_id = $1
         )`,
        [id],
      );

      await client.query(
        `WITH RECURSIVE subtree AS (
           SELECT id, parent_id, 0 AS depth FROM categories WHERE id = $1
           UNION ALL
           SELECT c.id, c.parent_id, subtree.depth + 1
           FROM categories c
           JOIN subtree ON c.parent_id = subtree.id
         )
         INSERT INTO category_closure(ancestor_id, descendant_id, depth)
         SELECT parent_path.ancestor_id, subtree.id, parent_path.depth + subtree.depth + 1
         FROM subtree
         JOIN category_closure parent_path ON parent_path.descendant_id = $2
         WHERE $2 IS NOT NULL
         UNION ALL
         SELECT ancestor.id, descendant.id, descendant.depth - ancestor.depth
         FROM subtree ancestor
         JOIN subtree descendant ON descendant.depth >= ancestor.depth`,
        [id, newParentId],
      );

      return this.findById(id, client);
    });
  }

  async deleteIfEmpty(id: string, client?: PoolClient) {
    const usage = await this.getExecutor(client).query<{ product_count: string; child_count: string }>(
      `SELECT
         (SELECT COUNT(*)::TEXT FROM products WHERE category_id = $1) AS product_count,
         (SELECT COUNT(*)::TEXT FROM categories WHERE parent_id = $1) AS child_count`,
      [id],
    );

    if (Number(usage.rows[0]?.product_count ?? 0) > 0 || Number(usage.rows[0]?.child_count ?? 0) > 0) {
      return false;
    }

    return this.deleteById(id, client);
  }
}
