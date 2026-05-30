UPDATE site_settings
SET value = value || '{
  "blogPosts": [
    {
      "id": "bahce-aleti-secimi",
      "title": "Bahçe Aleti Seçerken Nelere Bakmalı?",
      "excerpt": "Doğru ürünü seçmek ve sipariş sürecini daha rahat yönetmek için kısa, pratik öneriler.",
      "date": "9 Şubat 2024",
      "author": "Editör",
      "imageUrl": "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/10/23-460x460.jpg",
      "isFeatured": true
    },
    {
      "id": "sezon-oncesi-bakim",
      "title": "Sezon Öncesi Bakım İçin 9 İpucu",
      "excerpt": "Bahçe ürünlerini daha uzun ömürlü kullanmak için bakım ve saklama önerileri.",
      "date": "10 Şubat 2024",
      "author": "Editör",
      "imageUrl": "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/14-460x460.jpg",
      "isFeatured": true
    },
    {
      "id": "guvenli-alisveris",
      "title": "Güvenli Alışveriş ve Teslimat Rehberi",
      "excerpt": "Ödeme, teslimat ve iade süreçlerinde bilmen gereken temel adımlar.",
      "date": "11 Şubat 2024",
      "author": "Editör",
      "imageUrl": "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/09-460x460.jpg",
      "isFeatured": true
    }
  ]
}'::jsonb
WHERE key = 'storefront'
  AND NOT (value ? 'blogPosts');
