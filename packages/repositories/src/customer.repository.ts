import type { PoolClient } from "pg";
import { BaseRepository } from "./base.repository.js";
import type { CustomerRecord } from "./types.js";

type CustomerRow = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  default_address_id: string | null;
  created_at: Date;
};

type CreateCustomerInput = {
  userId: string;
  fullName: string;
  phone?: string | null;
};

type UpdateCustomerInput = Partial<{
  fullName: string;
  phone: string | null;
  defaultAddressId: string | null;
}>;

export class CustomerRepository extends BaseRepository<
  CustomerRecord,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerRow
> {
  protected tableName = "customers";

  protected mapRow(row: CustomerRow): CustomerRecord {
    return {
      id: row.id,
      userId: row.user_id,
      fullName: row.full_name,
      phone: row.phone,
      defaultAddressId: row.default_address_id,
      createdAt: row.created_at.toISOString(),
    };
  }

  async create(input: CreateCustomerInput, client?: PoolClient): Promise<CustomerRecord> {
    const result = await this.getExecutor(client).query<CustomerRow>(
      `INSERT INTO customers (user_id, full_name, phone)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.userId, input.fullName, input.phone ?? null],
    );

    return this.mapRow(result.rows[0]);
  }

  async update(
    id: string,
    input: UpdateCustomerInput,
    client?: PoolClient,
  ): Promise<CustomerRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.fullName !== undefined) {
      values.push(input.fullName);
      fields.push(`full_name = $${values.length}`);
    }
    if (input.phone !== undefined) {
      values.push(input.phone);
      fields.push(`phone = $${values.length}`);
    }
    if (input.defaultAddressId !== undefined) {
      values.push(input.defaultAddressId);
      fields.push(`default_address_id = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    values.push(id);
    const result = await this.getExecutor(client).query<CustomerRow>(
      `UPDATE customers
       SET ${fields.join(", ")}
       WHERE id = $${values.length}
       RETURNING *`,
      values,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByUserId(userId: string, client?: PoolClient): Promise<CustomerRecord | null> {
    const result = await this.getExecutor(client).query<CustomerRow>(
      `SELECT * FROM customers WHERE user_id = $1`,
      [userId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
}
