UPDATE site_settings
SET value = value
  || '{
    "fallbackCategories": [
      { "id": "Hammer Tool", "name": "Çekiç Grubu", "slug": "hammer-tool" },
      { "id": "Drill Tool", "name": "Matkap Grubu", "slug": "drill-tool" },
      { "id": "Circular Saw", "name": "Daire Testere", "slug": "circular-saw" },
      { "id": "Wrench Tool", "name": "Anahtar Takımı", "slug": "wrench-tool" },
      { "id": "Decker Tool", "name": "Decker Aletleri", "slug": "decker-tool" },
      { "id": "Power Saw", "name": "Motorlu Testere", "slug": "power-saw" }
    ],
    "orderStatusLabels": {
      "pending_payment": "Ödeme bekliyor",
      "paid": "Ödendi",
      "preparing": "Hazırlanıyor",
      "shipped": "Kargoda",
      "delivered": "Teslim edildi",
      "completed": "Tamamlandı",
      "cancelled": "İptal"
    },
    "returnReasonLabels": {
      "cayma_hakki": "Cayma hakkı",
      "hasarli_kargo": "Hasarlı kargo",
      "yanlis_urun": "Yanlış ürün",
      "defolu_urun": "Defolu ürün",
      "aciklamayla_uyumsuz": "Açıklamayla uyumsuz"
    },
    "returnStatusLabels": {
      "requested": "Talep alındı",
      "approved": "Onaylandı",
      "rejected": "Reddedildi",
      "in_transit": "Geri kargoda",
      "received": "Teslim alındı",
      "refunded": "İade ödendi",
      "cancelled": "İptal edildi"
    },
    "returnConditionLabels": {
      "unopened": "Açılmamış",
      "opened": "Açılmış",
      "damaged": "Hasarlı",
      "missing": "Eksik"
    },
    "checkoutAddressDefaults": {
      "title": "Ev",
      "fullName": "Web Müşterisi",
      "phone": "5551234567",
      "city": "İstanbul",
      "district": "Kadıköy",
      "postalCode": "34000",
      "addressLine": "Web ödeme test adresi"
    },
    "contactInfo": {
      "address": "Kadıköy, İstanbul",
      "phone": "0216 000 00 00",
      "email": "destek@bahceshop.com",
      "mapLabel": "Mağaza Konumu"
    }
  }'::jsonb,
  updated_at = NOW()
WHERE key = 'storefront';
