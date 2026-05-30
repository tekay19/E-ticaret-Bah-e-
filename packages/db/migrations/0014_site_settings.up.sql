CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_settings (key, value)
VALUES (
  'storefront',
  '{
    "promoText": "İlk siparişe özel %25’e varan fırsat: GET25OFF - HEMEN ALIŞVERİŞE BAŞLA",
    "phoneLabel": "Hemen Ara:",
    "phoneNumber": "9876-543-210",
    "dailyDealLabel": "Günün Fırsatları",
    "weeklyDealsTitle": "Haftanın Fırsatları",
    "weeklyDealsSubtitle": "Bahçe ve el aletleri için özenle seçilmiş ürünleri keşfedin.",
    "weeklyDealsLimit": 6,
    "weeklyCountdownDays": 327,
    "weeklyCountdownHours": 14,
    "weeklyCountdownMinutes": 31,
    "promoCardOneEyebrow": "Kaçırma! Sıcak Fırsat",
    "promoCardOneTitle": "Bahçe işleri için güçlü ürünler",
    "promoCardOneButton": "Hemen Al",
    "promoCardTwoEyebrow": "Kaçırma! Sıcak Fırsat",
    "promoCardTwoTitle": "Dayanıklı el aletleri ve ekipmanlar",
    "promoCardTwoButton": "Hemen Al",
    "wideBannerTitle": "Bahçe ve tamir ürünlerinde güçlü fırsatlar",
    "wideBannerButton": "Alışverişe Başla"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
