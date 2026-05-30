import { pool } from "@bahce-shop/db";
import type { AuditLogRecord } from "./types.js";

type AuditLogRow = {
  id: string;
  user_id: string | null;
  user_role: string | null;
  method: string;
  path: string;
  status_code: number;
  request_id: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type CreateAuditLogInput = {
  userId?: string | null;
  userRole?: string | null;
  method: string;
  path: string;
  statusCode: number;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export class AuditLogRepository {
  private mapRow(row: AuditLogRow): AuditLogRecord {
    return {
      id: row.id,
      userId: row.user_id,
      userRole: row.user_role,
      method: row.method,
      path: row.path,
      statusCode: row.status_code,
      requestId: row.request_id,
      ip: row.ip,
      userAgent: row.user_agent,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
    };
  }

  async create(input: CreateAuditLogInput) {
    const result = await pool.query<AuditLogRow>(
      `INSERT INTO audit_logs (
         user_id, user_role, method, path, status_code, request_id, ip, user_agent, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.userId ?? null,
        input.userRole ?? null,
        input.method,
        input.path,
        input.statusCode,
        input.requestId ?? null,
        input.ip ?? null,
        input.userAgent ?? null,
        input.metadata ?? {},
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async list(filter: { userId?: string; path?: string; limit?: number }) {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.userId) {
      params.push(filter.userId);
      where.push(`user_id = $${params.length}`);
    }
    if (filter.path) {
      params.push(`${filter.path}%`);
      where.push(`path ILIKE $${params.length}`);
    }

    params.push(filter.limit ?? 50);
    const result = await pool.query<AuditLogRow>(
      `SELECT *
       FROM audit_logs
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    return result.rows.map((row) => this.mapRow(row));
  }
}
