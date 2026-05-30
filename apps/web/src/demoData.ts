import type { Cart, Category, Product, ProductReview } from "./api";
import { wpAssets } from "./assets";

export const demoCategories: Category[] = [
  {
    id: "cat-hand-tools",
    name: "El Aletleri",
    slug: "el-aletleri",
    description: "Budama, kazma, capalama ve temel bahce bakimi icin dayanikli el aletleri.",
    imageUrl: wpAssets.categoryImages[0],
    productCount: 5,
    children: [
      { id: "cat-pruning", parentId: "cat-hand-tools", name: "Budama ve Kesim", slug: "budama-ve-kesim", imageUrl: wpAssets.categoryImages[1], productCount: 2, children: [] },
      { id: "cat-soil-tools", parentId: "cat-hand-tools", name: "Toprak Isleme", slug: "toprak-isleme", imageUrl: wpAssets.categoryImages[2], productCount: 3, children: [] },
    ],
  },
  {
    id: "cat-powered",
    name: "Motorlu Ekipman",
    slug: "motorlu-ekipman",
    description: "Akulu, elektrikli ve motorlu bahce makineleri.",
    imageUrl: wpAssets.categoryImages[3],
    productCount: 4,
    children: [
      { id: "cat-mowers", parentId: "cat-powered", name: "Cim Bicme", slug: "cim-bicme", imageUrl: wpAssets.categoryImages[4], productCount: 2, children: [] },
      { id: "cat-saws", parentId: "cat-powered", name: "Testereler", slug: "testereler", imageUrl: wpAssets.categoryImages[5], productCount: 2, children: [] },
    ],
  },
  {
    id: "cat-irrigation",
    name: "Sulama",
    slug: "sulama",
    description: "Hortum, tabanca, damla sulama ve sulama aksesuarlari.",
    imageUrl: wpAssets.categoryImages[6],
    productCount: 4,
    children: [
      { id: "cat-hose", parentId: "cat-irrigation", name: "Hortum ve Baslik", slug: "hortum-ve-baslik", imageUrl: wpAssets.categoryImages[7], productCount: 2, children: [] },
      { id: "cat-drip", parentId: "cat-irrigation", name: "Damla Sulama", slug: "damla-sulama", imageUrl: wpAssets.categoryImages[8], productCount: 2, children: [] },
    ],
  },
  {
    id: "cat-pots-soil",
    name: "Saksi ve Toprak",
    slug: "saksi-ve-toprak",
    description: "Saksi, torf, toprak ve bitki besini urunleri.",
    imageUrl: wpAssets.categoryImages[2],
    productCount: 5,
    children: [
      { id: "cat-pots", parentId: "cat-pots-soil", name: "Saksilar", slug: "saksilar", imageUrl: wpAssets.categoryImages[0], productCount: 2, children: [] },
      { id: "cat-soil", parentId: "cat-pots-soil", name: "Toprak ve Gubre", slug: "toprak-ve-gubre", imageUrl: wpAssets.categoryImages[1], productCount: 3, children: [] },
    ],
  },
  {
    id: "cat-plants-seeds",
    name: "Bitki ve Tohum",
    slug: "bitki-ve-tohum",
    description: "Mevsimlik fide, sus bitkisi ve tohum secenekleri.",
    imageUrl: wpAssets.categoryImages[5],
    productCount: 4,
    children: [
      { id: "cat-seeds", parentId: "cat-plants-seeds", name: "Tohumlar", slug: "tohumlar", imageUrl: wpAssets.categoryImages[3], productCount: 2, children: [] },
      { id: "cat-plants", parentId: "cat-plants-seeds", name: "Canli Bitkiler", slug: "canli-bitkiler", imageUrl: wpAssets.categoryImages[4], productCount: 2, children: [] },
    ],
  },
];

const categoryById = new Map<string, Category>();
function collectCategories(categories: Category[]) {
  categories.forEach((category) => {
    categoryById.set(category.id, category);
    collectCategories(category.children ?? []);
  });
}
collectCategories(demoCategories);

function demoImage(productId: string, imageIndex: number) {
  const source = wpAssets.productImages[imageIndex % wpAssets.productImages.length];
  return {
    id: `${productId}-img-${imageIndex + 1}`,
    productId,
    url: source,
    thumbnailUrl: source,
    webpUrl: source,
    altText: null,
    sortOrder: imageIndex,
    createdAt: "2026-05-30T00:00:00.000Z",
  };
}

function product(input: {
  id: string;
  sku: string;
  slug: string;
  name: string;
  categoryId: string;
  priceCents: number;
  compareAtPriceCents?: number | null;
  stock: number;
  imageIndex: number;
  material: string;
  usageArea: string[];
  seasonTags: string[];
  warrantyMonths?: number;
  shortDescription: string;
  description: string;
}): Product {
  const category = categoryById.get(input.categoryId) ?? null;
  const variantId = `${input.id}-std`;
  return {
    id: input.id,
    sku: input.sku,
    slug: input.slug,
    name: input.name,
    categoryId: input.categoryId,
    category,
    breadcrumb: category ? [category] : [],
    shortDescription: input.shortDescription,
    description: input.description,
    isActive: true,
    minStockAlert: 5,
    material: input.material,
    usageArea: input.usageArea,
    seasonTags: input.seasonTags,
    warrantyMonths: input.warrantyMonths ?? 24,
    isReturnable: true,
    isHazardous: false,
    brand: { id: "brand-gnbtechmachinery", name: "Gnbtechmachinery", slug: "gnbtechmachinery", logoUrl: null },
    variants: [
      {
        id: variantId,
        sku: `${input.sku}-STD`,
        priceCents: input.priceCents,
        compareAtPriceCents: input.compareAtPriceCents ?? null,
        options: { paket: "Standart" },
        isActive: true,
      },
    ],
    images: [demoImage(input.id, input.imageIndex), demoImage(input.id, input.imageIndex + 1)],
    primaryImage: demoImage(input.id, input.imageIndex),
    stock: {
      available: input.stock,
      variants: [{ variantId, available: input.stock, onHand: input.stock + 2, reserved: 2 }],
    },
    stockStatus: input.stock < 1 ? "out_of_stock" : input.stock <= 5 ? "low_stock" : "in_stock",
  };
}

export const demoProducts: Product[] = [
  product({
    id: "demo-budama-makasi-pro",
    sku: "EL-101",
    slug: "budama-makasi-pro",
    name: "Profesyonel Budama Makasi",
    categoryId: "cat-pruning",
    priceCents: 54900,
    compareAtPriceCents: 69900,
    stock: 18,
    imageIndex: 0,
    material: "Karbon celik",
    usageArea: ["Bahce", "Meyve agaci", "Peyzaj"],
    seasonTags: ["Ilkbahar", "Yaz"],
    shortDescription: "Keskin agizli, avuc ici rahat, gunluk budama isleri icin guvenilir makas.",
    description: "Profesyonel Budama Makasi, kalin dallarda temiz kesim saglayan karbon celik agiz yapisi ve kaymaz tutusuyla uzun sureli kullanim icin hazirlandi.",
  }),
  product({
    id: "demo-capa-seti",
    sku: "EL-118",
    slug: "celik-capa-ve-tirmik-seti",
    name: "Celik Capa ve Tirmik Seti",
    categoryId: "cat-soil-tools",
    priceCents: 89900,
    compareAtPriceCents: 109900,
    stock: 24,
    imageIndex: 1,
    material: "Isil islemli celik",
    usageArea: ["Toprak havalandirma", "Sebze bahcesi"],
    seasonTags: ["Ilkbahar", "Sonbahar"],
    shortDescription: "Toprak hazirligi icin guclu iki parca bahce seti.",
    description: "Capa ve tirmik seti, sert zeminde guven veren govde yapisi ve dengeli sap tasarimiyla sezon hazirliklarini hizlandirir.",
  }),
  product({
    id: "demo-akulu-cim-bicme",
    sku: "MO-204",
    slug: "akulu-cim-bicme-makinesi-36v",
    name: "Akulu Cim Bicme Makinesi 36V",
    categoryId: "cat-mowers",
    priceCents: 1249900,
    compareAtPriceCents: 1399900,
    stock: 9,
    imageIndex: 2,
    material: "ABS govde, celik bicak",
    usageArea: ["Cim alani", "Villa bahcesi"],
    seasonTags: ["Ilkbahar", "Yaz"],
    warrantyMonths: 36,
    shortDescription: "Sessiz calisan, ayarlanabilir yukseklikli akulu cim bicme makinesi.",
    description: "36V akulu motor, tek sarjla orta olcekli bahceler icin yeterli performans sunar. Katlanabilir sap yapisi depolamayi kolaylastirir.",
  }),
  product({
    id: "demo-elektrikli-capa",
    sku: "MO-211",
    slug: "elektrikli-capa-makinesi-1500w",
    name: "Elektrikli Capa Makinesi 1500W",
    categoryId: "cat-soil-tools",
    priceCents: 849900,
    compareAtPriceCents: 929900,
    stock: 6,
    imageIndex: 3,
    material: "Celik disli, polimer govde",
    usageArea: ["Sebze bahcesi", "Hobi sera"],
    seasonTags: ["Ilkbahar"],
    warrantyMonths: 24,
    shortDescription: "Kompakt bahceler icin guclu ve kolay kullanilan elektrikli capa.",
    description: "1500W motor ve genis isleme capi sayesinde toprak gevsetme, havalandirma ve ekim hazirligi islemlerini tek geciste daha verimli hale getirir.",
  }),
  product({
    id: "demo-damla-sulama",
    sku: "SU-315",
    slug: "damla-sulama-seti-25m",
    name: "Damla Sulama Seti 25 m",
    categoryId: "cat-drip",
    priceCents: 39900,
    compareAtPriceCents: 49900,
    stock: 32,
    imageIndex: 4,
    material: "UV dayanikli PVC",
    usageArea: ["Sebze yatagi", "Balkon", "Sera"],
    seasonTags: ["Yaz", "Ilkbahar"],
    shortDescription: "Saksilar ve sebze yataklari icin ekonomik damla sulama cozum seti.",
    description: "25 metrelik damla sulama seti, suyu dogrudan kok bolgesine tasir ve yaz aylarinda duzenli sulama rutini kurmayi kolaylastirir.",
  }),
  product({
    id: "demo-hortum-basligi",
    sku: "SU-322",
    slug: "ayarlanabilir-hortum-basligi",
    name: "Ayarlanabilir Hortum Basligi",
    categoryId: "cat-hose",
    priceCents: 24900,
    stock: 4,
    imageIndex: 5,
    material: "Aluminyum, kauçuk kaplama",
    usageArea: ["Sulama", "Yikama"],
    seasonTags: ["Yaz"],
    shortDescription: "Ince sislemeden guclu akisa kadar 7 farkli sulama modu.",
    description: "Ergonomik tetik ve metal govde, gunluk sulama ve temizlik islerinde daha kontrollu kullanim saglar.",
  }),
  product({
    id: "demo-terracotta-saksi",
    sku: "SA-410",
    slug: "terracotta-saksi-30-cm",
    name: "Terracotta Saksi 30 cm",
    categoryId: "cat-pots",
    priceCents: 32900,
    stock: 27,
    imageIndex: 6,
    material: "Terracotta kil",
    usageArea: ["Balkon", "Salon", "Teras"],
    seasonTags: ["Tum sezon"],
    shortDescription: "Nefes alan yapisiyla kok gelisimini destekleyen klasik saksi.",
    description: "Dogal terracotta malzeme nem dengesini korur. 30 cm capi ile orta boy sus bitkileri ve aromatik bitkiler icin uygundur.",
  }),
  product({
    id: "demo-bitki-topragi",
    sku: "TP-502",
    slug: "torflu-bitki-topragi-20l",
    name: "Torflu Bitki Topragi 20 L",
    categoryId: "cat-soil",
    priceCents: 18900,
    stock: 40,
    imageIndex: 7,
    material: "Torf, perlit, organik karisim",
    usageArea: ["Saksi", "Fide", "Sebze"],
    seasonTags: ["Tum sezon"],
    shortDescription: "Fide ve saksilar icin dengeli, havadar bitki topragi.",
    description: "Torflu Bitki Topragi, koklenmeyi destekleyen havadar yapisi ve dengeli organik karisimiyle ic ve dis mekan bitkilerinde guvenle kullanilir.",
  }),
  product({
    id: "demo-lavanta-fidesi",
    sku: "SB-620",
    slug: "lavanta-fidesi",
    name: "Lavanta Fidesi",
    categoryId: "cat-plants",
    priceCents: 9900,
    stock: 16,
    imageIndex: 0,
    material: "Canli bitki",
    usageArea: ["Balkon", "Bahce", "Peyzaj"],
    seasonTags: ["Ilkbahar", "Yaz"],
    shortDescription: "Kokulu ve dayanikli lavanta fidesi.",
    description: "Gunesli alanlarda hizla gelisen lavanta, dekoratif gorunumu ve kokusuyla bahce sinirlarinda, balkon saksilarinda ve peyzaj alanlarinda tercih edilir.",
  }),
  product({
    id: "demo-domates-tohumu",
    sku: "TO-701",
    slug: "domates-tohumu-yerli",
    name: "Yerli Domates Tohumu",
    categoryId: "cat-seeds",
    priceCents: 6900,
    stock: 50,
    imageIndex: 1,
    material: "Tohum",
    usageArea: ["Sebze bahcesi", "Sera"],
    seasonTags: ["Ilkbahar"],
    shortDescription: "Ev bahceleri icin verimli yerli domates tohumu.",
    description: "Yerli domates tohumu, fideleme doneminden hasada kadar dengeli gelisim saglayan ve hobi bahceleri icin ideal bir secenektir.",
  }),
  product({
    id: "demo-bahce-sandalyesi",
    sku: "BM-810",
    slug: "katlanir-bahce-sandalyesi",
    name: "Katlanir Bahce Sandalyesi",
    categoryId: "cat-pots-soil",
    priceCents: 119900,
    compareAtPriceCents: 139900,
    stock: 13,
    imageIndex: 2,
    material: "Toz boyali metal, tekstil kumas",
    usageArea: ["Teras", "Balkon", "Bahce"],
    seasonTags: ["Yaz"],
    shortDescription: "Hafif, katlanabilir ve kolay tasinabilir bahce sandalyesi.",
    description: "Katlanir Bahce Sandalyesi, gunluk kullanim icin saglam metal iskelet ve kolay temizlenen kumas yuzeyle tasarlandi.",
  }),
  product({
    id: "demo-gubre",
    sku: "GU-901",
    slug: "organik-solucan-gubresi-5l",
    name: "Organik Solucan Gubresi 5 L",
    categoryId: "cat-soil",
    priceCents: 21900,
    stock: 28,
    imageIndex: 3,
    material: "Organik gubre",
    usageArea: ["Saksi", "Sebze", "Meyve"],
    seasonTags: ["Ilkbahar", "Sonbahar"],
    shortDescription: "Toprak verimini artiran organik destek.",
    description: "Organik solucan gubresi, toprak canliligini destekler ve bitkilerin sezon boyunca daha dengeli beslenmesine yardimci olur.",
  }),
];

export function demoProductList(options: { q?: string; category?: string | null; limit?: number } = {}) {
  const query = options.q?.trim().toLocaleLowerCase("tr-TR") ?? "";
  const category = options.category?.trim() ?? "";
  const categoryIds = category ? descendantCategoryIds(category) : new Set<string>();
  const data = demoProducts.filter((item) => {
    const inCategory = !category || categoryIds.has(item.categoryId ?? "") || item.category?.slug === category || item.categoryId === category;
    const text = [item.name, item.sku, item.slug, item.shortDescription, item.description, item.category?.name]
      .join(" ")
      .toLocaleLowerCase("tr-TR");
    return inCategory && (!query || text.includes(query));
  });
  return typeof options.limit === "number" ? data.slice(0, options.limit) : data;
}

export function demoRelatedProducts(product: Product, limit = 4) {
  return demoProducts
    .filter((item) => item.id !== product.id && item.categoryId === product.categoryId)
    .concat(demoProducts.filter((item) => item.id !== product.id && item.categoryId !== product.categoryId))
    .slice(0, limit);
}

export function demoReviews(productId: string): { data: ProductReview[]; meta: { averageRating: number; total: number } } {
  const data: ProductReview[] = [
    {
      id: `${productId}-review-1`,
      productId,
      customerName: "Mert A.",
      rating: 5,
      title: "Bekledigimden iyi",
      comment: "Paketleme duzgundu, malzeme kalitesi fiyatina gore gayet iyi.",
      createdAt: "2026-05-12T09:30:00.000Z",
    },
    {
      id: `${productId}-review-2`,
      productId,
      customerName: "Selin K.",
      rating: 4,
      title: "Is goruyor",
      comment: "Bahce isleri icin yeterli. Kargo da bekledigimden hizli geldi.",
      createdAt: "2026-05-18T14:15:00.000Z",
    },
  ];
  return { data, meta: { averageRating: 4.5, total: data.length } };
}

export function emptyDemoCart(): Cart {
  return { cartId: "demo-cart", items: [], appliedCouponCode: null, couponDiscountCents: 0 };
}

function descendantCategoryIds(idOrSlug: string) {
  const result = new Set<string>();
  const roots = demoCategories.filter((category) => category.id === idOrSlug || category.slug === idOrSlug);
  const visit = (category: Category) => {
    result.add(category.id);
    (category.children ?? []).forEach(visit);
  };
  roots.forEach(visit);
  if (!result.size) result.add(idOrSlug);
  return result;
}
