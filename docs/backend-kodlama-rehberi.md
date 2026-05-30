# Bahçe Malzemeleri E-ticaret — Backend Kodlama Rehberi

> **Stack:** Node.js + TypeScript, Fastify, PostgreSQL 16, Redis 7, BullMQ, MinIO/S3
> **Süre:** ~12 hafta · 12 sprint
> **Mimari:** Tek HTTP API monolit, DABSON repository pattern uyumlu
> **Hedef:** 100-1000 ürün, tek mağaza, Türkiye pazarı

---

## İçindekiler

1. [Genel bakış](#1-genel-bakış)
2. [Cross-cutting kurallar](#2-cross-cutting-kurallar)
3. [Sprint 0 — Altyapı](#sprint-0--altyapı-5-gün)
4. [Sprint 1 — Auth](#sprint-1--auth-1-hafta)
5. [Sprint 2 — Katalog domain](#sprint-2--katalog-domain-1-hafta)
6. [Sprint 3 — Katalog API + CSV import](#sprint-3--katalog-api--csv-import-1-hafta)
7. [Sprint 4 — Stok yönetimi](#sprint-4--stok-yönetimi-1-hafta)
8. [Sprint 5 — Sepet](#sprint-5--sepet-1-hafta)
9. [Sprint 6 — Sipariş + İyzico ödeme](#sprint-6--sipariş--iyzico-ödeme-15-hafta)
10. [Sprint 7 — Kargo entegrasyonu](#sprint-7--kargo-entegrasyonu-1-hafta)
11. [Sprint 8 — İade + refund](#sprint-8--iade--refund-15-hafta)
12. [Sprint 9 — Kupon + kampanya](#sprint-9--kupon--kampanya-1-hafta)
13. [Sprint 10 — Admin + rapor](#sprint-10--admin--rapor-1-hafta)
14. [Sprint 11 — Hardening + launch](#sprint-11--hardening--launch-1-hafta)
15. [Ek: NPM bağımlılıkları](#ek-npm-bağımlılıkları)

---

## 1. Genel bakış

### 1.1 Klasör yapısı

```
bahce-shop/
├── apps/
│   └── api/
│       └── src/
│           ├── routes/              # HTTP route handler'lar
│           │   ├── auth/
│           │   ├── catalog/
│           │   ├── cart/
│           │   ├── checkout/
│           │   ├── orders/
│           │   ├── returns/
│           │   ├── webhooks/
│           │   └── admin/
│           ├── plugins/             # Fastify plugin'leri (auth, rbac, db)
│           ├── config/              # Env, DI container
│           └── server.ts
├── packages/
│   ├── db/
│   │   ├── migrations/              # SQL migration dosyaları
│   │   ├── seed/                    # Seed data scriptleri
│   │   └── client.ts                # pg Pool ve transaction helper
│   ├── repositories/
│   │   ├── base.repository.ts       # BaseRepository abstract class
│   │   ├── product.repository.ts
│   │   ├── order.repository.ts
│   │   └── ...
│   ├── domain/
│   │   ├── catalog/                 # ProductService, CategoryService
│   │   ├── inventory/               # StockMovementService, ReservationService
│   │   ├── cart/
│   │   ├── order/                   # OrderStateMachine, OrderService
│   │   ├── payment/
│   │   ├── shipping/
│   │   ├── return/                  # ReturnStateMachine
│   │   ├── refund/
│   │   └── coupon/                  # CouponValidator, DiscountCalculator
│   ├── workers/
│   │   ├── base.worker.ts
│   │   ├── email-sender.worker.ts
│   │   ├── image-processor.worker.ts
│   │   ├── csv-importer.worker.ts
│   │   ├── stock-threshold.worker.ts
│   │   ├── payment-timeout.worker.ts
│   │   ├── shipment-polling.worker.ts
│   │   ├── refund-processor.worker.ts
│   │   └── return-window-closer.worker.ts
│   ├── integrations/
│   │   ├── iyzico/                  # Ödeme
│   │   ├── carriers/                # ICarrier + Aras, MNG, Yurtiçi adapter
│   │   ├── efatura/                 # Mevcut sisteme bağlanır
│   │   ├── sms/                     # NetGSM veya İletiMerkezi
│   │   ├── email/                   # Nodemailer wrapper
│   │   └── telegram/                # Mevcut bot
│   └── shared/
│       ├── errors/                  # Typed error class'ları
│       ├── types/                   # Common TypeScript tipleri
│       └── utils/                   # Money, ID generation, validation
└── infra/
    ├── docker-compose.yml
    └── docker-compose.prod.yml
```

### 1.2 Önemli teknoloji kararları

| Karar | Tercih | Sebep |
|-------|--------|-------|
| HTTP server | Fastify | Native JSON Schema validation, plugin sistem, hız |
| ORM | Yok, raw SQL + repository pattern | DABSON tarzı kontrol, Prisma'sız |
| Migration | node-pg-migrate | Düz SQL desteği |
| Validation | zod | Runtime + TypeScript type inference |
| Logger | pino | Hızlı, structured |
| Queue | BullMQ | Mevcut deneyim |
| Auth | Argon2id + RS256 JWT + rotating refresh | Mevcut tasarımdan |
| Storage | MinIO local, S3-uyumlu prod | Aynı kod, farklı backend |
| Test | Vitest | Hızlı, TypeScript first |

---

## 2. Cross-cutting kurallar

Bu kurallar her sprintte uygulanır. İlk sprintte temellerini at, sonraki sprintlerde alışkanlık olsun.

**Para hesabı.** Her parasal değer `BIGINT` kuruş olarak saklanır. Asla `float` yok. Frontend'e gönderirken `priceCents: number` ile bırak veya `formatPrice(cents): string` helper'ından geçir. 100 lirayı `10000` olarak saklarsın, gösterirken `100,00 ₺`.

**Idempotency.** Tüm yan etkili POST endpoint'leri (ödeme başlat, iade aç, refund tetikle) ve webhook handler'lar `Idempotency-Key` header'ı kabul etmeli. Aynı key 2. kez gelirse aynı sonuç döner, hiçbir yan etki tetiklenmez. `idempotency_keys` tablosunda saklanır.

**Transaction.** Birden fazla tabloyu etkileyen her operasyon tek PostgreSQL transaction içinde olmalı. Repository method'larına opsiyonel `client` parametresi geç:
```typescript
async create(input: Input, client?: PoolClient): Promise<Product> { ... }
```
Service katmanı transaction başlatır, repository'lere geçirir.

**Audit log.** Sipariş, iade, refund, stok hareketi gibi kritik state değişikliklerinde `*_status_history` veya `*_movements` tablosuna INSERT atılır. Bu tablolar UPDATE almaz, sadece INSERT. Audit kanıt + debug için altın değerinde.

**Hata yönetimi.** Domain katmanında typed error class'ları (`InsufficientStockError`, `PaymentDeclinedError`, `ReturnWindowExpiredError`). Fastify error handler bunları HTTP status'a map'ler. Route handler'da `try/catch` yok, hata domain'den fırlar, plugin yakalar.

**Logging.** Her request başında `requestId` üret, async context'e koy, her log satırına otomatik eklensin. Hassas bilgi (şifre, kart no, JWT) loglara YAZILMAZ — bir redaction layer ekle.

**Test.** Domain logic (state machine geçişleri, kupon validation, kargo hesabı) için unit test. Critical money flows (checkout, refund) için e2e test. UI test yok backend'de.

---

## Sprint 0 — Altyapı (5 gün)

### Hedef
Geliştirme ortamı + temel tooling. Bir "hello world" endpoint'i Docker'da ayakta, migration çalışıyor, BullMQ iskeleti hazır.

### Adım adım

**1. Monorepo iskelet.** pnpm workspaces ile başla. Root'ta `pnpm-workspace.yaml`, `packages/*` ve `apps/*` glob'larını listele. TypeScript için tek `tsconfig.base.json`, her paket kendi `tsconfig.json` ile extends eder.

**2. Docker compose.** `infra/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: bahce_shop
      POSTGRES_USER: bahce
      POSTGRES_PASSWORD: dev_password
    ports: ["5432:5432"]
    volumes: [pg_data:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio_secret
    ports: ["9000:9000", "9001:9001"]
volumes: { pg_data: }
```

**3. Migration aracı.** `node-pg-migrate` kur. `packages/db/migrations/` altına ilk migration: extension'ları aç.
```sql
-- 0001_init_extensions.up.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
```
Migration komutları `package.json`'a script olarak: `db:migrate:up`, `db:migrate:down`, `db:migrate:create`.

**4. Env yönetimi.** `packages/shared/config/env.ts`:
```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_PRIVATE_KEY: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
});

export const env = envSchema.parse(process.env);
```
Eksik env varsa app başlamaz — bu kasıtlı.

**5. Logger.** Pino + `pino-pretty` (dev için). `requestId` için `AsyncLocalStorage` ile context.
```typescript
// packages/shared/utils/logger.ts
import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
export const logger = pino({
  mixin: () => ({ requestId: requestContext.getStore()?.requestId }),
  redact: ['password', 'token', 'creditCard'],
});
```

**6. DB client + transaction helper.** `packages/db/client.ts`:
```typescript
import { Pool, PoolClient } from 'pg';
export const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**7. Base repository.** Soyut sınıf, common CRUD operasyonları + transaction destekli.
```typescript
// packages/repositories/base.repository.ts
export abstract class BaseRepository<T, CreateInput, UpdateInput> {
  protected abstract tableName: string;
  protected abstract mapRow(row: any): T;

  async findById(id: string, client?: PoolClient): Promise<T | null> {
    const q = client ?? pool;
    const result = await q.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`, [id]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }
}
```

**8. Fastify server.** Tek bir `server.ts`. Plugin sistem ile auth, rbac, error handler, db pool inject edilir.

**9. Health check.** `GET /health` → `{ status: 'ok', timestamp, version }`. `GET /health/deep` → DB + Redis bağlantı kontrolü.

**10. BullMQ iskeleti.** `packages/workers/base.worker.ts`:
```typescript
import { Worker, Queue, Job } from 'bullmq';

export abstract class BaseWorker<T> {
  protected abstract queueName: string;
  protected abstract handle(job: Job<T>): Promise<void>;

  start() {
    return new Worker(this.queueName, async (job) => {
      logger.info({ jobId: job.id, queue: this.queueName }, 'processing');
      await this.handle(job);
    }, {
      connection: { url: env.REDIS_URL },
    });
  }
}
```
Retry policy varsayılan: 5 deneme, exponential backoff (1s, 4s, 16s, 64s, 256s).

**11. Graceful shutdown.** SIGTERM yakala, Fastify'ı kapat, BullMQ worker'ları drain et, pool'u kapat, çık.

### Definition of Done
- `docker compose up` ile PostgreSQL + Redis + MinIO ayakta
- `pnpm run db:migrate:up` çalışıyor, ilk migration başarılı
- `pnpm run dev` ile API ayakta, `GET /health` 200 dönüyor
- BullMQ test job'u kuyruğa atılıp işleniyor
- Logger structured çıktı veriyor, requestId her log'da

### Dosyalar
`pnpm-workspace.yaml`, `tsconfig.base.json`, `infra/docker-compose.yml`, `packages/db/{client.ts,migrations/0001_init_extensions.up.sql}`, `packages/shared/{config/env.ts,utils/logger.ts,errors/}`, `packages/workers/base.worker.ts`, `packages/repositories/base.repository.ts`, `apps/api/src/{server.ts,plugins/}`

---

## Sprint 1 — Auth (1 hafta)

### Hedef
Kullanıcı kayıt, giriş, refresh token, email doğrulama, şifre sıfırlama. RBAC altyapısı. Login rate limiting.

### Adım adım

**1. Tablolar.** Migration `0002_auth.up.sql`:
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin','super_admin')),
  email_verified_at TIMESTAMPTZ,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id),
  full_name TEXT NOT NULL,
  phone TEXT,
  default_address_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  postal_code TEXT,
  address_line TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
```

**2. Password service.** `domain/auth/password.service.ts`. `argon2` paketi, Argon2id varyantı. `hash(plain)` ve `verify(plain, hash)`. Default param: `memoryCost=19456, timeCost=2, parallelism=1` (OWASP önerisi).

**3. Token service.** RS256 JWT. Private/public key pair (env'den oku, dosya yolundan değil; PEM string olarak). Access token 15dk TTL, payload `{ sub, role, iat, exp }`. Refresh token opaque (random 32 byte hex), DB'de hash saklı (SHA-256).

**4. Refresh token rotation.** Yeni refresh üretirken `family_id` ata. Refresh kullanılınca eski token'ı `used_at` ile işaretle, yeni token aynı family_id ile üretilir. Eğer `used_at` dolu bir token tekrar gelirse → o family'nin tüm token'larını `revoked_at` ile iptal et (replay attack tespiti).

**5. Auth service.** `register(email, password)`, `login(email, password)`, `refresh(refreshToken)`, `logout(refreshToken)`. Login'de:
- Email var mı? Yoksa `InvalidCredentialsError` (mesaj jenerik, kullanıcı enumeration koruması)
- Password hash uyuşuyor mu? Yoksa `failed_login_attempts++`, 5'i geçerse `locked_until = now() + 15min`
- Başarılı login → counter reset, access + refresh dön

**6. Auth plugin (Fastify).** `request.user` decorator, JWT decode + verify. Bearer header'dan token al, public key ile doğrula, `request.user = { id, role }`.

**7. RBAC plugin.** Route'lara `preHandler` olarak eklenir: `roleGuard(['admin', 'super_admin'])`. Eksik rol → 403.

**8. Rate limit.** `@fastify/rate-limit` + Redis store. Login endpoint'inde agresif: 5 deneme / 15dk per IP. Register: 3 deneme / saat per IP.

**9. Email worker.** `email-sender.worker.ts`. BullMQ queue `email`. Job payload `{ to, template, vars }`. Handlebars template render et, Nodemailer ile gönder. SMTP creds env'den. Geliştirme sırasında MailHog kullan (Docker'a ekle).

**10. Verify email akışı.** Register sonrası `email-verification-tokens` tablosuna token koy (TTL 24sa). Mail at: link → `GET /auth/verify-email?token=...`. Endpoint token'ı bul, kullanıcının `email_verified_at`'ini güncelle, token'ı sil. Verify yapılmadan login'e izin ver ama bazı işlemler kısıtlı (örn. checkout).

**11. Password reset.** `POST /auth/forgot-password` → email varsa token üret, mail at (varsa veya yoksa aynı response — enumeration koruması). `POST /auth/reset-password` token + yeni şifre alır.

**12. Direct admin user.** Bir CLI script: `pnpm script:create-admin --email=... --password=...`. Migration'da default admin yok.

### Endpoint'ler
```
POST   /auth/register             { email, password, fullName, phone? }
POST   /auth/login                { email, password }
POST   /auth/refresh              { refreshToken }
POST   /auth/logout               { refreshToken }
GET    /auth/me                   (authenticated)
POST   /auth/verify-email         { token }
POST   /auth/forgot-password      { email }
POST   /auth/reset-password       { token, newPassword }
GET    /addresses                 (authenticated)
POST   /addresses                 (authenticated)
PATCH  /addresses/:id
DELETE /addresses/:id
```

### Definition of Done
- Register → email mail kutusuna düşüyor (MailHog'da görülebiliyor)
- Verify email tıklanınca `email_verified_at` doluyor
- Login → access + refresh dönüyor
- Refresh ile yeni access alınabiliyor, eski refresh kullanılamıyor
- Eski refresh 2. kez kullanılırsa tüm family iptal oluyor
- 5 hatalı login → 15dk lock
- Admin role'lü user'lı endpoint customer ile çağırılırsa 403

---

## Sprint 2 — Katalog domain (1 hafta)

### Hedef
Ürün, varyant, kategori (closure table), görsel pipeline (S3 presigned + sharp worker). Bahçe-spesifik alanlar.

### Adım adım

**1. Brand + kategori tabloları.**
```sql
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  meta_title TEXT,
  meta_description TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE category_closure (
  ancestor_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  descendant_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  depth INT NOT NULL,
  PRIMARY KEY (ancestor_id, descendant_id)
);
CREATE INDEX idx_closure_descendant ON category_closure(descendant_id);
```

**2. Closure table mekaniği.** Yeni kategori eklerken: kendisi için `(self, self, 0)` satırı + parent'ın tüm ancestor'ları için `(ancestor, self, depth+1)` satırları. Trigger ile otomatik yap veya CategoryRepository.create içinde transaction'da yap. Trigger önerim:
```sql
CREATE OR REPLACE FUNCTION update_category_closure() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO category_closure(ancestor_id, descendant_id, depth)
  VALUES (NEW.id, NEW.id, 0);
  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO category_closure(ancestor_id, descendant_id, depth)
    SELECT ancestor_id, NEW.id, depth + 1
    FROM category_closure WHERE descendant_id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**3. Ürün tabloları.** Bahçe spesifik alanlarla:
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  brand_id UUID REFERENCES brands(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  -- Bahçe alanları
  weight_kg NUMERIC(10,3),
  volume_desi NUMERIC(10,2),
  dimensions_lwh JSONB,           -- { length, width, height } cm
  material TEXT,
  usage_area TEXT[],              -- ['outdoor', 'indoor']
  season_tags TEXT[],
  is_hazardous BOOLEAN DEFAULT FALSE,
  msds_pdf_url TEXT,
  warranty_months INT,
  is_returnable BOOLEAN DEFAULT TRUE,
  return_rules JSONB,
  -- Sistem
  is_active BOOLEAN DEFAULT TRUE,
  min_stock_alert INT DEFAULT 5,
  meta_title TEXT,
  meta_description TEXT,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_products_category ON products(category_id) WHERE is_active = TRUE;

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT UNIQUE NOT NULL,
  options JSONB NOT NULL,         -- { "boyut": "20cm", "renk": "yeşil" }
  price_cents BIGINT NOT NULL,
  compare_at_price_cents BIGINT,  -- üstü çizili fiyat
  cost_cents BIGINT,              -- maliyet (rapor için)
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  webp_url TEXT,
  alt_text TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**4. Search vector trigger.** Türkçe arama için:
```sql
CREATE OR REPLACE FUNCTION products_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.name,''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.short_description,''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.description,''))), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_search_update
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_search_trigger();
```

**5. Repository'ler.** `ProductRepository`, `CategoryRepository`, `BrandRepository`. CategoryRepository özellikle:
- `getTree()` → tüm aktif kategoriler, parent-child yapısı
- `getDescendants(id)` → closure table ile tek query
- `getAncestors(id)` → breadcrumb için
- `move(id, newParentId)` → closure güncelleme (DELETE eski subtree + INSERT yeni)

**6. Domain modeller.** TypeScript class veya plain interface — value object'leri (Money, Slug) sınıf olarak yaz, validation construct'ta:
```typescript
export class Money {
  constructor(private readonly cents: bigint) {
    if (cents < 0n) throw new InvalidMoneyError();
  }
  toCents(): bigint { return this.cents; }
  toFormatted(): string { return formatTRY(this.cents); }
}
```

**7. S3 presigned URL service.** AWS SDK v3 (MinIO uyumlu). `generateUploadUrl(key, contentType)` → 15dk geçerli URL. Client doğrudan MinIO'ya PUT yapar. Backend bilmez yüklendiğini, client `POST /admin/images/confirm` ile bildirir.

**8. Image processor worker.** `image-processor.worker.ts`. Job payload `{ productId, originalKey }`. Sharp ile:
- Orijinal: 1600x1600 max, JPEG quality 85
- Thumbnail: 400x400, JPEG quality 80
- WebP: hem orijinal hem thumbnail için WebP varyant
- Resimler MinIO'ya tekrar yüklenir, URL'ler DB'ye yazılır
- `product_images` tablosuna kayıt INSERT

**9. Seed data.** `packages/db/seed/` altına bahçe ürünü seed: 3 marka, 10 kategori (El aletleri, Motorlu, Saksılar, Tohumlar, Sulama, Gübre, Toprak, Süs bitkileri, Bahçe mobilyası, Yedek parça), 20-30 ürün, görseller (placeholder URL'ler).

**10. Repository test.** Vitest ile unit test: closure table operasyonları, search query, slug generation.

### Definition of Done
- Kategori ağacı 3 seviyeli oluşturulabiliyor
- Ürün CRUD repository üzerinden çalışıyor
- Search vector trigger otomatik güncelleniyor, "çapa" araması "çapa makinesi"ni buluyor
- Görsel upload → confirm → processed (3 varyant DB'de URL'leriyle)
- Seed data ile 20+ ürün yüklenmiş

### Dosyalar
`packages/db/migrations/0003_catalog.up.sql`, `packages/repositories/{product,category,brand}.repository.ts`, `packages/domain/catalog/`, `packages/integrations/storage/s3.service.ts`, `packages/workers/image-processor.worker.ts`, `packages/db/seed/catalog.seed.ts`

---

## Sprint 3 — Katalog API + CSV import (1 hafta)

### Hedef
Public katalog API (filtreli liste, detay, arama). Admin CRUD. CSV ile toplu ürün yükleme (dry-run + apply).

### Adım adım

**1. Public katalog endpoint'leri.**
- `GET /products` — query: `category, brand, minPrice, maxPrice, sort, page, limit, q`. İleride cursor-based pagination'a geçersin; şimdilik offset yeterli.
- `GET /products/:slug` — full detay, varyantlar, görseller, breadcrumb (`CategoryRepository.getAncestors`)
- `GET /categories` — kategori ağacı tree formatında
- `GET /search?q=` — tsvector araması

Tutarlı zarf yapısı:
```typescript
{ data: T, meta: { total, page, limit } }
// hata:
{ error: { code, message, details? } }
```

**2. Filter + sort logic.** Repository'de dinamik WHERE clause:
```typescript
async list(filter: ProductFilter): Promise<{ items: Product[]; total: number }> {
  const where: string[] = ['p.is_active = TRUE'];
  const params: any[] = [];
  if (filter.categoryId) {
    where.push(`p.category_id IN (
      SELECT descendant_id FROM category_closure WHERE ancestor_id = $${params.length + 1}
    )`);
    params.push(filter.categoryId);
  }
  // minPrice, maxPrice, brand, q (tsvector) için aynı pattern
}
```
Kategori filtresi closure table ile alt kategorileri de kapsar.

**3. Admin product CRUD.**
- `POST /admin/products` — ürün + en az 1 varyant zorunlu
- `PATCH /admin/products/:id` — partial update
- `DELETE /admin/products/:id` — soft delete (`is_active = false`)
- `POST /admin/products/:id/variants` — varyant ekleme
- `PATCH /admin/products/:id/variants/:variantId`
- `POST /admin/products/:id/images` — image confirm endpoint'i

Validation zod schema ile, route plugin'inde dec olarak.

**4. Admin category management.**
- `POST /admin/categories`
- `PATCH /admin/categories/:id`
- `PATCH /admin/categories/:id/move` — parent değişimi (closure table güncelleme, transaction)
- `DELETE /admin/categories/:id` — boş ise siler, içinde ürün/alt kategori varsa hata

**5. CSV import altyapısı.** İki mod:
- `POST /admin/products/import?mode=dry-run` — multipart CSV upload, validation çalışır, diff response döner
- `POST /admin/products/import?mode=apply` — gerçekten uygular, job ID döner
- `GET /admin/products/import/:jobId/status` — progress polling

CSV format: ilk satır header, kolonlar `sku, name, slug, category_slug, brand_slug, price_cents, weight_kg, volume_desi, ...`. Boş hücreler varsayılana düşer.

**6. CSV importer worker.** `csv-importer.worker.ts`. Stream-based:
```typescript
const stream = papaparse.parse(fileStream, { header: true });
for await (const row of stream) {
  // her satır için validation + diff hesaplama
}
```
Dry-run: hiçbir DB yazımı yok, sonuçlar memory'de toplanır, response (`{ toCreate: 12, toUpdate: 5, errors: [...] }`).
Apply: tek transaction, satır satır UPSERT (sku unique key).

**7. Job progress tracking.** BullMQ'da `job.updateProgress(percent)`. SSE veya polling ile admin UI gösterir. Job sonucu Redis'te 24 saat tutulur.

**8. Slug generator.** Türkçe karakter dönüşümü:
```typescript
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/ç/g,'c').replace(/ş/g,'s').replace(/ğ/g,'g')
    .replace(/ü/g,'u').replace(/ö/g,'o').replace(/ı/g,'i')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-|-$/g,'');
}
```
Unique check: varsa `-2, -3` ekle.

**9. Sitemap generator.** `GET /sitemap.xml` — tüm aktif ürün + kategori URL'leri. Redis'te 1 saat cache.

**10. Public endpoint rate limit.** 100 req/dk per IP. Admin endpoint'leri zaten auth gerektiriyor, daha sıkı koy.

### Definition of Done
- `GET /products?category=el-aletleri&minPrice=10000` çalışıyor
- "kırmızı saksı" araması tsvector üzerinden anlamlı sonuç döndürüyor
- Admin 1 ürünü tüm alanlarıyla kaydedebiliyor
- CSV'de 100 satır dry-run → diff, sonra apply → DB'de değişiklik
- Job progress endpoint güncel %'e cevap veriyor

### Dosyalar
`apps/api/src/routes/catalog/`, `apps/api/src/routes/admin/products.ts`, `packages/workers/csv-importer.worker.ts`, `packages/shared/utils/slug.ts`

---

## Sprint 4 — Stok yönetimi (1 hafta)

### Hedef
Stok takip + rezervasyon (Redis primary, PostgreSQL audit). Hareket loğu. Eşik altı uyarısı.

### Adım adım

**1. Tablolar.**
```sql
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID UNIQUE NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  on_hand INT NOT NULL DEFAULT 0,
  reserved INT NOT NULL DEFAULT 0,
  available INT GENERATED ALWAYS AS (on_hand - reserved) STORED,
  unit_type TEXT NOT NULL DEFAULT 'piece' CHECK (unit_type IN
    ('piece','kg','liter','meter','bag','pack')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT non_negative CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)
);

CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN
    ('purchase','sale','return','adjustment','waste','transfer_in','transfer_out')),
  quantity INT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_movements_variant ON inventory_movements(variant_id, created_at DESC);

CREATE TABLE inventory_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity INT NOT NULL,
  reservation_type TEXT NOT NULL CHECK (reservation_type IN ('cart','order')),
  reference_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**2. StockMovementService.** Her hareket tek transaction'da:
```typescript
async record(input: MovementInput, client?: PoolClient): Promise<void> {
  await withTransactionOrClient(client, async (tx) => {
    await tx.query(`INSERT INTO inventory_movements (...) VALUES (...)`, [...]);
    await tx.query(
      `UPDATE inventory SET on_hand = on_hand + $1, updated_at = NOW()
       WHERE variant_id = $2`,
      [input.quantity, input.variantId]
    );
  });
}
```
Constraint zaten 0'ın altına düşmeyi engelliyor → `InsufficientStockError`.

**3. ReservationService — Redis primary.** Yüksek frekanslı sepet rezervasyonu için PG'yi her seferinde kilitlemek istemezsin. Redis Lua script ile atomik:
```lua
-- reserve.lua
-- KEYS[1] = stock:{variantId}, ARGV[1] = qty, ARGV[2] = resId, ARGV[3] = ttl
local stock = cjson.decode(redis.call('GET', KEYS[1]) or '{"onHand":0,"reserved":0}')
if stock.onHand - stock.reserved < tonumber(ARGV[1]) then
  return -1
end
stock.reserved = stock.reserved + tonumber(ARGV[1])
redis.call('SET', KEYS[1], cjson.encode(stock))
redis.call('SETEX', 'res:' .. ARGV[2], ARGV[3], cjson.encode({
  variantId = KEYS[1], qty = tonumber(ARGV[1])
}))
return stock.onHand - stock.reserved
```

**4. PostgreSQL sync — secondary.** Her başarılı Redis rezervasyonundan sonra async olarak `inventory_reservations` tablosuna yaz. Redis düşse veya cache evict olsa, PG'den recovery yapılabilir. BullMQ job ile (`stock-sync-pg`).

**5. Reservation expiry.** Redis TTL otomatik düşürür (15dk). PG'de `released_at IS NULL AND expires_at < NOW()` kayıtları temizleyen worker `reservation-cleanup.worker.ts`, her 5dk çalışır.

**6. Order'a dönüşüm.** Sipariş tamamlanınca rezervasyon kalıcı stok düşümüne dönüşür: tek transaction'da `Redis: reserved -= qty, onHand -= qty` + `PG: inventory_reservations.released_at = NOW()` + `inventory_movements INSERT (type='sale')`.

**7. Admin movement endpoint.**
- `POST /admin/inventory/movements` — manuel düzeltme, sayım, fire
- `GET /admin/inventory/movements?variantId=&from=&to=` — hareket geçmişi
- `GET /admin/inventory/low-stock` — eşik altında olanlar

**8. Eşik uyarı worker.** Saatlik cron:
```sql
SELECT p.id, p.name, p.min_stock_alert, i.available
FROM products p
JOIN product_variants pv ON pv.product_id = p.id
JOIN inventory i ON i.variant_id = pv.id
WHERE i.available <= p.min_stock_alert AND p.is_active = TRUE
```
Bulunanları Telegram bot'a + admin email'e gönder. Dedup: aynı ürün için 24 saat içinde tekrar bildirme (Redis key ile).

**9. Unit type validation.** Birim tipine göre quantity tipi farklı (piece tam sayı, kg ondalık). Basitlik için INT tut, gerekirse `_grams` veya `_millilitres` adlandırması kullan.

**10. Concurrent test.** Vitest'te yarış senaryosu: stock=5 iken 10 paralel istek 1'er adet sepete eklemeye çalışır. Tam 5 başarılı, kalan 5 `InsufficientStockError`. Lua atomic'liğini doğrular.

### Definition of Done
- Sipariş tamamlanınca stok kalıcı düşüyor, audit kaydı var
- Sepete eklenen ürün 15dk Redis'te rezerve, sonra serbest
- Eşik altı ürün için Telegram bildirimi gidiyor (24sa dedup)
- 10 paralel sepete ekleme testi geçiyor (yarış koşulu yok)
- Manuel stok düzeltmesi audit'e yazılıyor

### Dosyalar
`packages/db/migrations/0004_inventory.up.sql`, `packages/domain/inventory/`, `packages/workers/{stock-threshold,reservation-cleanup}.worker.ts`, `apps/api/src/routes/admin/inventory.ts`, `packages/integrations/storage/lua/reserve.lua`

---

## Sprint 5 — Sepet (1 hafta)

### Hedef
Redis-backed sepet. Stok rezervasyon entegrasyonu. Kargo ücreti hesaplama. Login'de sepet birleştirme.

### Adım adım

**1. Cart yapısı.** Redis'te key `cart:{cartId}`, value JSON:
```json
{
  "cartId": "uuid",
  "userId": "uuid | null",
  "sessionId": "string | null",
  "items": [
    { "variantId": "uuid", "qty": 2, "addedAt": "2026-01-15T..." }
  ],
  "appliedCouponCode": null,
  "shippingChoice": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```
TTL: kullanıcı 30 gün, anonim 7 gün. Her güncellemede TTL refresh.

**2. CartRepository (Redis).**
```typescript
class CartRepository {
  async get(cartId: string): Promise<Cart | null>
  async save(cart: Cart, ttlSeconds: number): Promise<void>
  async delete(cartId: string): Promise<void>
}
```

**3. CartService.**
- `getOrCreate(identifier)` — auth durumuna göre cart bul/oluştur
- `addItem(cartId, variantId, qty)` — stok rezervasyon dene, başarılıysa ekle
- `updateQty(cartId, itemId, newQty)` — delta kadar rezervasyon ayarla
- `removeItem(cartId, itemId)` — rezervasyonu serbest bırak
- `clear(cartId)` — tüm rezervasyonları serbest bırak

**4. Stok rezervasyonu entegrasyonu.** `addItem` flow:
1. Cart'ı oku
2. `ReservationService.reserve(variantId, qty, resId=cart_${cartId}_${variantId})`
3. Başarılıysa cart items'a ekle, save
4. Başarısızsa `InsufficientStockError`

Aynı variant tekrar eklenirse → mevcut rezervasyonu artır (idempotent).

**5. Cart validation servis.** Sepeti bir süre sonra geri açan müşteri için fiyat/stok kontrolü:
- `validateCart(cart): { items, warnings[] }`
- Warning tipleri: `price_changed`, `out_of_stock`, `product_unavailable`, `quantity_reduced`
- Frontend warnings'i gösterir, kullanıcı onayladıktan sonra checkout

**6. Cart endpoint'leri.**
```
GET    /cart
POST   /cart/items                    { variantId, qty }
PATCH  /cart/items/:itemId            { qty }
DELETE /cart/items/:itemId
POST   /cart/clear
POST   /cart/validate
POST   /cart/coupon                   { code }    (Sprint 9'da gerçek validation)
DELETE /cart/coupon
```

**7. Anonim sepet → üye sepet merge.** Login endpoint'i geliştirilir:
- Login response'unda eğer cookie'de `sessionId` varsa
- User'ın mevcut sepetiyle merge:
  - Aynı variant: qty topla (stok kadar)
  - Farklı: ekle
- Anonim sepeti sil, rezervasyonları transfer et

**8. Shipping calculator.** Carrier rate tablosu:
```sql
CREATE TABLE carrier_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  carrier_code TEXT NOT NULL CHECK (carrier_code IN ('aras','mng','yurtici','ptt')),
  min_desi NUMERIC(5,2) NOT NULL,
  max_desi NUMERIC(5,2) NOT NULL,
  price_cents BIGINT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  is_active BOOLEAN DEFAULT TRUE
);
```
`ShippingCalculator.calculate(cart, deliveryCity)`:
1. Toplam desi = `Σ(item.variant.product.volume_desi * qty)`
2. Toplam ağırlık (kg)
3. Etkili desi = `max(desi, weight_kg / 3)` (kargo standart formülü)
4. Her aktif carrier için rate lookup, fiyat döndür
5. Tehlikeli madde varsa kısıtlı carrier'lar (mesela hava kargo yok)

**9. Endpoint: shipping options.**
```
POST /cart/shipping/options    { addressId | deliveryCity }
→ [{ carrier: 'aras', estimatedDays: 2, priceCents: 2999 }, ...]
```

**10. Cookie + session ID.** Anonim için cookie ile `sessionId` (signed, HttpOnly, SameSite=Lax). Plugin her request'te kontrol et, yoksa üret.

### Definition of Done
- Anonim sepete ürün ekleniyor (cookie ile)
- Login yapınca sepet merge oluyor
- Stok yetmediği durumda doğru hata
- Kargo ücreti 2 ürün için doğru hesaplanıyor
- 30dk sonra sepetteki rezervasyonlar düşmüş oluyor

### Dosyalar
`packages/domain/cart/`, `apps/api/src/routes/cart/`, `packages/db/migrations/0005_shipping.up.sql`, `packages/domain/shipping/calculator.ts`

---

## Sprint 6 — Sipariş + İyzico ödeme (1.5 hafta)

### Hedef
Checkout akışı, İyzico 3D Secure ödeme entegrasyonu, sipariş state machine, e-fatura tetikleme.

### Adım adım

**1. Sipariş tabloları.**
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,        -- BG-2026-001234
  customer_id UUID NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment','paid','preparing','shipped',
    'delivered','completed','cancelled'
  )),
  subtotal_cents BIGINT NOT NULL,
  discount_cents BIGINT NOT NULL DEFAULT 0,
  shipping_cents BIGINT NOT NULL,
  tax_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  shipping_address JSONB NOT NULL,
  billing_address JSONB,
  carrier_code TEXT NOT NULL,
  coupon_code TEXT,
  customer_note TEXT,
  internal_note TEXT,
  return_window_expires_at TIMESTAMPTZ,
  invoice_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  product_snapshot JSONB NOT NULL,
  variant_snapshot JSONB NOT NULL,
  quantity INT NOT NULL,
  unit_price_cents BIGINT NOT NULL,
  total_cents BIGINT NOT NULL
);

CREATE TABLE order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL DEFAULT 'iyzico',
  provider_transaction_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN
    ('initialized','pending','succeeded','failed','refunded','partially_refunded')),
  amount_cents BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  card_last4 TEXT,
  card_family TEXT,
  installment_count INT,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  response_status INT,
  response_body JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
```

**2. Order number generator.** Sıralı + okunabilir: `BG-{YIL}-{6_HANELI_SEQ}`. PostgreSQL sequence + trigger.

**3. OrderStateMachine.** Allowed transitions:
```typescript
const transitions: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid:            ['preparing', 'cancelled'],
  preparing:       ['shipped', 'cancelled'],
  shipped:         ['delivered'],
  delivered:       ['completed'],       // 14 gün sonra otomatik
  completed:       [],
  cancelled:       [],
};

export class OrderStateMachine {
  static canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return transitions[from].includes(to);
  }
  static transition(order: Order, to: OrderStatus, reason?: string, by?: string): void {
    if (!this.canTransition(order.status, to)) {
      throw new InvalidStateTransitionError(order.status, to);
    }
    // status_history INSERT + order.status update
  }
}
```

**4. İyzico integration paketi.** `packages/integrations/iyzico/`:
```typescript
export class IyzicoClient {
  async initializeCheckout(input: CheckoutInitInput): Promise<{ token, paymentPageUrl }>;
  async retrieveCheckoutResult(token: string): Promise<PaymentResult>;
  async refund(input: RefundInput, idempotencyKey: string): Promise<RefundResult>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
}
```
Credentials env'den: `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL` (sandbox / prod).

**5. Checkout flow — iki endpoint.**

`POST /checkout/initiate`:
1. Idempotency-Key header kontrolü
2. Cart'ı tekrar validate et (fiyat, stok)
3. Rezervasyonu sepetten siparişe dönüştür (`reservation_type='order'`, TTL 30dk)
4. Order kaydı PENDING_PAYMENT status'unda oluştur (tek transaction'da)
5. İyzico `initializeCheckout` çağır, payment kaydı INITIALIZED
6. Response: `{ orderId, paymentPageUrl }`

`POST /checkout/confirm` (3DS callback):
1. İyzico'dan token ile result çek
2. Başarılı: order → PAID, payment → SUCCEEDED, stok kalıcı düş
3. Başarısız: order → CANCELLED, payment → FAILED, rezervasyon serbest
4. Hepsi tek transaction'da
5. Başarılıysa email + e-fatura worker'larına tetikle

**6. Webhook handler.** `POST /webhooks/iyzico`:
1. Signature doğrula
2. Event'i `webhook_events` dedup tablosunda kontrol et
3. Yeni ise işle (payment status update)
4. Aynı event 2. kez gelirse no-op

**7. Atomik checkout transaction.** En kritik kod:
```typescript
async function completeCheckout(orderId: string, paymentResult: PaymentResult) {
  return withTransaction(async (tx) => {
    const order = await orderRepo.findById(orderId, tx);
    if (order.status !== 'pending_payment') throw new InvalidStateError();

    await orderStateMachine.transition(order, 'paid');
    await orderRepo.update(order, tx);
    await paymentRepo.markSucceeded(payment.id, paymentResult, tx);

    for (const item of order.items) {
      await stockService.commitReservation(item.variantId, item.quantity, orderId, tx);
    }

    await cartRepo.deleteByCustomer(order.customerId);
  });
}
```

**8. Payment timeout worker.** Cron her 5dk:
```sql
SELECT id FROM orders
WHERE status = 'pending_payment' AND created_at < NOW() - INTERVAL '20 minutes'
```
Her birini cancel et, rezervasyonları serbest bırak.

**9. Müşteri sipariş endpoint'leri.**
- `GET /orders` — kendi siparişleri
- `GET /orders/:id` — detay
- `POST /orders/:id/cancel` — sadece PENDING_PAYMENT veya PAID iken (sonrası iade akışına)

**10. Admin sipariş yönetimi.**
- `GET /admin/orders?status=&customer=&from=&to=`
- `GET /admin/orders/:id`
- `POST /admin/orders/:id/transition` — `{ to: 'preparing', reason: '...' }`
- `PATCH /admin/orders/:id/note`

**11. Order confirmation email.** BullMQ job, Handlebars template (sipariş özeti, ürünler, toplam, kargo bilgisi).

**12. E-fatura tetikleme.** `efatura.worker.ts`. PAID olunca tetiklenir. Mevcut e-fatura sistemine (DABSON içinde) iş gönderir: UBL-TR XML üretilsin, GİB'e gönderilsin. PDF URL'i sipariş kaydına yazılır.

### Definition of Done
- Cart → checkout → İyzico 3DS → ödeme → sipariş uçtan uca çalışıyor
- Başarısız ödemede sipariş cancelled, stok serbest
- 20dk timeout sonra PENDING siparişler cancel oluyor
- Admin status geçişi state machine kuralına uygun (geçersizse 400)
- E-fatura tetikleniyor, PDF URL kayıtlı

### Dosyalar
`packages/db/migrations/0006_orders.up.sql`, `packages/domain/order/`, `packages/integrations/iyzico/`, `apps/api/src/routes/{checkout,orders,webhooks/iyzico}.ts`, `packages/workers/{payment-timeout,order-confirmation,efatura}.worker.ts`

---

## Sprint 7 — Kargo entegrasyonu (1 hafta)

### Hedef
Aras + MNG kargo entegrasyonu. Carrier abstraction. Webhook + polling. SMS bildirimleri.

### Adım adım

**1. Tablolar.**
```sql
CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier_code TEXT NOT NULL,
  tracking_number TEXT,
  label_url TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN
    ('created','picked_up','in_transit','out_for_delivery','delivered','failed','returned')),
  estimated_delivery_date DATE,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shipment_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT,
  location TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**2. ICarrier abstraction.**
```typescript
export interface ICarrier {
  readonly code: 'aras' | 'mng' | 'yurtici';
  createShipment(input: CreateShipmentInput): Promise<{ trackingNumber: string; labelUrl: string }>;
  getStatus(trackingNumber: string): Promise<ShipmentStatusResponse>;
  parseWebhook(payload: unknown, headers: Record<string, string>): ShipmentEvent[];
  generateLabel(trackingNumber: string): Promise<Buffer>;
}
```

**3. Aras adapter.** Aras Kargo SOAP API. `node-soap` paketi veya direkt XML inşa. Kimlik bilgileri env'den. Önemli endpoint'ler: `setOrderForKargo`, `getOrderStatus`.

**4. MNG adapter.** REST + JSON (modern). Token-based auth. `node-fetch` veya `undici`.

**5. ShipmentService.**
- `createShipment(orderId, carrierCode)` — ICarrier çağrısı, shipment kaydı, order → SHIPPED
- `recordEvent(shipmentId, event)` — webhook/polling event'i kaydeder, shipment.status günceller, DELIVERED ise order → DELIVERED + `return_window_expires_at` set
- `getTracking(orderId)` — müşteriye tracking bilgisi

**6. Webhook handler'lar.**
- `POST /webhooks/aras` — XML parse, IP whitelist, dedup
- `POST /webhooks/mng` — JSON

**7. Polling worker.** Saatlik cron, webhook'a güvenmemek için backup:
```sql
SELECT s.* FROM shipments s
JOIN orders o ON o.id = s.order_id
WHERE s.status NOT IN ('delivered', 'returned', 'failed')
  AND s.created_at > NOW() - INTERVAL '30 days'
```
Her biri için `ICarrier.getStatus()`, yeni event varsa kaydet.

**8. Customer tracking endpoint.**
- `GET /orders/:id/tracking` — auth gerekir
- Response: status, son event, tahmini teslim, event timeline

**9. SMS bildirimleri.** NetGSM veya İletiMerkezi (Türkiye). `sms.service.ts` + `sms-notification.worker.ts`.
- Shipment created → "Siparişiniz kargoya verildi. Takip: {url}"
- Out for delivery → "Siparişiniz dağıtımda"
- Delivered → "Siparişiniz teslim edildi"

**10. Etiket yazdırma.** `GET /admin/orders/:id/shipping-label` → PDF download.

### Definition of Done
- Admin SHIPPED'a alırken Aras'a kayıt, tracking number alınıyor
- Aras webhook → shipment_events
- Polling worker webhook olmasa da durumu yakalıyor
- Müşteri tracking görebiliyor
- SMS bildirimleri kritik aşamalarda gidiyor

### Dosyalar
`packages/db/migrations/0007_shipments.up.sql`, `packages/domain/shipping/service.ts`, `packages/integrations/carriers/{aras,mng,yurtici}.ts`, `packages/workers/{shipment-polling,sms-notification}.worker.ts`, `apps/api/src/routes/webhooks/{aras,mng}.ts`

---

## Sprint 8 — İade + refund (1.5 hafta)

### Hedef
İade akışı (14 gün cayma + hasarlı kargo özel akışı), state machine, İyzico refund, kısmi iade, stok geri yükleme.

### Adım adım

**1. Tablolar.**
```sql
CREATE TABLE returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number TEXT UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN
    ('requested','approved','rejected','in_transit','received','refunded','cancelled')),
  reason TEXT NOT NULL CHECK (reason IN
    ('cayma_hakki','hasarli_kargo','yanlis_urun','defolu_urun','aciklamayla_uyumsuz')),
  customer_note TEXT,
  admin_note TEXT,
  photos JSONB,                                -- S3 URL'leri (hasarlı için zorunlu)
  return_shipping_paid_by TEXT NOT NULL CHECK (return_shipping_paid_by IN ('customer','seller')),
  return_tracking_number TEXT,
  refund_amount_cents BIGINT,
  rejected_reason TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE TABLE return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  quantity INT NOT NULL,
  unit_refund_cents BIGINT NOT NULL,
  item_condition TEXT CHECK (item_condition IN ('unopened','opened','damaged','missing')),
  restock_eligible BOOLEAN DEFAULT TRUE
);

CREATE TABLE return_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID REFERENCES returns(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  payment_id UUID NOT NULL REFERENCES payments(id),
  amount_cents BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','processing','succeeded','failed')),
  provider_refund_id TEXT,
  attempt_count INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

**2. ReturnStateMachine.**
```typescript
const transitions: Record<ReturnStatus, ReturnStatus[]> = {
  requested:  ['approved', 'rejected', 'cancelled'],
  approved:   ['in_transit', 'cancelled'],
  in_transit: ['received'],
  received:   ['refunded'],
  refunded:   [],
  rejected:   [],
  cancelled:  [],
};
```

**3. İade talep API.** `POST /returns`:
1. Order varlığı + customer ownership kontrolü
2. `return_window_expires_at` kontrolü (geçmişse reddet)
3. Her item için ürün düzeyinde validation:
   - `product.is_returnable === false` → reddet (pestisit, fidan)
   - `return_rules` özel kuralları
   - Daha önce iade edilmiş quantity düş
4. Hasarlı kargo: foto upload zorunlu (en az 2 görsel), `paid_by='seller'`
5. Diğer sebepler: `paid_by='customer'`
6. Return kaydı `requested` status'ta oluştur

**4. İstisna kontrolü servis.** `ReturnValidator.canReturn(orderItem, reason, qty)`:
- Cayma süresi
- `product.is_returnable`
- `product.return_rules` (JSONB): örn. `{ "unopened_only": true }`
- Daha önce iade edilmiş miktar
- Returns: `{ allowed: boolean, reason?: string }`

**5. Admin onay/red.**
- `POST /admin/returns/:id/approve` → status approved, kargo etiketi üret (paid_by=seller ise), müşteriye mail
- `POST /admin/returns/:id/reject` → reason zorunlu, status rejected, müşteriye mail

**6. İade kargo etiketi.** Eğer `paid_by=seller` ve anlaşmalı carrier varsa: ICarrier ile `createShipment` (gönderici=müşteri, alıcı=mağaza). Etiket URL'i kaydedilir, müşteriye mail.

**7. Teslim alındı + restock.** `POST /admin/returns/:id/receive`:
1. Her return_item için `item_condition` admin tarafından girilir
2. `restock_eligible = TRUE` olanlar: `inventory_movements` INSERT (`type='return'`, `quantity=+qty`)
3. Damaged/missing: INSERT (`type='waste'`)
4. Return status → received
5. Refund kaydı (PENDING), refund-worker'a job

**8. Refund worker.** `refund-processor.worker.ts`:
1. PENDING refund al, status → PROCESSING
2. İyzico `refund()` çağır (idempotency key = refund.id)
3. Başarılı: status SUCCEEDED, return REFUNDED, müşteriye SMS + mail
4. Başarısız: `attempt_count++`, retry (1dk, 5dk, 30dk). 3 deneme sonrası admin alarmı

**9. Kısmi iade.** 3 ürünlü siparişin 1'i iade edilebilir. Refund tutarı:
```typescript
refundAmount = Σ(returnItem.unit_refund_cents * returnItem.quantity)
             + (return.return_shipping_paid_by === 'seller' ? shippingCost : 0)
```

**10. Return window closer.** Günlük cron. `return_window_expires_at < NOW()` olan DELIVERED siparişler → COMPLETED.

**11. Müşteri endpoint'leri.**
- `GET /returns` — kendi iadeleri
- `GET /returns/:id` — detay + timeline
- `POST /returns` — yeni talep
- `POST /returns/:id/cancel` — sadece REQUESTED iken

### Definition of Done
- 14 gün içinde iade açılabiliyor, sonrası reddediliyor
- Pestisit ürünü iade edilemiyor (rule kontrolü)
- Hasarlı kargo akışında foto zorunluluğu var
- Admin onayı sonrası kargo etiketi otomatik
- Teslim alındığında stok geri yükleniyor (restock eligible)
- İyzico refund tetikleniyor, başarılı SMS + mail
- 3 deneme başarısız refund admin queue'sunda

### Dosyalar
`packages/db/migrations/0008_returns.up.sql`, `packages/domain/return/`, `packages/domain/refund/`, `packages/workers/{refund-processor,return-window-closer}.worker.ts`, `apps/api/src/routes/{returns,admin/returns}.ts`

---
