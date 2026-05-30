export type Category = {
  id: string;
  parentId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  productCount?: number;
  children?: Category[];
};

export type ProductImage = {
  id: string;
  productId: string;
  url: string;
  thumbnailUrl: string | null;
  webpUrl: string | null;
  altText: string | null;
  sortOrder: number;
  createdAt: string;
};

export type Product = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  isActive: boolean;
  minStockAlert?: number;
  categoryId?: string;
  material?: string | null;
  usageArea?: string[] | null;
  seasonTags?: string[] | null;
  warrantyMonths?: number | null;
  isReturnable?: boolean;
  isHazardous?: boolean;
  variants?: ProductVariant[];
  images?: ProductImage[];
  primaryImage?: ProductImage | null;
  stock?: {
    available: number;
    variants: Array<{ variantId: string; available: number; onHand: number; reserved: number }>;
  };
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock";
  brand?: { id: string; name: string; slug: string; logoUrl: string | null } | null;
  category?: Category | null;
  breadcrumb?: Category[];
};

export type ProductVariant = {
  id: string;
  sku: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  options: Record<string, unknown>;
  isActive?: boolean;
};

export type CartItem = {
  itemId: string;
  variantId: string;
  qty: number;
  unitPriceCents: number;
  productName: string;
  productSlug: string;
  variantSku: string;
};

export type Cart = {
  cartId: string;
  items: CartItem[];
  appliedCouponCode: string | null;
  couponDiscountCents?: number;
};

export type AuthSession = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    emailVerifiedAt: string | null;
  };
};

export type ShippingOption = {
  carrierCode: string;
  carrierName: string;
  priceCents: number;
  estimatedDays: number;
};

export type Address = {
  id: string;
  title: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  postalCode: string | null;
  addressLine: string;
};

export type ProductReview = {
  id: string;
  productId: string;
  customerName: string;
  rating: number;
  title: string | null;
  comment: string;
  createdAt: string;
};

export type CustomerProductItem = {
  id: string;
  customerId: string;
  productId: string;
  createdAt: string;
};

export type StorefrontSettings = {
  promoText: string;
  phoneLabel: string;
  phoneNumber: string;
  dailyDealLabel: string;
  weeklyDealsTitle: string;
  weeklyDealsSubtitle: string;
  weeklyDealsLimit: number;
  weeklyCountdownDays: number;
  weeklyCountdownHours: number;
  weeklyCountdownMinutes: number;
  promoCardOneEyebrow: string;
  promoCardOneTitle: string;
  promoCardOneButton: string;
  promoCardTwoEyebrow: string;
  promoCardTwoTitle: string;
  promoCardTwoButton: string;
  wideBannerTitle: string;
  wideBannerButton: string;
  fallbackCategories: Array<{ id: string; name: string; slug: string }>;
  orderStatusLabels: Record<string, string>;
  returnReasonLabels: Record<string, string>;
  returnStatusLabels: Record<string, string>;
  returnConditionLabels: Record<string, string>;
  checkoutAddressDefaults: {
    title: string;
    fullName: string;
    phone: string;
    city: string;
    district: string;
    postalCode: string;
    addressLine: string;
  };
  contactInfo: {
    address: string;
    phone: string;
    email: string;
    mapLabel: string;
  };
  blogPosts: Array<{
    id: string;
    title: string;
    excerpt: string;
    contentHtml: string;
    date: string;
    author: string;
    imageUrl: string;
    fontFamily: string;
    fontSize: string;
    textColor: string;
    isFeatured: boolean;
  }>;
};

export const defaultStorefrontSettings: StorefrontSettings = {
  promoText: "İlk siparişe özel %25’e varan fırsat: GET25OFF - HEMEN ALIŞVERİŞE BAŞLA",
  phoneLabel: "Hemen Ara:",
  phoneNumber: "9876-543-210",
  dailyDealLabel: "Günün Fırsatları",
  weeklyDealsTitle: "Haftanın Fırsatları",
  weeklyDealsSubtitle: "Bahçe ve el aletleri için özenle seçilmiş ürünleri keşfedin.",
  weeklyDealsLimit: 6,
  weeklyCountdownDays: 327,
  weeklyCountdownHours: 14,
  weeklyCountdownMinutes: 31,
  promoCardOneEyebrow: "Kaçırma! Sıcak Fırsat",
  promoCardOneTitle: "Bahçe işleri için güçlü ürünler",
  promoCardOneButton: "Hemen Al",
  promoCardTwoEyebrow: "Kaçırma! Sıcak Fırsat",
  promoCardTwoTitle: "Dayanıklı el aletleri ve ekipmanlar",
  promoCardTwoButton: "Hemen Al",
  wideBannerTitle: "Bahçe ve tamir ürünlerinde güçlü fırsatlar",
  wideBannerButton: "Alışverişe Başla",
  fallbackCategories: [
    { id: "Hammer Tool", name: "Çekiç Grubu", slug: "hammer-tool" },
    { id: "Drill Tool", name: "Matkap Grubu", slug: "drill-tool" },
    { id: "Circular Saw", name: "Daire Testere", slug: "circular-saw" },
    { id: "Wrench Tool", name: "Anahtar Takımı", slug: "wrench-tool" },
    { id: "Decker Tool", name: "Decker Aletleri", slug: "decker-tool" },
    { id: "Power Saw", name: "Motorlu Testere", slug: "power-saw" },
  ],
  orderStatusLabels: {
    pending_payment: "Ödeme bekliyor",
    paid: "Ödendi",
    preparing: "Hazırlanıyor",
    shipped: "Kargoda",
    delivered: "Teslim edildi",
    completed: "Tamamlandı",
    cancelled: "İptal",
  },
  returnReasonLabels: {
    cayma_hakki: "Cayma hakkı",
    hasarli_kargo: "Hasarlı kargo",
    yanlis_urun: "Yanlış ürün",
    defolu_urun: "Defolu ürün",
    aciklamayla_uyumsuz: "Açıklamayla uyumsuz",
  },
  returnStatusLabels: {
    requested: "Talep alındı",
    approved: "Onaylandı",
    rejected: "Reddedildi",
    in_transit: "Geri kargoda",
    received: "Teslim alındı",
    refunded: "İade ödendi",
    cancelled: "İptal edildi",
  },
  returnConditionLabels: {
    unopened: "Açılmamış",
    opened: "Açılmış",
    damaged: "Hasarlı",
    missing: "Eksik",
  },
  checkoutAddressDefaults: {
    title: "Ev",
    fullName: "Web Müşterisi",
    phone: "5551234567",
    city: "İstanbul",
    district: "Kadıköy",
    postalCode: "34000",
    addressLine: "Web ödeme test adresi",
  },
  contactInfo: {
    address: "Kadıköy, İstanbul",
    phone: "0216 000 00 00",
    email: "destek@bahceshop.com",
    mapLabel: "Mağaza Konumu",
  },
  blogPosts: [
    {
      id: "bahce-aleti-secimi",
      title: "Bahçe Aleti Seçerken Nelere Bakmalı?",
      excerpt: "Doğru ürünü seçmek ve sipariş sürecini daha rahat yönetmek için kısa, pratik öneriler.",
      contentHtml: "<p>Bahçe aleti seçerken ürünün kullanım alanına, malzeme kalitesine ve servis desteğine birlikte bakmak gerekir.</p>",
      date: "9 Şubat 2024",
      author: "Editör",
      imageUrl: "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/10/23-460x460.jpg",
      fontFamily: "inherit",
      fontSize: "16px",
      textColor: "#1f2937",
      isFeatured: true,
    },
    {
      id: "sezon-oncesi-bakim",
      title: "Sezon Öncesi Bakım İçin 9 İpucu",
      excerpt: "Bahçe ürünlerini daha uzun ömürlü kullanmak için bakım ve saklama önerileri.",
      contentHtml: "<p>Sezon başlamadan önce ekipmanları temizlemek, bağlantıları kontrol etmek ve sarf parçaları yenilemek işinizi kolaylaştırır.</p>",
      date: "10 Şubat 2024",
      author: "Editör",
      imageUrl: "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/14-460x460.jpg",
      fontFamily: "inherit",
      fontSize: "16px",
      textColor: "#1f2937",
      isFeatured: true,
    },
    {
      id: "guvenli-alisveris",
      title: "Güvenli Alışveriş ve Teslimat Rehberi",
      excerpt: "Ödeme, teslimat ve iade süreçlerinde bilmen gereken temel adımlar.",
      contentHtml: "<p>Sipariş verirken adres, kargo ve ödeme özetini kontrol etmek satış sonrası süreci daha sorunsuz hale getirir.</p>",
      date: "11 Şubat 2024",
      author: "Editör",
      imageUrl: "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/09-460x460.jpg",
      fontFamily: "inherit",
      fontSize: "16px",
      textColor: "#1f2937",
      isFeatured: true,
    },
  ],
};

type RequestOptions = RequestInit & {
  token?: string | null;
};

type AuthSessionListener = (session: AuthSession | null) => void;

let currentSession: AuthSession | null = null;
let sessionListener: AuthSessionListener | null = null;
let refreshPromise: Promise<AuthSession | null> | null = null;

export function setApiSession(session: AuthSession | null) {
  currentSession = session;
}

export function setApiSessionListener(listener: AuthSessionListener | null) {
  sessionListener = listener;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return requestApi<T>(path, options, true);
}

async function requestApi<T>(path: string, options: RequestOptions = {}, allowRefresh: boolean): Promise<T> {
  const response = await sendRequest(path, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (response.ok) {
    return payload;
  }

  if (allowRefresh && response.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return requestApi<T>(path, { ...options, token: refreshed.accessToken }, false);
    }
  }

  if (path.startsWith("/admin") && (response.status === 401 || response.status === 403)) {
    window.dispatchEvent(new CustomEvent("admin-session-expired", {
      detail: { status: response.status, message: payload?.message },
    }));
  }

  throw new ApiError(payload?.message ?? "Beklenmeyen bir hata oluştu.", response.status, payload?.error);
}

async function sendRequest(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const token = options.token ?? currentSession?.accessToken;
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const baseUrl = import.meta.env.VITE_API_URL || "";
  return fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = requestApi<AuthSession>("/auth/refresh", { method: "POST" }, false)
      .then((session) => {
        currentSession = session;
        sessionListener?.(session);
        return session;
      })
      .catch(() => {
        currentSession = null;
        sessionListener?.(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export function formatTry(cents: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
