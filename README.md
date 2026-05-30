# Bahce Shop

Bahce Shop, bahce urunleri icin gelistirilen full-stack e-ticaret projesidir. Projede musteri vitrini, sepet, checkout, siparis, iade, wishlist/compare, admin operasyon paneli, stok, kategori, urun, kupon, rapor ve mail akislari ayni monorepo icinde yer alir.

Bu README mevcut gelistirme durumunu, local kurulum adimlarini, portlari, mimariyi, ana API ailelerini ve test komutlarini ozetler.

## Durum

Sistem su anda yerel pilot/demo seviyesinde calisir durumdadir.

- Backend Fastify API olarak `localhost:3000` uzerinden calisir.
- Frontend Vite/React olarak `localhost:5173` uzerinden calisir.
- Vite, frontend icinden gelen `/api/*` isteklerini `localhost:3000` API'sine proxy eder.
- Admin panel ayni frontend uygulamasinda `/#admin` altindadir.
- PostgreSQL, Redis, MinIO ve MailHog docker ile calistirilir.
- Urun, kategori, stok, siparis, iade, kupon, mail ve admin akislari backend ile baglidir.

## Teknoloji

- Monorepo: `pnpm` workspace
- API: Fastify, TypeScript, Zod
- Web: React, Vite, TypeScript
- DB: PostgreSQL
- Queue/cache: Redis, BullMQ worker yapisi
- Dosya/object storage: MinIO, S3 uyumlu presigned upload
- Mail: Nodemailer + MailHog
- Auth: JWT access token + refresh token altyapisi
- Migration: node-pg-migrate

## Klasor Yapisi

```text
apps/
  api/                 Fastify API ve route kayitlari
  web/                 React/Vite storefront ve admin panel

packages/
  db/                  PostgreSQL client, migration ve seed
  domain/              Is kurallari, servisler, state machine'ler
  repositories/        DB repository katmani
  shared/              Env, hata siniflari, tipler, logger
  workers/             Queue worker'lari
  integrations/        S3/MinIO gibi entegrasyon yardimcilari

infra/
  docker-compose.yml   Local Postgres, Redis, MinIO, MailHog

docs/
  backend-kodlama-rehberi.md
```

## Local Portlar

| Servis | URL / Port | Not |
| --- | --- | --- |
| Web | `http://localhost:5173` | Storefront |
| Admin | `http://localhost:5173/#admin` | Ayni Vite app icinde |
| API | `http://localhost:3000` | Fastify backend |
| PostgreSQL | `localhost:15433` | Container icinde `5432` |
| Redis | `localhost:6379` | Queue/cache |
| MinIO API | `http://localhost:19000` | S3 uyumlu endpoint |
| MinIO Console | `http://localhost:19001` | Kullanici: `minio` |
| MailHog SMTP | `localhost:1025` | Mail gonderim hedefi |
| MailHog UI | `http://localhost:8025` | Mail kutusu |

## Hizli Kurulum

```bash
pnpm install
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
pnpm run db:migrate:up
pnpm run db:seed:catalog
pnpm run script:create-admin -- --email=admin@example.com --password=Admin12345
```

API'yi calistir:

```bash
pnpm --filter @bahce-shop/api dev
```

Web'i ayri terminalde calistir:

```bash
pnpm --filter @bahce-shop/web dev
```

Tarayicida:

```text
Storefront: http://localhost:5173
Admin:      http://localhost:5173/#admin
```

## Env Notlari

`.env.example` local gelistirme icin referans dosyadir. Gercek `.env` icinde JWT key'leri olmalidir.

Frontend linkleri icin:

```text
WEB_BASE_URL=http://localhost:5173
```

Email dogrulama ve sifre yenileme mailleri bu base URL ile frontend hash route'larina gider.

PostgreSQL varsayilan local URL:

```text
DATABASE_URL=postgres://bahce:dev_password@localhost:15433/bahce_shop
```

MinIO varsayilan local ayarlar:

```text
S3_ENDPOINT=http://localhost:19000
S3_PUBLIC_BASE_URL=http://localhost:19000/bahce-shop-dev
S3_BUCKET=bahce-shop-dev
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio_secret
```

JWT key uretmek icin ornek:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /tmp/jwt_private.pem
openssl rsa -pubout -in /tmp/jwt_private.pem -out /tmp/jwt_public.pem
```

Sonra dosya iceriklerini `.env` icindeki `JWT_PRIVATE_KEY` ve `JWT_PUBLIC_KEY` alanlarina newline escape edilmis sekilde koy.

## Komutlar

```bash
pnpm -r typecheck
pnpm -r build
pnpm run db:migrate:up
pnpm run db:migrate:down
pnpm run db:migrate:create -- migration_name
pnpm run db:seed:catalog
pnpm run script:create-admin -- --email=admin@example.com --password=Admin12345
```

Paket bazli komutlar:

```bash
pnpm --filter @bahce-shop/api typecheck
pnpm --filter @bahce-shop/api build
pnpm --filter @bahce-shop/web typecheck
pnpm --filter @bahce-shop/web build
```

## Backend Ozeti

Backend `apps/api/src/server.ts` icinde plugin ve route'lari kaydeder.

Ana plugin'ler:

- Request context ve request id
- Security headers
- Merkezi error handler
- Cookie
- Multipart
- Auth
- RBAC role guard
- Rate limit
- Audit log

Ana route aileleri:

- Auth ve adresler
- Cart
- Catalog
- Checkout
- Coupons
- Customer engagement
- Inventory
- Orders
- Reports
- Returns
- Audit
- Webhook'lar

## Public API Aileleri

Storefront tarafinda kullanilan temel endpointler:

- `GET /health`
- `GET /health/deep`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /categories`
- `GET /products`
- `GET /products/:slug`
- `GET /products/:slug/related`
- `GET /products/:slug/reviews`
- `POST /products/:slug/reviews`
- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:id`
- `DELETE /cart/items/:id`
- `POST /checkout/confirm`
- `GET /orders`
- `GET /orders/:id`
- `GET /returns`
- `POST /returns`
- `POST /contact-messages`
- `POST /newsletter/subscriptions`
- `GET/POST/DELETE /wishlist/items`
- `GET/POST/DELETE /compare/items`

## Admin API Aileleri

Admin endpointleri `admin` veya `super_admin` rol ister.

- `GET /admin/ping`
- `GET /admin/reports/overview`
- `GET /admin/reports/sales`
- `GET /admin/reports/inventory`
- `GET /admin/reports/coupons`
- `GET /admin/categories`
- `POST /admin/categories`
- `PATCH /admin/categories/:id`
- `PATCH /admin/categories/:id/move`
- `DELETE /admin/categories/:id`
- `GET /admin/products`
- `GET /admin/products/:id`
- `GET /admin/products/:id/history`
- `POST /admin/products`
- `PATCH /admin/products/:id`
- `DELETE /admin/products/:id`
- `POST /admin/products/:id/variants`
- `PATCH /admin/products/:id/variants/:variantId`
- `POST /admin/images/upload-url`
- `POST /admin/products/:id/images`
- `GET /admin/inventory`
- `POST /admin/inventory`
- `GET /admin/inventory/movements`
- `POST /admin/inventory/movements`
- `GET /admin/inventory/low-stock`
- `GET /admin/orders`
- `GET /admin/orders/:id`
- `POST /admin/orders/:id/transition`
- `POST /admin/orders/:id/shipments`
- `GET /admin/orders/:id/tracking`
- `GET /admin/orders/:id/shipping-label`
- `PATCH /admin/orders/:id/note`
- `GET /admin/returns`
- `GET /admin/returns/:id`
- `POST /admin/returns/:id/approve`
- `POST /admin/returns/:id/reject`
- `POST /admin/returns/:id/receive`
- `GET /admin/coupons`
- `POST /admin/coupons`
- `GET /admin/audit-logs`

## Frontend Ozeti

Frontend tek Vite uygulamasidir.

- Storefront ana dosya: `apps/web/src/App.tsx`
- Admin panel: `apps/web/src/AdminPanel.tsx`
- API helper ve frontend tipleri: `apps/web/src/api.ts`
- Stil dosyasi: `apps/web/src/styles.css`
- Vite proxy: `apps/web/vite.config.ts`

Storefront ozellikleri:

- Home, shop, kategori menu, urun listeleme
- Urun detay sayfasi
- Backend urun gorselleri
- Header search
- Sepet
- Checkout
- Siparis basari ekrani
- Hesap paneli
- E-posta dogrulama ekrani
- Sifremi unuttum ve sifre yenileme ekrani
- Siparis detaylari
- Iade talebi
- Wishlist ve compare
- Contact ve newsletter

Admin ozellikleri:

- Admin login ve role guard
- Dashboard ve rapor bloklari
- Urun katalog listesi
- Yeni urun olusturma
- Urun detay duzenleme
- Urun gorsel yukleme
- Satis/stok satirlari
- Kategori agaci, ana/alt kategori, aktif/pasif, silme, siralama
- Stok tablosu, dusuk stok, son hareketler
- Siparis listesi, detay, durum degisimi, kargo/takip
- Iade listesi, onay/red/teslim alma
- Kupon listeleme/olusturma
- Session suresi dolunca temiz login ekranina donme

## Urun Akisi

1. Admin `/#admin` ile giris yapar.
2. `Yeni urun olustur` ekraninda SKU, ad, kategori, fiyat ve aciklamalar girilir.
3. Urun olusunca otomatik katalog detayina gecilir.
4. Detay ekraninda 3 adimli akis kullanilir:
   - `Urun bilgisi`
   - `Gorsel galeri`
   - `Satis & stok`
5. Gorsel yukleme presigned URL ile MinIO'ya PUT yapar.
6. Confirm endpoint image job baslatir.
7. Galeri otomatik tekrar cekilir.
8. Stok adedi `Stok` ekranindan SKU/satis satiri icin girilir.

## Stok Akisi

Stok ekrani uc liste moduna sahiptir:

- `Urun stoklari`: hangi urunden kac adet hazir, toplam ve ayrilmis adet.
- `Dusuk stok listesi`: min stok esiginin altindaki kayitlar.
- `Son hareketler`: satin alma, satis, iade, manuel duzeltme, fire ve transfer hareketleri.

Stok guncelleme iki farkli mantikla calisir:

- `Stogu ayarla`: secili urunun mevcut stok sayisini dogrudan belirler.
- `Hareketi kaydet`: stok gecmisine islem ekler ve adedi islem tipine gore arttirir/azaltir.

## Siparis Akisi

Musteri checkout tamamlayinca siparis olusur. Admin siparis ekraninda:

- Siparis no
- Urun adi
- Musteri adi/telefon
- Tutar
- Durum
- Odeme ozeti
- Adres
- Kargo/takip bilgisi
- Urun satirlari

gorunur.

Durum akisi:

```text
Odeme bekliyor -> Odendi -> Hazirlaniyor -> Kargoda -> Teslim edildi -> Tamamlandi
```

Iptal akisi uygun durumlarda ayrica calisir.

Siparis durum degisimi mail kuyruguna bildirim atar. Localde MailHog UI'dan kontrol edilir.

## Iade Akisi

Musteri uygun siparis icin iade talebi acabilir. Iade uygunlugu siparis durumu ve iade penceresine gore kontrol edilir.

Admin iade ekraninda:

- Iade no
- Sebep
- Tutar
- Durum
- Musteri notu
- Admin notu
- Iade edilen urunler
- Teslim alma kosulu
- Stoka geri alma karari
- Iade gecmisi

gorunur.

Admin aksiyonlari:

- Onayla
- Reddet
- Teslim al ve iade surecini baslat

Iade durum degisimi mail kuyruguna bildirim atar.

## Mail Akisi

Mail sistemi worker + nodemailer ile calisir. Local SMTP hedefi MailHog'dur.

MailHog UI:

```text
http://localhost:8025
```

Desteklenen mail sablonlari:

- Email dogrulama
- Sifre sifirlama
- Siparis alindi
- Siparis durumu guncellendi
- Kargo olusturuldu
- Iade durumu guncellendi
- Odeme iadesi tamamlandi

## Auth Akisi

Prod uyumlu auth davranisi:

- Login ve refresh response'lari access token dondurur.
- Refresh token response body'de donmez; `bahce_refresh_token` adli `httpOnly`, `SameSite=Lax` cookie olarak saklanir.
- Frontend access token'i memory'de tutar; eski `localStorage` session kalintisini temizler.
- Yetkili isteklerde `401` gelirse frontend `/auth/refresh` ile sessiz token yenilemeyi dener.
- Refresh token rotation vardir; eski token tekrar kullanilirsa refresh family revoke edilir.
- Yeni kayit sonrasi verification token frontend'e donmez; kullanici maildeki `#verify-email?token=...` linki ile dogrular.
- Dogrulanmamis email ile login engellenir.
- Sifremi unuttum akisi `#reset-password?token=...` linkiyle frontend formuna gider.
- Sifre yenilenince kullanicinin mevcut refresh token oturumlari iptal edilir.

## Gorsel Yukleme

Admin urun detayindaki gorsel yukleme akisi:

1. `/admin/images/upload-url` ile presigned upload URL alinir.
2. Dosya MinIO'ya `PUT` edilir.
3. `/admin/products/:id/images` ile backend'e confirm atilir.
4. Image processor job galeri kaydini olusturur.
5. Frontend urun detayini tekrar cekerek galeriyi yeniler.

MinIO bucket:

```text
bahce-shop-dev
```

## Roller

Temel roller:

- `customer`
- `admin`
- `super_admin`

Admin panel sadece `admin` ve `super_admin` rollerine aciktir. Diger roller storefront/account tarafina yonlendirilmelidir.

## Test ve Smoke

Genel dogrulama:

```bash
pnpm -r typecheck
pnpm -r build
```

API health:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/deep
```

Admin login smoke:

```bash
curl -sS -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"Admin12345"}'
```

Admin yetki smoke:

```bash
TOKEN="admin_access_token"
curl -sS http://localhost:3000/admin/ping \
  -H "authorization: Bearer $TOKEN"
```

Session expired smoke:

```bash
curl -i http://localhost:3000/admin/ping \
  -H "authorization: Bearer invalid-token"
```

Beklenen sonuc: `401 Unauthorized`.

Mail smoke:

```bash
curl http://localhost:8025/api/v2/messages
```

## Bilinen Eksikler ve Sonraki Mantikli Isler

Canli prod seviyesine cikmadan once onerilen isler:

- Otomatik e2e testleri eklemek.
- Admin gorsel yuklemeyi browser uzerinden manuel/otomasyon smoke ile tekrar dogrulamak.
- Admin dashboard grafiklerini ve karar metriklerini daha da guclendirmek.
- Kullanici hesap paneli, wishlist/compare ve iade detaylarini daha premium hale getirmek.
- Prod mail provider, prod object storage ve gercek odeme entegrasyonlarini ayirmak.
- Rate limit ve auth hata mesajlarini tum UI'da ayni standarda cekmek.
- Log/audit ekranini admin icin daha kullanisli hale getirmek.
- CI pipeline eklemek.

## Gelistirme Notlari

- Bu repo su anda git deposu olarak init edilmemis gorunuyor. Versiyonlama icin `git init` veya mevcut remote baglantisi sonraki adimda yapilabilir.
- `.env` dosyasi gizli bilgi icerir; commit edilmemelidir.
- Localde baska Postgres veya MinIO containerlari varsa port cakismasi olabilir. Bu proje icin dokumante edilen portlar `15433`, `19000` ve `19001` olarak sabitlenmistir.
