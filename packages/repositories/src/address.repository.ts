import type { PoolClient } from "pg";
import { BaseRepository } from "./base.repository.js";
import type { AddressRecord } from "./types.js";

type AddressRow = {
  id: string;
  customer_id: string;
  title: string;
  full_name: string;
  phone: string;
  city: string;
  district: string;
  postal_code: string | null;
  address_line: string;
  created_at: Date;
  updated_at: Date;
};

export type CreateAddressInput = {
  customerId: string;
  title: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  postalCode?: string | null;
  addressLine: string;
};

export type UpdateAddressInput = Partial<Omit<CreateAddressInput, "customerId">>;

export class AddressRepository extends BaseRepository<
  AddressRecord,
  CreateAddressInput,
  UpdateAddressInput,
  AddressRow
> {
  protected tableName = "addresses";

  protected mapRow(row: AddressRow): AddressRecord {
    return {
      id: row.id,
      customerId: row.customer_id,
      title: row.title,
      fullName: row.full_name,
      phone: row.phone,
      city: row.city,
      district: row.district,
      postalCode: row.postal_code,
      addressLine: row.address_line,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async create(input: CreateAddressInput, client?: PoolClient): Promise<AddressRecord> {
    const result = await this.getExecutor(client).query<AddressRow>(
      `INSERT INTO addresses (
         customer_id, title, full_name, phone, city, district, postal_code, address_line
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.customerId,
        input.title,
        input.fullName,
        input.phone,
        input.city,
        input.district,
        input.postalCode ?? null,
        input.addressLine,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async update(
    id: string,
    input: UpdateAddressInput,
    client?: PoolClient,
  ): Promise<AddressRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    const mapping: Record<keyof UpdateAddressInput, string> = {
      title: "title",
      fullName: "full_name",
      phone: "phone",
      city: "city",
      district: "district",
      postalCode: "postal_code",
      addressLine: "address_line",
    };

    for (const [key, column] of Object.entries(mapping) as [
      keyof UpdateAddressInput,
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
    const result = await this.getExecutor(client).query<AddressRow>(
      `UPDATE addresses
       SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async listByCustomerId(customerId: string, client?: PoolClient): Promise<AddressRecord[]> {
    const result = await this.getExecutor(client).query<AddressRow>(
      `SELECT * FROM addresses WHERE customer_id = $1 ORDER BY created_at DESC`,
      [customerId],
    );

    return result.rows.map((row) => this.mapRow(row));
  }
}
