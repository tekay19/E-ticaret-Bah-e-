import { closePool, pool } from "../client.js";
import { toSlug } from "@bahce-shop/shared";

const brands = ["GardenPro", "YesilUsta", "SulamaMax"];

const categories = [
  "El aletleri",
  "Motorlu",
  "Saksilar",
  "Tohumlar",
  "Sulama",
  "Gubre",
  "Toprak",
  "Sus bitkileri",
  "Bahce mobilyasi",
  "Yedek parca",
];

type SeedProduct = [sku: string, name: string, category: string, brand: string, priceCents: number];

const products: SeedProduct[] = [
  ["EL-001", "Celik Bahce Capasi", "El aletleri", "GardenPro", 12990],
  ["EL-002", "Budama Makasi", "El aletleri", "YesilUsta", 8990],
  ["EL-003", "Tirnakli El Tirmigi", "El aletleri", "GardenPro", 5990],
  ["MO-001", "Elektrikli Capa Makinesi", "Motorlu", "GardenPro", 849900],
  ["MO-002", "Akulu Cim Bicme Makinesi", "Motorlu", "SulamaMax", 1249900],
  ["SA-001", "Terracotta Saksi 30 cm", "Saksilar", "YesilUsta", 14990],
  ["SA-002", "Balkon Saksisi Uzun", "Saksilar", "YesilUsta", 9990],
  ["TO-001", "Domates Tohumu", "Tohumlar", "YesilUsta", 2990],
  ["TO-002", "Feslegen Tohumu", "Tohumlar", "YesilUsta", 2490],
  ["SU-001", "Damla Sulama Seti", "Sulama", "SulamaMax", 24990],
  ["SU-002", "Ayarlanabilir Hortum Basligi", "Sulama", "SulamaMax", 7990],
  ["GU-001", "Organik Solucan Gubresi 5L", "Gubre", "GardenPro", 11990],
  ["GU-002", "Cicek Besini 1L", "Gubre", "YesilUsta", 6990],
  ["TP-001", "Torflu Bitki Topragi 20L", "Toprak", "GardenPro", 9990],
  ["TP-002", "Kaktus Sukulent Topragi 5L", "Toprak", "YesilUsta", 5490],
  ["SB-001", "Lavanta Fidesi", "Sus bitkileri", "YesilUsta", 7990],
  ["SB-002", "Ortanca Fidesi", "Sus bitkileri", "YesilUsta", 12990],
  ["BM-001", "Katlanir Bahce Sandalyesi", "Bahce mobilyasi", "GardenPro", 39990],
  ["BM-002", "Ahsap Bahce Masasi", "Bahce mobilyasi", "GardenPro", 189990],
  ["YP-001", "Cim Bicme Bicagi", "Yedek parca", "SulamaMax", 15990],
  ["YP-002", "Hortum Conta Seti", "Yedek parca", "SulamaMax", 3490],
];

const demoProductImages = [
  "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/10/23-460x460.jpg",
  "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/14-460x460.jpg",
  "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/09-460x460.jpg",
  "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/05-1-460x460.jpg",
  "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/06-460x460.jpg",
  "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/03-2-460x460.jpg",
  "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/01-460x460.jpg",
  "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/02-460x460.jpg",
];

const demoCategoryImages = [2, 3, 7, 6, 1, 8, 5, 9, 4, 2].map(
  (id) => `https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2024/10/cat-${id}.jpg`,
);

async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const brandIds = new Map<string, string>();
    for (const brand of brands) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO brands (name, slug)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [brand, toSlug(brand)],
      );
      brandIds.set(brand, result.rows[0].id);
    }

    const categoryIds = new Map<string, string>();
    for (const [index, category] of categories.entries()) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO categories (name, slug, sort_order, image_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           image_url = COALESCE(categories.image_url, EXCLUDED.image_url)
         RETURNING id`,
        [category, toSlug(category), index, demoCategoryImages[index] ?? null],
      );
      categoryIds.set(category, result.rows[0].id);
    }

    for (const [index, [sku, name, category, brand, priceCents]] of products.entries()) {
      const productResult = await client.query<{ id: string }>(
        `INSERT INTO products (
           sku, slug, name, short_description, description, category_id, brand_id, weight_kg, volume_desi
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (sku) DO UPDATE SET
           name = EXCLUDED.name,
           short_description = EXCLUDED.short_description,
           description = EXCLUDED.description,
           category_id = EXCLUDED.category_id,
           brand_id = EXCLUDED.brand_id,
           updated_at = NOW()
         RETURNING id`,
        [
          sku,
          toSlug(name),
          name,
          `${name} bahce kullanimi icin uygundur.`,
          `${name} Turkiye pazari icin secilmis bahce urunleri katalog ornegidir.`,
          categoryIds.get(category as string),
          brandIds.get(brand as string),
          "1.000",
          "2.00",
        ],
      );
      const productId = productResult.rows[0].id;

      const variantResult = await client.query<{ id: string }>(
        `INSERT INTO product_variants (product_id, sku, options, price_cents)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (sku) DO UPDATE SET
           options = EXCLUDED.options,
           price_cents = EXCLUDED.price_cents,
           updated_at = NOW()
         RETURNING id`,
        [
          productId,
          `${sku}-STD`,
          { paket: "standart" },
          priceCents,
        ],
      );

      await client.query(
        `INSERT INTO inventory (variant_id, on_hand, reserved, unit_type)
         VALUES ($1, $2, 0, 'piece')
         ON CONFLICT (variant_id) DO UPDATE SET
           on_hand = GREATEST(inventory.on_hand, EXCLUDED.on_hand),
           updated_at = NOW()`,
        [variantResult.rows[0].id, 25],
      );

      const imageUrl = demoProductImages[index % demoProductImages.length];
      await client.query(
        `INSERT INTO product_images (product_id, url, thumbnail_url, webp_url, alt_text, sort_order)
         SELECT $1, $2, $2, NULL, $3, 0
         WHERE NOT EXISTS (
           SELECT 1 FROM product_images WHERE product_id = $1 AND url = $2
         )`,
        [productId, imageUrl, name],
      );
    }

    await client.query("COMMIT");
    console.log(`Seed tamamlandi: ${brands.length} marka, ${categories.length} kategori, ${products.length} urun.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

void main();
