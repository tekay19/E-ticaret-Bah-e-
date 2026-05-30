import type { PoolClient } from "pg";
import { pool } from "@bahce-shop/db";
import type {
  ContactMessageRecord,
  CustomerProductListItemRecord,
  NewsletterSubscriptionRecord,
  ProductReviewRecord,
  ProductReviewSummary,
} from "./types.js";

type Queryable = PoolClient | typeof pool;

type ContactMessageRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: ContactMessageRecord["status"];
  created_at: Date;
};

type NewsletterRow = {
  id: string;
  email: string;
  status: NewsletterSubscriptionRecord["status"];
  subscribed_at: Date;
  updated_at: Date;
};

type ReviewRow = {
  id: string;
  product_id: string;
  customer_id: string;
  customer_name: string;
  rating: number;
  title: string | null;
  comment: string;
  status: ProductReviewRecord["status"];
  created_at: Date;
  updated_at: Date;
};

type SummaryRow = {
  average_rating: string | null;
  total: string;
};

type ListItemRow = {
  id: string;
  customer_id: string;
  product_id: string;
  created_at: Date;
};

type ProductListKind = "wishlist_items" | "compare_items";

export class CustomerEngagementRepository {
  private getExecutor(client?: PoolClient): Queryable {
    return client ?? pool;
  }

  private mapContact(row: ContactMessageRow): ContactMessageRecord {
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      subject: row.subject,
      message: row.message,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    };
  }

  private mapNewsletter(row: NewsletterRow): NewsletterSubscriptionRecord {
    return {
      id: row.id,
      email: row.email,
      status: row.status,
      subscribedAt: row.subscribed_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapReview(row: ReviewRow): ProductReviewRecord {
    return {
      id: row.id,
      productId: row.product_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      rating: row.rating,
      title: row.title,
      comment: row.comment,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapListItem(row: ListItemRow): CustomerProductListItemRecord {
    return {
      id: row.id,
      customerId: row.customer_id,
      productId: row.product_id,
      createdAt: row.created_at.toISOString(),
    };
  }

  async createContactMessage(input: {
    fullName: string;
    email: string;
    phone?: string | null;
    subject?: string | null;
    message: string;
  }, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ContactMessageRow>(
      `INSERT INTO contact_messages (full_name, email, phone, subject, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.fullName,
        input.email.toLowerCase(),
        input.phone ?? null,
        input.subject ?? null,
        input.message,
      ],
    );

    return this.mapContact(result.rows[0]);
  }

  async subscribeNewsletter(email: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<NewsletterRow>(
      `INSERT INTO newsletter_subscriptions (email, status)
       VALUES ($1, 'subscribed')
       ON CONFLICT (email) DO UPDATE SET
         status = 'subscribed',
         updated_at = NOW()
       RETURNING *`,
      [email.toLowerCase()],
    );

    return this.mapNewsletter(result.rows[0]);
  }

  async listReviews(productId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReviewRow>(
      `SELECT pr.*, c.full_name AS customer_name
       FROM product_reviews pr
       JOIN customers c ON c.id = pr.customer_id
       WHERE pr.product_id = $1 AND pr.status = 'published'
       ORDER BY pr.created_at DESC
       LIMIT 100`,
      [productId],
    );

    return result.rows.map((row) => this.mapReview(row));
  }

  async reviewSummary(productId: string, client?: PoolClient): Promise<ProductReviewSummary> {
    const result = await this.getExecutor(client).query<SummaryRow>(
      `SELECT ROUND(AVG(rating)::NUMERIC, 2)::TEXT AS average_rating,
              COUNT(*)::TEXT AS total
       FROM product_reviews
       WHERE product_id = $1 AND status = 'published'`,
      [productId],
    );

    return {
      averageRating: Number(result.rows[0]?.average_rating ?? 0),
      total: Number(result.rows[0]?.total ?? 0),
    };
  }

  async hasPurchasedProduct(customerId: string, productId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN product_variants pv ON pv.id = oi.variant_id
         WHERE o.customer_id = $1
           AND pv.product_id = $2
           AND o.status IN ('delivered', 'completed')
       ) AS exists`,
      [customerId, productId],
    );

    return result.rows[0]?.exists ?? false;
  }

  async upsertReview(input: {
    productId: string;
    customerId: string;
    rating: number;
    title?: string | null;
    comment: string;
  }, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReviewRow>(
      `INSERT INTO product_reviews (product_id, customer_id, rating, title, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (product_id, customer_id) DO UPDATE SET
         rating = EXCLUDED.rating,
         title = EXCLUDED.title,
         comment = EXCLUDED.comment,
         status = 'published',
         updated_at = NOW()
       RETURNING *,
         (SELECT full_name FROM customers WHERE id = $2) AS customer_name`,
      [
        input.productId,
        input.customerId,
        input.rating,
        input.title ?? null,
        input.comment,
      ],
    );

    return this.mapReview(result.rows[0]);
  }

  async listCustomerItems(kind: ProductListKind, customerId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ListItemRow>(
      `SELECT * FROM ${kind}
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [customerId],
    );

    return result.rows.map((row) => this.mapListItem(row));
  }

  async addCustomerItem(kind: ProductListKind, customerId: string, productId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ListItemRow>(
      `INSERT INTO ${kind} (customer_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (customer_id, product_id) DO UPDATE SET product_id = EXCLUDED.product_id
       RETURNING *`,
      [customerId, productId],
    );

    return this.mapListItem(result.rows[0]);
  }

  async removeCustomerItem(kind: ProductListKind, customerId: string, productId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query(
      `DELETE FROM ${kind}
       WHERE customer_id = $1 AND product_id = $2`,
      [customerId, productId],
    );

    return { success: (result.rowCount ?? 0) > 0 };
  }
}
