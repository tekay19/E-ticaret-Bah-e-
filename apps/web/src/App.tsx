import React, { useEffect, useState, type FormEvent } from "react";
import {
  api,
  defaultStorefrontSettings,
  formatTry,
  setApiSession,
  setApiSessionListener,
  type Address,
  type AuthSession,
  type Cart,
  type Category,
  type CustomerProductItem,
  type Product,
  type ProductReview,
  type ShippingOption,
  type StorefrontSettings,
} from "./api";
import { AdminPanel } from "./AdminPanel";
import { wpAssets } from "./assets";

type View =
  | "home"
  | "shop"
  | "product"
  | "cart"
  | "checkout"
  | "account"
  | "about"
  | "blog"
  | "contact"
  | "faq"
  | "orders"
  | "returns"
  | "verify-email"
  | "forgot-password"
  | "reset-password"
  | "privacy"
  | "stores"
  | "admin";
type ProductWithDetail = Product & { priceCents: number; compareAtPriceCents: number | null; variantId: string | null };
type OrderRecord = {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  subtotalCents?: number;
  discountCents?: number;
  shippingCents?: number;
  shippingAddress?: Record<string, unknown>;
  invoicePdfUrl?: string | null;
  returnWindowExpiresAt?: string | null;
  createdAt: string;
  items?: OrderItemRecord[];
};
type OrderItemRecord = {
  id: string;
  productSnapshot: { name?: string; slug?: string };
  variantSnapshot: Record<string, unknown>;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};
type OrderDetail = OrderRecord & {
  items: OrderItemRecord[];
  payment?: { status: string; provider: string; amountCents: number } | null;
  history?: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; changedAt: string }>;
};
type TrackingDetail = {
  shipment?: { carrierCode: string; trackingNumber: string | null; status: string } | null;
  events?: Array<{ eventType: string; description: string | null; occurredAt: string }>;
};
type ReturnRecord = {
  id: string;
  returnNumber: string;
  status: string;
  reason: string;
  refundAmountCents: number | null;
  customerNote?: string | null;
  adminNote?: string | null;
  rejectedReason?: string | null;
  returnShippingPaidBy?: string;
  returnTrackingNumber?: string | null;
  requestedAt: string;
  approvedAt?: string | null;
  receivedAt?: string | null;
  refundedAt?: string | null;
  photos?: string[] | null;
};
type ReturnDetail = ReturnRecord & {
  items?: Array<{ id: string; quantity: number; unitRefundCents: number; itemCondition: string | null; restockEligible: boolean }>;
  history?: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; changedAt: string }>;
};

const navCategories = defaultStorefrontSettings.fallbackCategories;

function findCategoryRecursive(categories: Category[], id: string | null): Category | undefined {
  if (!id) return undefined;
  for (const cat of categories) {
    if (cat.id === id) return cat;
    if (cat.children?.length) {
      const found = findCategoryRecursive(cat.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function getCategoryProductCount(cat: Category, allProducts: ProductWithDetail[]): number {
  let count = typeof cat.productCount === "number"
    ? cat.productCount
    : allProducts.filter((p) => p.categoryId === cat.id).length;
  if (cat.children?.length) {
    for (const child of cat.children) {
      count += getCategoryProductCount(child, allProducts);
    }
  }
  return count;
}

function categoryImage(category: Category, index: number) {
  return category.imageUrl || wpAssets.categoryImages[index % wpAssets.categoryImages.length];
}

function categoryImageFallback(index: number) {
  return wpAssets.categoryImages[index % wpAssets.categoryImages.length];
}

function handleCategoryImageError(event: React.SyntheticEvent<HTMLImageElement>, index: number) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = categoryImageFallback(index);
}

const orderStatusLabels: Record<string, string> = {
  pending_payment: "Ödeme bekliyor",
  paid: "Ödendi",
  preparing: "Hazırlanıyor",
  shipped: "Kargoda",
  delivered: "Teslim edildi",
  completed: "Tamamlandı",
  cancelled: "İptal",
};
const orderSteps = ["paid", "preparing", "shipped", "delivered", "completed"];
const returnReasonLabels: Record<string, string> = {
  cayma_hakki: "Cayma hakkı",
  hasarli_kargo: "Hasarlı kargo",
  yanlis_urun: "Yanlış ürün",
  defolu_urun: "Defolu ürün",
  aciklamayla_uyumsuz: "Açıklamayla uyumsuz",
};
const returnStatusLabels: Record<string, string> = {
  requested: "Talep alındı",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  in_transit: "Geri kargoda",
  received: "Teslim alındı",
  refunded: "İade ödendi",
  cancelled: "İptal edildi",
};
const returnConditionLabels: Record<string, string> = {
  unopened: "Açılmamış",
  opened: "Açılmış",
  damaged: "Hasarlı",
  missing: "Eksik",
};

function labelFor(value: string, labels: Record<string, string>) {
  return labels[value] ?? value;
}

function mergedLabels(defaults: Record<string, string>, overrides?: Record<string, string>) {
  return { ...defaults, ...(overrides ?? {}) };
}

function orderProductSummary(order: OrderRecord) {
  const names = order.items?.map((item) => item.productSnapshot.name).filter(Boolean) ?? [];
  if (!names.length) return "Ürün detayı için aç";
  if (names.length === 1) return String(names[0]);
  return `${names[0]} + ${names.length - 1} ürün`;
}

function addressSummary(address?: Record<string, unknown>) {
  if (!address) return "Adres bilgisi yok";
  return [address.line1 ?? address.addressLine, address.district, address.city].map((item) => String(item ?? "").trim()).filter(Boolean).join(", ") || "Adres bilgisi yok";
}

function customerMessage(error: unknown, fallback = "İşlem tamamlanamadı.") {
  if (!(error instanceof Error)) return fallback;
  return error.message
    .replace("Musteri", "Müşteri")
    .replace("Siparis", "Sipariş")
    .replace("Iade", "İade")
    .replace("bulunamadi", "bulunamadı");
}

function App() {
  const [view, setView] = useState<View>(() => readViewFromHash());
  const [selectedBlogId, setSelectedBlogId] = useState(() => readBlogIdFromLocation());
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductWithDetail[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithDetail | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [wishlist, setWishlist] = useState<CustomerProductItem[]>([]);
  const [compareList, setCompareList] = useState<CustomerProductItem[]>([]);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [storefrontSettings, setStorefrontSettings] = useState<StorefrontSettings>(defaultStorefrontSettings);

  useEffect(() => {
    localStorage.removeItem("bahce-session");
    setApiSessionListener(saveSession);
    void api<AuthSession>("/auth/refresh", { method: "POST" })
      .then(saveSession)
      .catch(() => saveSession(null));

    return () => setApiSessionListener(null);
  }, []);

  useEffect(() => {
    void loadCatalog();
    void refreshCart(session?.accessToken ?? null);
    void refreshCustomerLists(session?.accessToken ?? null);
  }, [session?.accessToken]);

  useEffect(() => {
    void refreshStorefrontSettings();
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setView(readViewFromHash());
      setSelectedBlogId(readBlogIdFromLocation());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (view === "account" && isAdminSession(session)) {
      navigate("admin");
    } else if (view === "admin" && (!session || !isAdminSession(session))) {
      setNotice("Bu sayfaya erişim yetkiniz bulunmamaktadır.");
      navigate("account");
    }
  }, [session, view]);

  useEffect(() => {
    if (view === "product" && !selectedProduct && products[0]) {
      setSelectedProduct(products[0]);
    }
  }, [products, selectedProduct, view]);

  async function loadCatalog(options: { q?: string; categoryId?: string | null } = {}) {
    const categoryId = options.categoryId ?? activeCategoryId;
    const category = findCategoryRecursive(categories, categoryId);
    const params = new URLSearchParams({ limit: "48" });
    const query = options.q ?? search;
    if (query.trim()) params.set("q", query.trim());
    if (category?.slug) params.set("category", category.slug);
    const [categoryResult, productResult] = await Promise.all([
      api<{ data: Category[] }>("/categories"),
      api<{ data: Product[] }>(`/products?${params.toString()}`),
    ]);
    setCategories(categoryResult.data);

    setProducts(productResult.data.map(normalizeProduct));
  }

  async function refreshStorefrontSettings() {
    const result = await api<{ data: StorefrontSettings }>("/site-settings").catch(() => ({ data: defaultStorefrontSettings }));
    setStorefrontSettings({ ...defaultStorefrontSettings, ...result.data });
  }

  async function refreshCart(token: string | null = session?.accessToken ?? null) {
    const result = await api<{ data: Cart }>("/cart", { token });
    setCart(result.data);
  }

  async function addToCart(product: ProductWithDetail, variantId = product.variantId, qty = 1) {
    const available = variantAvailability(product, variantId);
    if (!variantId || available < 1) {
      setNotice(`${product.name} için stokta eklenebilir varyant yok.`);
      return;
    }
    if (qty > available) {
      setNotice(`Bu üründen en fazla ${available} adet ekleyebilirsin.`);
      return;
    }
    try {
      const result = await api<{ data: Cart }>("/cart/items", {
        method: "POST",
        token: session?.accessToken,
        body: JSON.stringify({ variantId, qty }),
      });
      setCart(result.data);
      setNotice(`${qty} adet ${product.name} sepete eklendi.`);
    } catch (error) {
      setNotice(customerMessage(error, "Ürün sepete eklenemedi."));
    }
  }

  async function refreshCustomerLists(token: string | null = session?.accessToken ?? null) {
    if (!token) {
      setWishlist([]);
      setCompareList([]);
      return;
    }
    const [wishlistResult, compareResult] = await Promise.all([
      api<{ data: CustomerProductItem[] }>("/wishlist/items", { token }).catch(() => ({ data: [] })),
      api<{ data: CustomerProductItem[] }>("/compare/items", { token }).catch(() => ({ data: [] })),
    ]);
    setWishlist(wishlistResult.data);
    setCompareList(compareResult.data);
  }

  async function toggleCustomerItem(kind: "wishlist" | "compare", product: ProductWithDetail) {
    if (!session) {
      setNotice(`${kind === "wishlist" ? "Favoriler" : "Karşılaştırma"} için önce hesap girişi yap.`);
      navigate("account");
      return;
    }
    const current = kind === "wishlist" ? wishlist : compareList;
    const exists = current.some((item) => item.productId === product.id);
    const endpoint = kind === "wishlist" ? "/wishlist/items" : "/compare/items";
    await api(`${endpoint}${exists ? `?productId=${product.id}` : ""}`, {
      method: exists ? "DELETE" : "POST",
      token: session.accessToken,
      body: exists ? undefined : JSON.stringify({ productId: product.id }),
    });
    await refreshCustomerLists(session.accessToken);
    setNotice(`${product.name} ${kind === "wishlist" ? "favoriler" : "karşılaştırma"} ${exists ? "listesinden çıkarıldı" : "listesine eklendi"}.`);
  }

  async function runSearch(nextCategoryId: string | null = activeCategoryId) {
    setActiveCategoryId(nextCategoryId);
    await loadCatalog({ q: search, categoryId: nextCategoryId });
    navigate("shop");
  }

  function saveSession(next: AuthSession | null) {
    setSession(next);
    setApiSession(next);
  }

  function navigate(next: View) {
    setView(next);
    if (next !== "blog") {
      setSelectedBlogId("");
    }
    window.location.hash = next === "home" ? "" : next;
  }

  function openBlog(postId: string) {
    setSelectedBlogId(postId);
    setView("blog");
    window.location.hash = `blog?post=${encodeURIComponent(postId)}`;
  }

  function openProduct(product: ProductWithDetail) {
    setSelectedProduct(product);
    navigate("product");
  }

  const filtered = products;
  const cartCount = cart?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;

  if (view === "admin") {
    return (
      <div className="site-shell">
        {notice && <div className="toast" onAnimationEnd={() => setNotice(null)}>{notice}</div>}
        <AdminPanel
          session={session}
          saveSession={saveSession}
          setNotice={setNotice}
          goStorefront={() => navigate("home")}
          onCatalogChanged={() => loadCatalog({ q: "", categoryId: null })}
          onStorefrontChanged={refreshStorefrontSettings}
        />
      </div>
    );
  }

  return (
    <div className="site-shell">
      {notice && <div className="toast" onAnimationEnd={() => setNotice(null)}>{notice}</div>}
      <Header
        cartCount={cartCount}
        categories={categories}
        search={search}
        setSearch={setSearch}
        activeCategoryId={activeCategoryId}
        setView={navigate}
        setActiveCategoryId={setActiveCategoryId}
        onSearch={runSearch}
        onProductSelect={openProduct}
        session={session}
        settings={storefrontSettings}
      />
      <main>
        {view === "home" && (
          <HomePage
            categories={categories}
            products={filtered}
            setView={navigate}
            setActiveCategoryId={setActiveCategoryId}
            selectProduct={openProduct}
            addToCart={addToCart}
            toggleCustomerItem={toggleCustomerItem}
            wishlistIds={wishlist.map((item) => item.productId)}
            compareIds={compareList.map((item) => item.productId)}
            settings={storefrontSettings}
            openBlog={openBlog}
          />
        )}
        {view === "shop" && (
          <ShopPage
            products={filtered}
            categories={categories}
            activeCategoryId={activeCategoryId}
            setActiveCategoryId={(categoryId) => void runSearch(categoryId)}
            selectProduct={openProduct}
            addToCart={addToCart}
            toggleCustomerItem={toggleCustomerItem}
            wishlistIds={wishlist.map((item) => item.productId)}
            compareIds={compareList.map((item) => item.productId)}
          />
        )}
        {view === "product" && selectedProduct && (
          <ProductPage
            product={selectedProduct}
            session={session}
            setView={navigate}
            selectProduct={openProduct}
            addToCart={addToCart}
            setNotice={setNotice}
          />
        )}
        {view === "cart" && (
          <CartPage
            cart={cart}
            session={session}
            refreshCart={refreshCart}
            saveSession={saveSession}
            setNotice={setNotice}
            setView={navigate}
            mode="cart"
            settings={storefrontSettings}
          />
        )}
        {view === "checkout" && (
          <CartPage
            cart={cart}
            session={session}
            refreshCart={refreshCart}
            saveSession={saveSession}
            setNotice={setNotice}
            setView={navigate}
            mode="checkout"
            settings={storefrontSettings}
          />
        )}
        {view === "account" && (
          <AccountPage
            session={session}
            saveSession={saveSession}
            setNotice={setNotice}
            setView={navigate}
            wishlist={wishlist}
            compareList={compareList}
            products={products}
            addToCart={addToCart}
            toggleCustomerItem={toggleCustomerItem}
          />
        )}
        {view === "verify-email" && <VerifyEmailPage setView={navigate} setNotice={setNotice} />}
        {view === "forgot-password" && <ForgotPasswordPage setView={navigate} setNotice={setNotice} />}
        {view === "reset-password" && <ResetPasswordPage setView={navigate} setNotice={setNotice} />}
        {view === "orders" && <OrdersPage session={session} setView={navigate} setNotice={setNotice} saveSession={saveSession} settings={storefrontSettings} />}
        {view === "returns" && <ReturnsPage session={session} setView={navigate} setNotice={setNotice} saveSession={saveSession} settings={storefrontSettings} />}
        {view === "about" && <AboutPage />}
        {view === "blog" && <BlogPage settings={storefrontSettings} selectedBlogId={selectedBlogId} openBlog={openBlog} setView={navigate} />}
        {view === "contact" && <ContactPage setNotice={setNotice} settings={storefrontSettings} />}
        {view === "faq" && <FaqPage />}
        {view === "privacy" && <PolicyPage />}
        {view === "stores" && <StoresPage />}
      </main>
      <Footer setView={navigate} settings={storefrontSettings} />
    </div>
  );
}

function readViewFromHash(): View {
  const value = window.location.hash.replace("#", "").split("?")[0];
  const views: View[] = [
    "home",
    "shop",
    "product",
    "cart",
    "checkout",
    "account",
    "about",
    "blog",
    "contact",
    "faq",
    "orders",
    "returns",
    "verify-email",
    "forgot-password",
    "reset-password",
    "privacy",
    "stores",
    "admin",
  ];
  return views.includes(value as View) ? value as View : "home";
}

function readTokenFromLocation() {
  const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  return new URLSearchParams(hashQuery || window.location.search).get("token") ?? "";
}

function readBlogIdFromLocation() {
  const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  return new URLSearchParams(hashQuery).get("post") ?? "";
}

function normalizeProduct(product: Product): ProductWithDetail {
  const variant = bestSellableVariant(product) ?? product.variants?.[0];
  return {
    ...product,
    priceCents: variant?.priceCents ?? 0,
    compareAtPriceCents: variant?.compareAtPriceCents ?? null,
    variantId: variant?.id ?? null,
  };
}

function listToText(list: string[] | null | undefined): string {
  if (!list || !Array.isArray(list) || list.length === 0) return "";
  return list.join(", ");
}

function productImageUrl(product: ProductWithDetail, index = 0) {
  const image = product.images?.[index] ?? product.primaryImage;
  return image?.webpUrl ?? image?.thumbnailUrl ?? image?.url ?? wpAssets.productImages[index % wpAssets.productImages.length];
}

function stockLabel(product: ProductWithDetail) {
  if (product.stockStatus === "out_of_stock") return "Stokta yok";
  if (product.stockStatus === "low_stock") return `Az stok: ${product.stock?.available ?? 0} adet`;
  return `Stokta: ${product.stock?.available ?? 0} adet`;
}

function variantAvailability(product: Product, variantId?: string | null) {
  if (!variantId) return 0;
  const stock = product.stock?.variants.find((item) => item.variantId === variantId);
  if (stock) return stock.available;
  return product.stockStatus === "out_of_stock" ? 0 : product.stock?.available ?? 0;
}

function bestSellableVariant(product: Product) {
  return product.variants?.find((variant) => variant.isActive !== false && variantAvailability(product, variant.id) > 0);
}

function isSellable(product: ProductWithDetail, variantId = product.variantId) {
  return Boolean(variantId && variantAvailability(product, variantId) > 0);
}

function isAdminSession(session: AuthSession | null) {
  return session?.user.role === "admin" || session?.user.role === "super_admin";
}

function Header(props: {
  cartCount: number;
  categories: Category[];
  search: string;
  setSearch: (value: string) => void;
  activeCategoryId: string | null;
  setView: (view: View) => void;
  setActiveCategoryId: (id: string | null) => void;
  onSearch: (categoryId?: string | null) => Promise<void>;
  onProductSelect: (product: ProductWithDetail) => void;
  session: AuthSession | null;
  settings: StorefrontSettings;
}) {
  const [suggestions, setSuggestions] = useState<ProductWithDetail[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const query = props.search.trim();
    if (!query) {
      setSuggestions([]);
      setSearching(false);
      setSearchOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setSearching(true);
        const params = new URLSearchParams({ q: query, limit: "100" });
        const category = findCategoryRecursive(props.categories, props.activeCategoryId);
        if (category?.slug) params.set("category", category.slug);
        const result = await api<{ data: Product[] }>(`/products?${params.toString()}`, { signal: controller.signal });
        setSuggestions(result.data.map(normalizeProduct));
        setSearchOpen(true);
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [props.search, props.activeCategoryId, props.categories]);

  function chooseCategory(id: string) {
    props.setActiveCategoryId(id || null);
    void props.onSearch(id || null);
  }

  function submitSearch() {
    setSearchOpen(false);
    void props.onSearch(props.activeCategoryId);
  }

  function selectSuggestion(product: ProductWithDetail) {
    setSearchOpen(false);
    props.onProductSelect(product);
  }

  function renderCategoryOptions(categories: Category[], depth = 0): React.ReactNode[] {
    return categories.flatMap((category) => [
      <option key={category.id} value={category.id}>{`${"  ".repeat(depth)}${category.name}`}</option>,
      ...renderCategoryOptions(category.children ?? [], depth + 1),
    ]);
  }

  function renderCategoryPanel(mode: "compact" | "mega") {
    const visibleCategories = props.categories.length
      ? props.categories
      : props.settings.fallbackCategories.map((cat) => ({ id: cat.id, name: cat.name, slug: cat.slug, children: [] }));

    return (
      <div className={`category-dropdown ${mode === "mega" ? "mega-dropdown" : ""}`}>
        <div className="category-dropdown-head">
          <span>Kataloğa göz at</span>
          <b>{visibleCategories.length} kategori</b>
        </div>
        <div className="category-dropdown-grid">
          {visibleCategories.map((category) => (
            <div className="category-dropdown-group" key={category.id}>
              <button onClick={() => chooseCategory(category.id)}>{category.name}</button>
              {!!category.children?.length && (
                <div>
                  {category.children.map((child) => (
                    <button key={child.id} onClick={() => chooseCategory(child.id)}>{child.name}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <button className="category-dropdown-all" onClick={() => chooseCategory("")}>Tüm kategorileri göster</button>
      </div>
    );
  }

  return (
    <header>
      <div className="top-strip">
        <button className="promo-strip-link" onClick={() => props.setView("shop")}>{props.settings.promoText}</button>
        <nav>
          <button onClick={() => props.setView("about")}>Hakkımızda</button>
          <button onClick={() => props.setView("blog")}>Blog</button>
          <button onClick={() => props.setView("contact")}>İletişim</button>
          <button onClick={() => props.setView("faq")}>Sık Sorulanlar</button>
        </nav>
      </div>
      <div className="main-header">
        <button className="brand" onClick={() => props.setView("home")}>
          <img src={wpAssets.logo} alt="Toolband" />
        </button>
        <div className="search-box">
          <select aria-label="Kategori" value={props.activeCategoryId ?? ""} onChange={(event) => chooseCategory(event.target.value)}>
            <option value="">Tüm Kategoriler</option>
            {renderCategoryOptions(props.categories)}
          </select>
          <input
            value={props.search}
            onChange={(event) => props.setSearch(event.target.value)}
            onFocus={() => setSearchOpen(Boolean(props.search.trim()))}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitSearch();
              if (event.key === "Escape") setSearchOpen(false);
            }}
            placeholder="Ürün, kategori veya SKU ara..."
          />
          <button onClick={submitSearch}>Ara</button>
          {searchOpen && props.search.trim() && (
            <div className="search-suggestions" onMouseDown={(event) => event.preventDefault()}>
              <div className="search-suggestions-head">
                <span>{searching ? "Aranıyor..." : suggestions.length ? `${suggestions.length} ürün bulundu` : "Sonuç bulunamadı"}</span>
                <button onClick={submitSearch}>Tümünü göster</button>
              </div>
              {!searching && suggestions.length === 0 && (
                <p>Bu kelimeyle ürün bulunamadı. SKU, ürün adı veya açıklama ile tekrar dene.</p>
              )}
              {suggestions.map((product) => (
                <button className="search-suggestion-item" key={product.id} onClick={() => selectSuggestion(product)}>
                  <img src={productImageUrl(product)} alt={product.name} />
                  <span>
                    <b>{product.name}</b>
                    <small>{product.sku} · {formatTry(product.priceCents)}</small>
                  </span>
                  <em>{stockLabel(product)}</em>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="header-actions">
          <span className="phone">{props.settings.phoneLabel}<b>{props.settings.phoneNumber}</b></span>
          <button onClick={() => props.setView(isAdminSession(props.session) ? "admin" : "account")}>{props.session ? (isAdminSession(props.session) ? "Admin" : "Hesabım") : "Giriş Yap"}</button>
          <button className="cart-button" onClick={() => props.setView("cart")}>Sepet <strong>{props.cartCount}</strong></button>
        </div>
      </div>
      <div className="nav-bar">
        <div className="category-menu">
          <button className="category-toggle" onClick={() => props.setView("shop")}>☰ Kategoriler</button>
          {renderCategoryPanel("compact")}
        </div>
        <nav>
          <button onClick={() => props.setView("home")}>Anasayfa</button>
          <button onClick={() => props.setView("shop")}>Mağaza</button>
          <div className="nav-menu-item">
            <button onClick={() => props.setView("shop")}>Kategoriler <span>İNDİRİM</span></button>
            {renderCategoryPanel("mega")}
          </div>
          <button onClick={() => props.setView("shop")}>Ürünler <span>POPÜLER</span></button>
          <button onClick={() => props.setView("orders")}>Siparişler</button>
          <button onClick={() => props.setView("returns")}>İadeler</button>
        </nav>
        <button className="deal-button" onClick={() => props.setView("shop")}>{props.settings.dailyDealLabel}</button>
      </div>
    </header>
  );
}

function HomePage(props: {
  categories: Category[];
  products: ProductWithDetail[];
  setView: (view: View) => void;
  openBlog: (postId: string) => void;
  setActiveCategoryId: (id: string | null) => void;
  selectProduct: (product: ProductWithDetail) => void;
  addToCart: (product: ProductWithDetail) => void;
  toggleCustomerItem: (kind: "wishlist" | "compare", product: ProductWithDetail) => Promise<void>;
  wishlistIds: string[];
  compareIds: string[];
  settings: StorefrontSettings;
}) {
  return (
    <>
      <section className="hero">
        <article style={{ backgroundImage: `url(${wpAssets.hero1})` }}>
          <div>
            <p>Acele et! %25’e varan indirim</p>
            <h1>Profesyonel El Aleti Seti</h1>
            <span>Dayanıklı ürünler {formatTry(5900)}’den başlar</span>
            <button onClick={() => props.setView("shop")}>Alışverişe Başla</button>
          </div>
        </article>
        <article style={{ backgroundImage: `url(${wpAssets.hero2})` }}>
          <div>
            <p>Acele et! %30’a varan indirim</p>
            <h1>Bahçe ve Tamir Ürünleri</h1>
            <span>Ev ve bahçe işleri için {formatTry(9900)}’den başlar</span>
            <button onClick={() => props.setView("shop")}>Alışverişe Başla</button>
          </div>
        </article>
      </section>

      <SectionTitle title="Öne Çıkan Kategoriler" subtitle="Kategoriler admin panelindeki resim ve ürün adetleriyle otomatik güncellenir." />
      <section className="category-wheel">
        {(props.categories.length ? props.categories : props.settings.fallbackCategories.map((cat) => ({ id: cat.id, name: cat.name, slug: cat.slug, children: [] }))).map((category, index) => (
          <button key={category.id} onClick={() => { props.setActiveCategoryId(category.id); props.setView("shop"); }}>
            <img src={categoryImage(category, index)} alt="" onError={(event) => handleCategoryImageError(event, index)} />
            <b>{category.name}</b>
            <small>{getCategoryProductCount(category, props.products)} ürün</small>
          </button>
        ))}
      </section>

      <section className="service-row">
        {["Ücretsiz Kargo|Belirli tutar üzeri siparişlerde", "30 Gün İade|Kolay iade ve değişim", "Güvenli Ödeme|Kart ödemeleri desteklenir", "Özel Fırsatlar|Bize her zaman ulaşın", "7/24 Destek|Her zaman yanınızdayız"].map((item) => {
          const [title, text] = item.split("|");
          return <div key={title}><span>◎</span><b>{title}</b><small>{text}</small></div>;
        })}
      </section>

      <SectionTitle title="Çok Satan Ürünler" tabs={["Motorlu Ürünler", "El Aletleri", "Bahçe Ürünleri"]} />
      <ProductGrid
        products={props.products.slice(0, 8)}
        selectProduct={props.selectProduct}
        addToCart={props.addToCart}
        toggleCustomerItem={props.toggleCustomerItem}
        wishlistIds={props.wishlistIds}
        compareIds={props.compareIds}
      />

      <section className="promo-pair">
        <Promo image={wpAssets.cms1} eyebrow={props.settings.promoCardOneEyebrow} title={props.settings.promoCardOneTitle} buttonText={props.settings.promoCardOneButton} setView={props.setView} />
        <Promo image={wpAssets.cms2} eyebrow={props.settings.promoCardTwoEyebrow} title={props.settings.promoCardTwoTitle} buttonText={props.settings.promoCardTwoButton} setView={props.setView} />
      </section>

      <SectionTitle title={props.settings.weeklyDealsTitle} subtitle={props.settings.weeklyDealsSubtitle} />
      <section className="deal-panel">
        <div className="countdown"><b>{props.settings.weeklyCountdownDays}</b><span>Gün</span><b>{props.settings.weeklyCountdownHours}</b><span>Saat</span><b>{props.settings.weeklyCountdownMinutes}</b><span>Dk</span></div>
        <ProductList products={props.products.slice(0, props.settings.weeklyDealsLimit)} selectProduct={props.selectProduct} />
      </section>

      <section className="wide-banner" style={{ backgroundImage: `url(${wpAssets.shopBanner})` }}>
        <h2>{props.settings.wideBannerTitle}</h2>
        <button onClick={() => props.setView("shop")}>{props.settings.wideBannerButton}</button>
      </section>

      <Testimonials />
      <BlogPreview settings={props.settings} openBlog={props.openBlog} />
      <section className="brand-strip">{wpAssets.brands.map((brand) => <button onClick={() => props.setView("shop")} key={brand}><img src={brand} alt="Marka" /></button>)}</section>
    </>
  );
}

function ShopPage(props: {
  products: ProductWithDetail[];
  categories: Category[];
  activeCategoryId: string | null;
  setActiveCategoryId: (id: string | null) => void;
  selectProduct: (product: ProductWithDetail) => void;
  addToCart: (product: ProductWithDetail) => void;
  toggleCustomerItem: (kind: "wishlist" | "compare", product: ProductWithDetail) => Promise<void>;
  wishlistIds: string[];
  compareIds: string[];
}) {
  const renderSidebarCategory = (category: Category, depth = 0): React.ReactNode => {
    const isActive = props.activeCategoryId === category.id;
    const count = getCategoryProductCount(category, props.products);
    return (
      <React.Fragment key={category.id}>
        <button
          className={`sidebar-cat-btn ${isActive ? "active-filter" : ""}`}
          style={{ paddingLeft: `${16 + depth * 14}px` }}
          onClick={() => props.setActiveCategoryId(category.id)}
        >
          <span className="sidebar-cat-name">{category.name}</span>
          <span className="sidebar-cat-count">{count}</span>
        </button>
        {category.children?.map(child => renderSidebarCategory(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <section className="shop-layout">
      <aside>
        <h3>Kategorilere Göre Alışveriş</h3>
        <button className={`sidebar-cat-btn ${!props.activeCategoryId ? "active-filter" : ""}`} onClick={() => props.setActiveCategoryId(null)}>
          <span className="sidebar-cat-name">Tüm Ürünler</span>
          <span className="sidebar-cat-count">{props.products.length}</span>
        </button>
        {(props.categories.length ? props.categories : []).map((category) => renderSidebarCategory(category))}
        <div className="mini-banner" style={{ backgroundImage: `url(${wpAssets.cms3})` }} />
      </aside>
      <div>
        <div className="shop-hero"><h1>Mağaza</h1><p>Ürünler backend katalog verisiyle canlı olarak listelenir.</p></div>
        <ProductGrid
          products={props.products}
          selectProduct={props.selectProduct}
          addToCart={props.addToCart}
          toggleCustomerItem={props.toggleCustomerItem}
          wishlistIds={props.wishlistIds}
          compareIds={props.compareIds}
        />
      </div>
    </section>
  );
}

function CartPage(props: {
  cart: Cart | null;
  session: AuthSession | null;
  refreshCart: () => Promise<void>;
  saveSession: (session: AuthSession | null) => void;
  setNotice: (value: string) => void;
  setView: (view: View) => void;
  mode: "cart" | "checkout";
  settings: StorefrontSettings;
}) {
  const addressDefaults = props.settings.checkoutAddressDefaults;
  const [coupon, setCoupon] = useState("SPRINT9");
  const [shipping, setShipping] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressForm, setAddressForm] = useState({
    title: addressDefaults.title,
    fullName: props.session?.user.id ? addressDefaults.fullName : "",
    phone: addressDefaults.phone,
    city: addressDefaults.city,
    district: addressDefaults.district,
    postalCode: addressDefaults.postalCode,
    addressLine: addressDefaults.addressLine,
  });
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<OrderDetail | null>(null);
  const subtotal = props.cart?.items.reduce((sum, item) => sum + item.qty * item.unitPriceCents, 0) ?? 0;
  const discount = props.cart?.couponDiscountCents ?? 0;
  const total = subtotal - discount + (selectedShipping?.priceCents ?? 0);

  useEffect(() => {
    if (props.mode !== "checkout" || !props.session) return;
    void loadAddresses();
  }, [props.mode, props.session?.accessToken]);

  useEffect(() => {
    setAddressForm((current) => ({
      ...current,
      title: addressDefaults.title,
      fullName: current.fullName || (props.session?.user.id ? addressDefaults.fullName : ""),
      phone: addressDefaults.phone,
      city: addressDefaults.city,
      district: addressDefaults.district,
      postalCode: addressDefaults.postalCode,
      addressLine: addressDefaults.addressLine,
    }));
  }, [addressDefaults, props.session?.user.id]);

  async function applyCoupon() {
    try {
      await api("/cart/coupon", {
        method: "POST",
        token: props.session?.accessToken,
        body: JSON.stringify({ code: coupon }),
      });
      await props.refreshCart();
    } catch (error) {
      props.setNotice(customerMessage(error, "Kupon uygulanamadı."));
    }
  }

  async function loadShipping() {
    const result = await api<{ data: ShippingOption[] }>("/cart/shipping/options", {
      method: "POST",
      token: props.session?.accessToken,
      body: JSON.stringify({ addressId: selectedAddressId || undefined, deliveryCity: selectedAddress()?.city ?? addressForm.city }),
    });
    setShipping(result.data);
    setSelectedShipping(result.data[0] ?? null);
    return result.data;
  }

  async function loadAddresses() {
    if (!props.session) return;
    const result = await api<Address[]>("/addresses", { token: props.session.accessToken });
    setAddresses(result);
    setSelectedAddressId(result[0]?.id ?? "");
  }

  function selectedAddress() {
    return addresses.find((address) => address.id === selectedAddressId) ?? null;
  }

  async function ensureCheckoutAddress() {
    if (!props.session) return null;
    const current = selectedAddress();
    if (current) return current;
    const created = await api<Address>("/addresses", {
      method: "POST",
      token: props.session.accessToken,
      body: JSON.stringify(addressForm),
    });
    setAddresses((items) => [created, ...items]);
    setSelectedAddressId(created.id);
    return created;
  }

  async function checkout() {
    if (!props.session) {
      props.setNotice("Ödeme için önce hesap girişi yap.");
      return;
    }
    const address = await ensureCheckoutAddress();
    if (!address) return;
    const options = selectedShipping ? shipping : await loadShipping();
    const option = selectedShipping ?? options[0];
    try {
      const result = await api<{ token: string }>("/checkout/initiate", {
        method: "POST",
        token: props.session.accessToken,
        headers: { "idempotency-key": `web-${Date.now()}` },
        body: JSON.stringify({
          carrierCode: option?.carrierCode ?? "aras",
          shippingCents: option?.priceCents ?? 0,
          shippingAddress: {
            fullName: address.fullName,
            phone: address.phone,
            city: address.city,
            district: address.district,
            postalCode: address.postalCode,
            line1: address.addressLine,
          },
        }),
      });
      setCheckoutToken(result.token);
    } catch (error) {
      props.setNotice(customerMessage(error, "Ödeme başlatılamadı."));
    }
  }

  async function confirmCheckout() {
    if (!checkoutToken) return;
    try {
      const result = await api<{ status: string; order: OrderDetail }>("/checkout/confirm", {
        method: "POST",
        body: JSON.stringify({ token: checkoutToken }),
      });
      props.setNotice("Ödeme başarılı, sipariş oluştu.");
      setCheckoutSuccess(result.order);
      setCheckoutToken(null);
      await props.refreshCart();
    } catch (error) {
      props.setNotice(customerMessage(error, "Ödeme onaylanamadı."));
    }
  }

  if (checkoutSuccess) {
    return <section className="cart-page checkout-success"><div className="success-hero"><span>Sipariş alındı</span><h1>{checkoutSuccess.orderNumber}</h1><p>Ödemen alındı. Sipariş hazırlık ve kargo adımlarını hesabından takip edebilirsin.</p></div><div className="order-summary-grid"><article><span>Toplam</span><strong>{formatTry(checkoutSuccess.totalCents)}</strong></article><article><span>Ödeme</span><strong>{checkoutSuccess.payment?.status ?? "Başarılı"}</strong></article><article><span>Teslimat</span><strong>{addressSummary(checkoutSuccess.shippingAddress)}</strong></article><article><span>Sonraki adım</span><strong>Hazırlanıyor</strong></article></div><div className="order-items">{checkoutSuccess.items.map((item) => <article key={item.id}><b>{item.productSnapshot.name ?? "Ürün"}</b><span>{item.quantity} x {formatTry(item.unitPriceCents)}</span><strong>{formatTry(item.totalCents)}</strong></article>)}</div><div className="account-actions"><button className="primary" onClick={() => props.setView("orders")}>Sipariş detayına git</button><button onClick={() => props.setView("shop")}>Alışverişe devam et</button></div></section>;
  }

  return (
    <section className="cart-page">
      <h1>{props.mode === "checkout" ? "Ödeme" : "Alışveriş Sepeti"}</h1>
      {!props.cart?.items.length && <p className="empty">Sepet boş. Mağaza sayfasından ürün ekleyebilirsin.</p>}
      {props.cart?.items.map((item) => (
        <div className="cart-line" key={item.itemId}>
          <b>{item.productName}</b>
          <span>{item.variantSku}</span>
          <em>{item.qty} × {formatTry(item.unitPriceCents)}</em>
        </div>
      ))}
      <div className="checkout-box">
        {props.mode === "checkout" && props.session && (
          <section className="address-box">
            <h2>Teslimat Adresi</h2>
            {addresses.length > 0 && (
              <select value={selectedAddressId} onChange={(event) => setSelectedAddressId(event.target.value)}>
                {addresses.map((address) => (
                  <option value={address.id} key={address.id}>{address.title} - {address.city}/{address.district}</option>
                ))}
              </select>
            )}
            {!addresses.length && (
              <div className="address-form">
                <input value={addressForm.title} onChange={(event) => setAddressForm({ ...addressForm, title: event.target.value })} placeholder="Adres Başlığı" />
                <input value={addressForm.fullName} onChange={(event) => setAddressForm({ ...addressForm, fullName: event.target.value })} placeholder="Ad Soyad" />
                <input value={addressForm.phone} onChange={(event) => setAddressForm({ ...addressForm, phone: event.target.value })} placeholder="Telefon" />
                <input value={addressForm.city} onChange={(event) => setAddressForm({ ...addressForm, city: event.target.value })} placeholder="Şehir" />
                <input value={addressForm.district} onChange={(event) => setAddressForm({ ...addressForm, district: event.target.value })} placeholder="İlçe" />
                <input value={addressForm.postalCode} onChange={(event) => setAddressForm({ ...addressForm, postalCode: event.target.value })} placeholder="Posta Kodu" />
                <textarea value={addressForm.addressLine} onChange={(event) => setAddressForm({ ...addressForm, addressLine: event.target.value })} placeholder="Açık Adres" />
              </div>
            )}
          </section>
        )}
        <label>Kupon</label>
        <div className="coupon-row"><input value={coupon} onChange={(event) => setCoupon(event.target.value)} /><button onClick={applyCoupon}>Kuponu Uygula</button></div>
        <button className="ghost" onClick={loadShipping}>Kargo Seçeneklerini Getir</button>
        {shipping.map((option) => <button className="shipping-option" key={option.carrierCode} onClick={() => setSelectedShipping(option)}>{option.carrierName} - {formatTry(option.priceCents)}</button>)}
        <dl>
          <dt>Ara Toplam</dt><dd>{formatTry(subtotal)}</dd>
          <dt>İndirim</dt><dd>-{formatTry(discount)}</dd>
          <dt>Toplam</dt><dd>{formatTry(total)}</dd>
        </dl>
        {props.mode === "cart" && <button className="primary" onClick={() => props.setView("checkout")}>Ödemeye Geç</button>}
        {props.mode === "checkout" && <button className="primary" onClick={checkout}>Ödemeyi Başlat</button>}
        {checkoutToken && <button className="primary success" onClick={confirmCheckout}>Test Ödemesini Onayla</button>}
      </div>
    </section>
  );
}

function CustomerPortalShell(props: {
  currentTab: "account" | "orders" | "returns";
  session: AuthSession | null;
  setView: (view: View) => void;
  saveSession: (session: AuthSession | null) => void;
  children: React.ReactNode;
}) {
  async function logout() {
    props.saveSession(null);
    await api("/auth/logout", {
      method: "POST",
    }).catch(() => undefined);
  }

  if (!props.session) {
    return (
      <section className="account-page">
        <div className="account-intro">
          <span>Güvenli müşteri alanı</span>
          <h1>Hesap Girişi</h1>
          <p>Sipariş, iade, beğenilenler ve karşılaştırma akışları için giriş yapın.</p>
        </div>
        <div className="auth-required">
          <button className="primary" onClick={() => props.setView("account")}>Giriş Yap / Kaydol</button>
        </div>
      </section>
    );
  }

  return (
    <section className="customer-portal">
      <aside className="customer-sidebar">
        <div className="admin-brand" style={{ padding: "0 0 16px 0", marginBottom: "16px", gridTemplateColumns: "36px 1fr", borderBottom: "1px solid var(--line)" }}>
          <span style={{ width: "36px", height: "36px", borderRadius: "10px", fontSize: "14px", background: "var(--soft)" }}>👤</span>
          <div>
            <strong style={{ fontSize: "15px", display: "block", color: "var(--ink)", fontWeight: 800 }}>Hesabım</strong>
            <small style={{ fontSize: "11px", display: "block", color: "var(--muted)" }}>{props.session.user.email}</small>
          </div>
        </div>
        
        <button 
          className={`customer-tab-btn ${props.currentTab === "account" ? "active" : ""}`} 
          onClick={() => props.setView("account")}
        >
          <span>⌁</span> Genel Bakış
        </button>
        
        <button 
          className={`customer-tab-btn ${props.currentTab === "orders" ? "active" : ""}`} 
          onClick={() => props.setView("orders")}
        >
          <span>☰</span> Siparişlerim
        </button>
        
        <button 
          className={`customer-tab-btn ${props.currentTab === "returns" ? "active" : ""}`} 
          onClick={() => props.setView("returns")}
        >
          <span>↺</span> İadelerim
        </button>

        <div style={{ marginTop: "auto", display: "grid", gap: "8px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
          {isAdminSession(props.session) && (
            <button className="customer-tab-btn" onClick={() => props.setView("admin")} style={{ background: "var(--soft)", color: "var(--blue)" }}>
              <span>⚙</span> Yönetim Paneli
            </button>
          )}
          <button className="customer-tab-btn" onClick={logout} style={{ color: "#b42318" }}>
            <span>⎋</span> Oturumu Kapat
          </button>
        </div>
      </aside>
      
      <div className="customer-portal-content">
        {props.children}
      </div>
    </section>
  );
}

function CustomerCompareMatrix(props: {
  products: ProductWithDetail[];
  addToCart: (product: ProductWithDetail) => Promise<void>;
  toggleCustomerItem: (kind: "wishlist" | "compare", product: ProductWithDetail) => Promise<void>;
}) {
  if (!props.products.length) {
    return (
      <section className="account-product-panel">
        <div className="admin-section-head"><div><span>Karşılaştırma</span><h2>Ürün Karşılaştırma</h2></div><b>0</b></div>
        <p className="empty">Karşılaştırma listesinde ürün yok. Ürün kartlarından karşılaştırmak için ürün ekleyin.</p>
      </section>
    );
  }

  return (
    <section className="account-product-panel">
      <div className="admin-section-head"><div><span>Karşılaştırma</span><h2>Özellik Karşılaştırma Matrisi</h2></div><b>{props.products.length}</b></div>
      <div className="comparison-matrix-wrapper">
        <table className="comparison-matrix">
          <thead>
            <tr>
              <th>Ürün Bilgileri</th>
              {props.products.map((product) => (
                <td key={product.id}>
                  <div className="comparison-matrix-header-cell">
                    <button 
                      className="remove-btn" 
                      onClick={() => void props.toggleCustomerItem("compare", product)}
                      title="Karşılaştırmadan çıkar"
                    >
                      ✕
                    </button>
                    {productImageUrl(product) ? <img src={productImageUrl(product)} alt={product.name} /> : <div style={{ height: "100px", width: "100px", background: "var(--soft)" }} />}
                    <h4>{product.name}</h4>
                    <strong>{formatTry(product.priceCents ?? 0)}</strong>
                    <button className="primary" onClick={() => void props.addToCart(product)} style={{ width: "100%", padding: "8px 12px", fontSize: "12px", marginTop: "5px" }}>
                      Sepete Ekle
                    </button>
                  </div>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Stok Kodu (SKU)</th>
              {props.products.map((product) => <td key={product.id}><code>{product.sku}</code></td>)}
            </tr>
            <tr>
              <th>Materyal</th>
              {props.products.map((product) => <td key={product.id}>{product.material || "-"}</td>)}
            </tr>
            <tr>
              <th>Kullanım Alanı</th>
              {props.products.map((product) => <td key={product.id}>{listToText(product.usageArea) || "-"}</td>)}
            </tr>
            <tr>
              <th>Sezon Etiketleri</th>
              {props.products.map((product) => <td key={product.id}>{listToText(product.seasonTags) || "-"}</td>)}
            </tr>
            <tr>
              <th>Garanti Süresi</th>
              {props.products.map((product) => <td key={product.id}>{product.warrantyMonths ? `${product.warrantyMonths} Ay` : "-"}</td>)}
            </tr>
            <tr>
              <th>İade Edilebilir mi?</th>
              {props.products.map((product) => <td key={product.id}>{product.isReturnable ?? true ? "Evet (14 Gün)" : "Hayır"}</td>)}
            </tr>
            <tr>
              <th>Tehlikeli Madde</th>
              {props.products.map((product) => <td key={product.id}>{product.isHazardous ? "⚠️ Evet" : "Hayır"}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccountPage(props: {
  session: AuthSession | null;
  saveSession: (session: AuthSession | null) => void;
  setNotice: (value: string) => void;
  setView: (view: View) => void;
  wishlist: CustomerProductItem[];
  compareList: CustomerProductItem[];
  products: ProductWithDetail[];
  addToCart: (product: ProductWithDetail) => Promise<void>;
  toggleCustomerItem: (kind: "wishlist" | "compare", product: ProductWithDetail) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const pwRules = [
    { label: "En az 8 karakter", ok: password.length >= 8 },
    { label: "Büyük harf (A-Z)", ok: /[A-Z]/.test(password) },
    { label: "Küçük harf (a-z)", ok: /[a-z]/.test(password) },
    { label: "Rakam (0-9)", ok: /\d/.test(password) },
    { label: "Özel karakter (!@#$...)", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const allPwValid = pwRules.every((r) => r.ok);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);
    try {
      if (mode === "register") {
        await registerAndLogin();
        return;
      }
      await login();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "İşlem tamamlanamadı.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function login() {
    const session = await api<AuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    props.saveSession(session);
    if (isAdminSession(session)) {
      props.setNotice("Admin girisi yapildi.");
      props.setView("admin");
      return;
    }
    props.setNotice("Hesap girisi yapildi.");
  }

  async function registerAndLogin() {
    await api<{ user: { email: string } }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName: name }),
    });
    setMode("login");
    setPassword("");
    setStatus("Hesap oluşturuldu. Giriş yapmadan önce e-posta doğrulama linkini kontrol et.");
    props.setNotice("Hesap oluşturuldu. E-posta doğrulaması gerekiyor.");
  }

  if (props.session) {
    const wishlistProducts = props.wishlist.map((item) => props.products.find((product) => product.id === item.productId)).filter(Boolean) as ProductWithDetail[];
    const compareProducts = props.compareList.map((item) => props.products.find((product) => product.id === item.productId)).filter(Boolean) as ProductWithDetail[];
    return (
      <CustomerPortalShell currentTab="account" session={props.session} setView={props.setView} saveSession={props.saveSession}>
        <div className="account-intro"><span>Hesabım</span><h2>Genel Bakış</h2><p>Bahçe Shop müşteri paneline hoş geldiniz. Siparişlerinizi, iadelerinizi ve listelerinizi tek ekrandan yönetin.</p></div>
        <div className="account-summary-grid" style={{ marginBottom: "25px" }}>
          <article><span>Siparişler</span><strong>Süreçleri Takip Et</strong><button onClick={() => props.setView("orders")}>Aç</button></article>
          <article><span>İadeler</span><strong>Kolay İade Talebi</strong><button onClick={() => props.setView("returns")}>Aç</button></article>
          <article><span>Favoriler</span><strong>{props.wishlist.length} Ürün</strong></article>
          <article><span>Karşılaştırma</span><strong>{props.compareList.length} Ürün</strong></article>
        </div>
        <CustomerProductList title="Beğendiğim Ürünler" kind="wishlist" products={wishlistProducts} addToCart={props.addToCart} toggleCustomerItem={props.toggleCustomerItem} setView={props.setView} />
        <CustomerCompareMatrix products={compareProducts} addToCart={props.addToCart} toggleCustomerItem={props.toggleCustomerItem} />
      </CustomerPortalShell>
    );
  }

  return (
    <section className="saas-auth-shell">
      <div className="saas-auth-brand">
        <div className="saas-auth-brand-inner">
          <div className="saas-auth-logo">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#fff" fillOpacity=".15"/><path d="M10 18h6l3-8 4 16 3-8h6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>Bahçe Shop</span>
          </div>
          <h2 className="saas-auth-headline">Profesyonel E-Ticaret<br/>Altyapısına<br/><em>Hoş Geldiniz</em></h2>
          <p className="saas-auth-tagline">Siparişlerinizi takip edin, iade süreçlerinizi yönetin ve özel fırsatlardan yararlanın — hepsi tek platformda.</p>
          <div className="saas-auth-trust">
            <div className="saas-trust-badge"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>256-bit SSL</span></div>
            <div className="saas-trust-badge"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>KVKK Uyumlu</span></div>
            <div className="saas-trust-badge"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>7/24 Destek</span></div>
          </div>
          <blockquote className="saas-auth-testimonial">
            <p>"Bahçe Shop sayesinde sipariş ve iade süreçlerimizi tek panelden yönetiyoruz. Gerçekten profesyonel bir altyapı."</p>
            <footer>— Ahmet Y., Kurumsal Müşteri</footer>
          </blockquote>
          <div className="saas-auth-stats">
            <div><strong>12K+</strong><span>Aktif Kullanıcı</span></div>
            <div><strong>99.9%</strong><span>Kesintisiz Hizmet</span></div>
            <div><strong>4.8★</strong><span>Memnuniyet</span></div>
          </div>
        </div>
      </div>
      <div className="saas-auth-form-panel">
        <div className="saas-auth-form-inner">
          <div className="saas-auth-form-head">
            <h1>{mode === "login" ? "Hesabınıza Giriş Yapın" : "Yeni Hesap Oluşturun"}</h1>
            <p>{mode === "login" ? "Siparişlerinizi, iade süreçlerinizi ve listelerinizi yönetmek için giriş yapın." : "Ücretsiz hesabınızı oluşturun, e-posta doğrulama linki adresinize gönderilecektir."}</p>
          </div>
          <div className="auth-switch" role="tablist" aria-label="Account mode">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setStatus(null); }}>Giriş Yap</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setStatus(null); }}>Kayıt Ol</button>
          </div>
          <form className="saas-auth-form" onSubmit={submit}>
            {mode === "register" && (
              <label className="saas-input-group">
                <span className="saas-input-label">Ad Soyad</span>
                <div className="saas-input-wrap">
                  <svg className="saas-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Adınız ve soyadınız" autoComplete="name" required />
                </div>
              </label>
            )}
            <label className="saas-input-group">
              <span className="saas-input-label">E-posta Adresi</span>
              <div className="saas-input-wrap">
                <svg className="saas-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="ornek@sirket.com" autoComplete="email" required />
              </div>
            </label>
            <label className="saas-input-group">
              <span className="saas-input-label">Şifre</span>
              <div className="saas-input-wrap">
                <svg className="saas-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} placeholder="En az 8 karakter" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
                <button type="button" className="saas-eye-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </label>
            {mode === "register" && password.length > 0 && (
              <div className="saas-pw-rules">
                {pwRules.map((rule) => (
                  <div key={rule.label} className={`saas-pw-rule ${rule.ok ? "ok" : ""}`}>
                    {rule.ok ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    )}
                    <span>{rule.label}</span>
                  </div>
                ))}
              </div>
            )}
            {mode === "login" && (
              <div className="saas-auth-extras">
                <label className="saas-remember"><input type="checkbox" /> Beni hatırla</label>
                <button type="button" className="saas-forgot-link" onClick={() => props.setView("forgot-password")}>Şifremi unuttum</button>
              </div>
            )}
            {status && <p className="auth-status">{status}</p>}
            <button className="saas-auth-submit" disabled={isSubmitting || (mode === "register" && !allPwValid)}>
              {isSubmitting ? (
                <><svg className="saas-spinner" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4" strokeLinecap="round"/></svg> İşleniyor...</>
              ) : mode === "login" ? "Giriş Yap →" : "Hesap Oluştur →"}
            </button>
          </form>
          <div className="saas-auth-divider"><span>veya</span></div>
          <p className="saas-auth-footer-text">
            {mode === "login" ? "Henüz hesabınız yok mu? " : "Zaten bir hesabınız var mı? "}
            <button type="button" className="saas-mode-toggle" onClick={() => { setMode(mode === "login" ? "register" : "login"); setStatus(null); }}>
              {mode === "login" ? "Ücretsiz Kayıt Ol" : "Giriş Yap"}
            </button>
          </p>
          <p className="saas-auth-legal">Devam ederek <button type="button" className="saas-legal-link" onClick={() => props.setView("privacy")}>Gizlilik Politikası</button> ve Kullanım Koşullarını kabul etmiş olursunuz.</p>
        </div>
      </div>
    </section>
  );
}

function VerifyEmailPage({ setView, setNotice }: { setView: (view: View) => void; setNotice: (value: string) => void }) {
  const [token] = useState(() => readTokenFromLocation());
  const [status, setStatus] = useState(token ? "E-posta doğrulaması kontrol ediliyor..." : "Doğrulama linki geçersiz veya eksik.");
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!token) return;
    api("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        setIsSuccess(true);
        setStatus("E-posta doğrulandı. Artık giriş yapabilirsin.");
        setNotice("E-posta doğrulandı.");
      })
      .catch((error) => {
        setIsSuccess(false);
        setStatus(customerMessage(error, "E-posta doğrulanamadı."));
      });
  }, [token]);

  return (
    <section className="account-page">
      <div className="account-intro">
        <span>E-posta doğrulama</span>
        <h1>Hesabını Doğrula</h1>
        <p>Kayıt sonrası gönderilen güvenli link burada doğrulanır.</p>
      </div>
      <div className="auth-card">
        <p className={`auth-status ${isSuccess ? "success" : ""}`}>{status}</p>
        <button className="primary auth-submit" onClick={() => setView("account")}>Giriş ekranına git</button>
      </div>
    </section>
  );
}

function ForgotPasswordPage({ setView, setNotice }: { setView: (view: View) => void; setNotice: (value: string) => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);
    try {
      await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setStatus("Eğer bu e-posta kayıtlıysa şifre yenileme linki gönderildi.");
      setNotice("Şifre yenileme talebi alındı.");
    } catch (error) {
      setStatus(customerMessage(error, "Şifre yenileme talebi gönderilemedi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="saas-auth-shell saas-auth-compact">
      <div className="saas-auth-brand">
        <div className="saas-auth-brand-inner">
          <div className="saas-auth-logo">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#fff" fillOpacity=".15"/><path d="M10 18h6l3-8 4 16 3-8h6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>Bahçe Shop</span>
          </div>
          <h2 className="saas-auth-headline">Şifrenizi<br/>Güvenle<br/><em>Yenileyin</em></h2>
          <p className="saas-auth-tagline">E-posta adresinize güvenli bir yenileme linki göndereceğiz. Hesabınız her zaman koruma altında.</p>
          <div className="saas-auth-trust">
            <div className="saas-trust-badge"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>256-bit SSL</span></div>
            <div className="saas-trust-badge"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>KVKK Uyumlu</span></div>
          </div>
        </div>
      </div>
      <div className="saas-auth-form-panel">
        <div className="saas-auth-form-inner">
          <div className="saas-auth-form-head">
            <div className="saas-auth-icon-circle">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </div>
            <h1>Şifremi Unuttum</h1>
            <p>E-posta adresinizi girin, kayıtlıysa güvenli yenileme linkini mail kutunuza gönderelim.</p>
          </div>
          <form className="saas-auth-form" onSubmit={submit}>
            <label className="saas-input-group">
              <span className="saas-input-label">E-posta Adresi</span>
              <div className="saas-input-wrap">
                <svg className="saas-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="ornek@sirket.com" autoComplete="email" required />
              </div>
            </label>
            {status && <p className="auth-status success">{status}</p>}
            <button className="saas-auth-submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <><svg className="saas-spinner" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4" strokeLinecap="round"/></svg> Gönderiliyor...</>
              ) : "Yenileme Linki Gönder →"}
            </button>
          </form>
          <div className="saas-auth-divider"><span>veya</span></div>
          <p className="saas-auth-footer-text">
            Şifrenizi hatırladınız mı? <button type="button" className="saas-mode-toggle" onClick={() => setView("account")}>Giriş Yap</button>
          </p>
        </div>
      </div>
    </section>
  );
}

function ResetPasswordPage({ setView, setNotice }: { setView: (view: View) => void; setNotice: (value: string) => void }) {
  const [token] = useState(() => readTokenFromLocation());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(token ? null : "Şifre yenileme linki geçersiz veya eksik.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setStatus("Şifre yenileme linki geçersiz veya eksik.");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("İki şifre aynı olmalı.");
      return;
    }
    setStatus(null);
    setIsSubmitting(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      setPassword("");
      setConfirmPassword("");
      setStatus("Şifren yenilendi. Artık yeni şifrenle giriş yapabilirsin.");
      setNotice("Şifre başarıyla yenilendi.");
      window.setTimeout(() => setView("account"), 1200);
    } catch (error) {
      setStatus(customerMessage(error, "Şifre yenilenemedi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="saas-auth-shell saas-auth-compact">
      <div className="saas-auth-brand">
        <div className="saas-auth-brand-inner">
          <div className="saas-auth-logo">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#fff" fillOpacity=".15"/><path d="M10 18h6l3-8 4 16 3-8h6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>Bahçe Shop</span>
          </div>
          <h2 className="saas-auth-headline">Yeni Şifrenizi<br/>Güvenle<br/><em>Belirleyin</em></h2>
          <p className="saas-auth-tagline">Yeni şifreniz en az 8 karakter olmalı. İşlemden sonra eski oturumlarınız otomatik kapatılır.</p>
          <div className="saas-auth-trust">
            <div className="saas-trust-badge"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>256-bit SSL</span></div>
            <div className="saas-trust-badge"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>KVKK Uyumlu</span></div>
          </div>
        </div>
      </div>
      <div className="saas-auth-form-panel">
        <div className="saas-auth-form-inner">
          <div className="saas-auth-form-head">
            <div className="saas-auth-icon-circle">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            </div>
            <h1>Şifre Yenile</h1>
            <p>Yeni şifrenizi belirleyin ve güvenle hesabınıza erişin.</p>
          </div>
          <form className="saas-auth-form" onSubmit={submit}>
            <label className="saas-input-group">
              <span className="saas-input-label">Yeni Şifre</span>
              <div className="saas-input-wrap">
                <svg className="saas-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="En az 8 karakter" autoComplete="new-password" minLength={8} required disabled={!token} />
              </div>
            </label>
            <label className="saas-input-group">
              <span className="saas-input-label">Yeni Şifre Tekrar</span>
              <div className="saas-input-wrap">
                <svg className="saas-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" placeholder="Şifrenizi tekrar girin" autoComplete="new-password" minLength={8} required disabled={!token} />
              </div>
            </label>
            {status && <p className={`auth-status ${status.includes("yenilendi") ? "success" : ""}`}>{status}</p>}
            <button className="saas-auth-submit" disabled={isSubmitting || !token}>
              {isSubmitting ? (
                <><svg className="saas-spinner" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4" strokeLinecap="round"/></svg> Yenileniyor...</>
              ) : "Şifreyi Yenile →"}
            </button>
          </form>
          <div className="saas-auth-divider"><span>veya</span></div>
          <p className="saas-auth-footer-text">
            Giriş sayfasına dönmek mi istiyorsunuz? <button type="button" className="saas-mode-toggle" onClick={() => setView("account")}>Giriş Yap</button>
          </p>
        </div>
      </div>
    </section>
  );
}

function CustomerProductList(props: {
  title: string;
  kind: "wishlist" | "compare";
  products: ProductWithDetail[];
  addToCart: (product: ProductWithDetail) => Promise<void>;
  toggleCustomerItem: (kind: "wishlist" | "compare", product: ProductWithDetail) => Promise<void>;
  setView: (view: View) => void;
}) {
  return (
    <section className="account-product-panel">
      <div className="admin-section-head"><div><span>{props.title}</span><h2>{props.title}</h2></div><b>{props.products.length}</b></div>
      {!props.products.length && <p className="empty">Bu listede henüz ürün yok.</p>}
      <div className="account-product-grid">
        {props.products.map((product) => (
          <article key={product.id}>
            <img src={productImageUrl(product)} alt={product.name} />
            <div><b>{product.name}</b><span>{formatTry(product.priceCents ?? 0)}</span></div>
            <button className="primary" onClick={() => void props.addToCart(product)}>Sepete Ekle</button>
            <button onClick={() => void props.toggleCustomerItem(props.kind, product)}>Listeden çıkar</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function OrdersPage({ session, setView, setNotice, saveSession, settings }: { session: AuthSession | null; setView: (view: View) => void; setNotice: (value: string) => void; saveSession: (session: AuthSession | null) => void; settings: StorefrontSettings }) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [tracking, setTracking] = useState<TrackingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orderLabels = mergedLabels(orderStatusLabels, settings.orderStatusLabels);

  useEffect(() => {
    if (!session) return;
    api<{ data: OrderRecord[] }>("/orders", { token: session.accessToken })
      .then((result) => setOrders(result.data))
      .catch((caught: Error) => setError(customerMessage(caught)));
  }, [session]);

  if (!session) return <AuthRequired title="Siparişlerim" setView={setView} />;

  async function loadOrderDetail(orderId: string) {
    if (!session) return;
    const [orderResult, trackingResult] = await Promise.all([
      api<{ data: OrderDetail }>(`/orders/${orderId}`, { token: session.accessToken }),
      api<{ data: TrackingDetail }>(`/orders/${orderId}/tracking`, { token: session.accessToken }).catch(() => ({ data: null as unknown as TrackingDetail })),
    ]);
    setDetail(orderResult.data);
    setTracking(trackingResult.data);
  }

  async function cancelOrder(orderId: string) {
    if (!session) return;
    try {
      await api(`/orders/${orderId}/cancel`, { method: "POST", token: session.accessToken });
      setNotice("Sipariş iptal edildi.");
      setDetail(null);
      const result = await api<{ data: OrderRecord[] }>("/orders", { token: session.accessToken });
      setOrders(result.data);
    } catch (error) {
      setNotice(customerMessage(error, "Sipariş iptal edilemedi."));
    }
  }

  return (
    <CustomerPortalShell currentTab="orders" session={session} setView={setView} saveSession={saveSession}>
      <div className="account-intro"><span>Müşteri Alanı</span><h2>Siparişlerim</h2><p>Mevcut ve geçmiş siparişlerinizi görüntüleyin, kargo durumlarını takip edin.</p></div>
      {error && <p className="empty">{error}</p>}
      {!orders.length && !error && <p className="empty">Henüz siparişiniz yok. Alışveriş yapınca siparişleriniz burada listelenir.</p>}
      <div className="record-list" style={{ display: "grid", gap: "12px" }}>
        {orders.map((order) => (
          <article key={order.id} style={{ padding: "16px", borderRadius: "18px", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "8px" }}>
              <span>{new Date(order.createdAt).toLocaleDateString("tr-TR")}</span>
              <strong style={{ color: "var(--blue)" }}>{formatTry(order.totalCents)}</strong>
            </div>
            <h3 style={{ margin: "4px 0", fontSize: "16px" }}>{order.orderNumber}</h3>
            <p style={{ margin: "4px 0", color: "var(--muted)", fontSize: "13px" }}>{orderProductSummary(order)}</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
              <p style={{ margin: 0, fontSize: "13px" }}>Durum: <b style={{ color: order.status === "cancelled" ? "#b42318" : "var(--blue)" }}>{labelFor(order.status, orderLabels)}</b></p>
              <button className="link-button" onClick={() => void loadOrderDetail(order.id)} style={{ fontSize: "13px", padding: 0 }}>Detay ve Takip →</button>
            </div>
          </article>
        ))}
      </div>
      {detail && (
        <section className="detail-panel order-customer-detail" style={{ marginTop: "30px", padding: "20px", border: "1px solid var(--line)", borderRadius: "20px", background: "#fdfefe" }}>
          <div className="return-detail-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: "12px", marginBottom: "16px" }}>
            <div>
              <span style={{ background: "var(--soft)", padding: "4px 10px", borderRadius: "999px", color: "var(--blue)", fontSize: "11px", fontWeight: "900" }}>{labelFor(detail.status, orderLabels)}</span>
              <h3 style={{ margin: "8px 0 0 0", fontSize: "20px" }}>{detail.orderNumber}</h3>
            </div>
            <b style={{ fontSize: "20px", color: "var(--ink)" }}>{formatTry(detail.totalCents)}</b>
          </div>
          
          <div className="premium-stepper">
            <div 
              className="premium-stepper-progress" 
              style={{ 
                width: (() => {
                  if (detail.status === "cancelled") return "0%";
                  const activeIndex = orderSteps.indexOf(detail.status);
                  if (activeIndex === -1) return "0%";
                  return `${(activeIndex / (orderSteps.length - 1)) * 100}%`;
                })() 
              }} 
            />
            {orderSteps.map((step, index) => {
              const activeIndex = orderSteps.indexOf(detail.status);
              const isDone = detail.status !== "cancelled" && activeIndex > index;
              const isActive = detail.status !== "cancelled" && activeIndex === index;
              return (
                <div className={`stepper-step ${isDone ? "done" : ""} ${isActive ? "active" : ""}`} key={step}>
                  <div className="stepper-circle">
                    {isDone ? "✓" : index + 1}
                  </div>
                  <span className="stepper-label">{labelFor(step, orderLabels)}</span>
                </div>
              );
            })}
          </div>

          <div className="order-summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", margin: "20px 0" }}>
            <article style={{ background: "#fff", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)" }}><span style={{ fontSize: "11px", color: "var(--muted)" }}>Ara Toplam</span><strong style={{ display: "block", fontSize: "16px", marginTop: "4px" }}>{formatTry(detail.subtotalCents ?? 0)}</strong></article>
            <article style={{ background: "#fff", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)" }}><span style={{ fontSize: "11px", color: "var(--muted)" }}>Kargo</span><strong style={{ display: "block", fontSize: "16px", marginTop: "4px" }}>{formatTry(detail.shippingCents ?? 0)}</strong></article>
            <article style={{ background: "#fff", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)" }}><span style={{ fontSize: "11px", color: "var(--muted)" }}>İndirim</span><strong style={{ display: "block", fontSize: "16px", marginTop: "4px", color: "#b42318" }}>-{formatTry(detail.discountCents ?? 0)}</strong></article>
            <article style={{ background: "#fff", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)" }}><span style={{ fontSize: "11px", color: "var(--muted)" }}>Ödeme</span><strong style={{ display: "block", fontSize: "16px", marginTop: "4px", color: "#027a48" }}>{detail.payment?.status ?? "Bilinmiyor"}</strong></article>
          </div>

          <div className="order-info-list" style={{ display: "grid", gap: "8px", background: "var(--soft)", padding: "14px", borderRadius: "14px", fontSize: "13px", marginBottom: "20px" }}>
            <p style={{ margin: 0 }}><b>Teslimat Adresi:</b> {addressSummary(detail.shippingAddress)}</p>
            <p style={{ margin: 0 }}><b>İade Uygunluğu:</b> {["delivered", "completed"].includes(detail.status) && detail.returnWindowExpiresAt ? `${new Date(detail.returnWindowExpiresAt).toLocaleDateString("tr-TR")} tarihine kadar` : "Teslimat sonrası iade talebi açılabilir."}</p>
            <p style={{ margin: 0 }}><b>E-Fatura:</b> {detail.invoicePdfUrl ? <a href={detail.invoicePdfUrl} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", textDecoration: "underline", fontWeight: "900" }}>Faturayı İndir</a> : "Fatura hazırlanıyor"}</p>
          </div>

          <h4 style={{ margin: "16px 0 8px 0" }}>Sipariş Edilen Ürünler</h4>
          <div className="order-items" style={{ display: "grid", gap: "10px", marginBottom: "20px" }}>
            {detail.items.map((item) => (
              <article key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: "12px", border: "1px solid var(--line)", borderRadius: "12px" }}>
                <div>
                  <b style={{ fontSize: "14px" }}>{item.productSnapshot.name ?? "Ürün"}</b>
                  <span style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginTop: "2px" }}>{item.quantity} × {formatTry(item.unitPriceCents)}</span>
                </div>
                <strong style={{ color: "var(--ink)" }}>{formatTry(item.totalCents)}</strong>
              </article>
            ))}
          </div>

          <div className="tracking-box" style={{ background: "#f2f4f7", padding: "14px", borderRadius: "14px", marginBottom: "20px" }}>
            <h4 style={{ margin: "0 0 8px 0" }}>Kargo Takip</h4>
            <p style={{ margin: "0 0 8px 0", fontSize: "13px" }}>{tracking?.shipment ? `${tracking.shipment.carrierCode.toUpperCase()} / ${tracking.shipment.trackingNumber ?? "Takip numarası atanıyor"} - ${tracking.shipment.status}` : "Bu sipariş için aktif kargo kaydı bulunmuyor."}</p>
            {tracking?.events?.map((event) => (
              <div key={`${event.eventType}-${event.occurredAt}`} style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(0,0,0,0.05)", paddingTop: "6px", marginTop: "6px", fontSize: "12px", color: "var(--muted)" }}>
                <span>{event.description ?? event.eventType}</span>
                <span>{new Date(event.occurredAt).toLocaleString("tr-TR")}</span>
              </div>
            ))}
          </div>

          <div className="account-actions" style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            {["pending_payment", "paid", "preparing"].includes(detail.status) && <button onClick={() => void cancelOrder(detail.id)} style={{ borderColor: "#d92d20", color: "#b42318", background: "#fef3f2" }}>Siparişi İptal Et</button>}
            {["delivered", "completed"].includes(detail.status) && <button className="primary" onClick={() => setView("returns")}>Kolay İade Talebi Aç</button>}
            <button onClick={() => setDetail(null)}>Detayı Kapat</button>
          </div>
        </section>
      )}
    </CustomerPortalShell>
  );
}

function ReturnsPage({ session, setView, setNotice, saveSession, settings }: { session: AuthSession | null; setView: (view: View) => void; setNotice: (value: string) => void; saveSession: (session: AuthSession | null) => void; settings: StorefrontSettings }) {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [detail, setDetail] = useState<ReturnDetail | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("cayma_hakki");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const orderLabels = mergedLabels(orderStatusLabels, settings.orderStatusLabels);
  const reasonLabels = mergedLabels(returnReasonLabels, settings.returnReasonLabels);
  const statusLabels = mergedLabels(returnStatusLabels, settings.returnStatusLabels);
  const conditionLabels = mergedLabels(returnConditionLabels, settings.returnConditionLabels);

  useEffect(() => {
    if (!session) return;
    void loadReturns();
    api<{ data: OrderRecord[] }>("/orders", { token: session.accessToken })
      .then((result) => setOrders(result.data))
      .catch(() => undefined);
  }, [session]);

  if (!session) return <AuthRequired title="İade Süreçleri" setView={setView} />;

  const eligibleOrders = orders.filter((order) => ["delivered", "completed"].includes(order.status));
  const selectedItem = selectedOrder?.items.find((item) => item.id === selectedItemId);
  const needsPhotos = reason === "hasarli_kargo";

  async function loadReturns() {
    if (!session) return;
    api<{ data: ReturnRecord[] }>("/returns", { token: session.accessToken })
      .then((result) => setReturns(result.data))
      .catch((caught: Error) => setError(caught.message));
  }

  async function loadReturnOrder(orderId: string) {
    if (!session) return;
    setSelectedOrderId(orderId);
    setSelectedItemId("");
    setQuantity(1);
    if (!orderId) {
      setSelectedOrder(null);
      return;
    }
    const result = await api<{ data: OrderDetail }>(`/orders/${orderId}`, { token: session.accessToken });
    setSelectedOrder(result.data);
    setSelectedItemId(result.data.items[0]?.id ?? "");
  }

  async function openReturn(id: string) {
    if (!session) return;
    const result = await api<{ data: ReturnDetail }>(`/returns/${id}`, { token: session.accessToken });
    setDetail(result.data);
  }

  async function createReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedOrderId || !selectedItemId) return;
    const photoUrls = photos.map((photo) => photo.trim()).filter(Boolean);
    if (needsPhotos && photoUrls.length < 2) {
      setError("Hasarlı kargo iadelerinde en az 2 fotoğraf linki gerekli.");
      return;
    }
    const payload: Record<string, unknown> = {
      orderId: selectedOrderId,
      reason,
      customerNote: note || null,
      items: [{ orderItemId: selectedItemId, quantity: Math.max(1, Math.min(quantity, selectedItem?.quantity ?? quantity)) }],
    };
    if (needsPhotos) {
      payload.photos = photoUrls;
    }
    try {
      const result = await api<{ data: ReturnRecord }>("/returns", {
        method: "POST",
        token: session.accessToken,
        body: JSON.stringify(payload),
      });
      setReturns((current) => [result.data, ...current]);
      setSelectedOrderId("");
      setSelectedOrder(null);
      setSelectedItemId("");
      setQuantity(1);
      setNote("");
      setPhotos(["", ""]);
      setError(null);
      setNotice("İade talebi oluşturuldu. Admin onayından sonra süreç devam eder.");
    } catch (error) {
      setError(customerMessage(error, "İade talebi oluşturulamadı."));
    }
  }

  async function cancelReturn(id: string) {
    if (!session) return;
    await api(`/returns/${id}/cancel`, { method: "POST", token: session.accessToken });
    setNotice("İade talebi iptal edildi.");
    setDetail(null);
    await loadReturns();
  }

  return (
    <CustomerPortalShell currentTab="returns" session={session} setView={setView} saveSession={saveSession}>
      <div className="account-intro"><span>Müşteri Alanı</span><h2>İadelerim</h2><p>Teslim edilmiş siparişleriniz için iade talepleri oluşturabilir ve süreci anlık izleyebilirsiniz.</p></div>
      <section className="return-create" style={{ background: "#fdfefe", border: "1px solid var(--line)", borderRadius: "20px", padding: "20px", marginBottom: "25px" }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>Yeni İade Talebi</h3>
        <div className="return-process-cards" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}><article style={{ padding: "12px", border: "1px solid var(--line)", borderRadius: "12px", fontSize: "12px" }}><b style={{ display: "block", marginBottom: "4px" }}>1. Ürünü Seç</b><span>Ürünü ve adedi seç.</span></article><article style={{ padding: "12px", border: "1px solid var(--line)", borderRadius: "12px", fontSize: "12px" }}><b style={{ display: "block", marginBottom: "4px" }}>2. Nedeni Seç</b><span>Hasarlı ise en az 2 görsel ekle.</span></article><article style={{ padding: "12px", border: "1px solid var(--line)", borderRadius: "12px", fontSize: "12px" }}><b style={{ display: "block", marginBottom: "4px" }}>3. Takip Et</b><span>İade kargo ve onay sürecini izle.</span></article></div>
        <form className="return-form" onSubmit={createReturn} style={{ display: "grid", gap: "10px" }}>
          <select value={selectedOrderId} onChange={(event) => void loadReturnOrder(event.target.value)}>
            <option value="">İade Edilecek Siparişi Seç</option>
            {eligibleOrders.map((order) => <option value={order.id} key={order.id}>{order.orderNumber} - {labelFor(order.status, orderLabels)}</option>)}
          </select>
          <select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)}>
            <option value="">Ürün Seç</option>
            {selectedOrder?.items.map((item) => <option value={item.id} key={item.id}>{item.productSnapshot.name ?? item.id} - {item.quantity} adet</option>)}
          </select>
          <input type="number" min={1} max={selectedItem?.quantity ?? 1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} placeholder="Adet" />
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {Object.entries(reasonLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          {needsPhotos && photos.map((photo, index) => (
            <input key={index} value={photo} onChange={(event) => setPhotos((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Örn: http://localhost:19000/bahce-shop-dev/hasar${index + 1}.png`} />
          ))}
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="İade notunuzu buraya yazabilirsiniz..." />
          {selectedItem && <div className="return-selected-item" style={{ background: "var(--soft)", padding: "12px", borderRadius: "12px", fontSize: "12px" }}><b style={{ display: "block" }}>{selectedItem.productSnapshot.name ?? "Seçili Ürün"}</b><span>İade Edilebilir Miktar: {selectedItem.quantity}</span><small style={{ display: "block", color: "var(--muted)", marginTop: "4px" }}>{reason === "hasarli_kargo" ? "Hasarlı kargo bildirimlerinde iade kargo ücretini satıcı karşılar." : "Diğer iade tiplerinde iade kargo ücreti müşteriye aittir."}</small></div>}
          <button className="primary" disabled={!selectedOrderId || !selectedItemId}>İade Talebi Gönder</button>
        </form>
      </section>
      {error && <p className="empty">{error}</p>}
      <div className="return-layout" style={{ display: "grid", gridTemplateColumns: returns.length ? "1.2fr 1.8fr" : "1fr", gap: "20px" }}>
        <div className="record-list return-record-list" style={{ display: "grid", gap: "10px" }}>
          {!returns.length && !error && <p className="empty">Kayıtlı iade talebiniz bulunmuyor.</p>}
          {returns.map((record) => (
            <article key={record.id} style={{ padding: "16px", borderRadius: "18px", border: "1px solid var(--line)" }}>
              <span>{new Date(record.requestedAt).toLocaleDateString("tr-TR")}</span>
              <h3 style={{ margin: "4px 0", fontSize: "16px" }}>{record.returnNumber}</h3>
              <p style={{ margin: "4px 0", fontSize: "13px" }}>Neden: {labelFor(record.reason, reasonLabels)}</p>
              <p style={{ margin: "4px 0", fontSize: "13px" }}>Durum: <b style={{ color: "var(--blue)" }}>{labelFor(record.status, statusLabels)}</b></p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
                <strong>{formatTry(record.refundAmountCents ?? 0)}</strong>
                <button className="ghost" onClick={() => void openReturn(record.id)} style={{ fontSize: "12px" }}>Detay →</button>
              </div>
            </article>
          ))}
        </div>
        {detail && (
          <section className="detail-panel return-detail-panel" style={{ padding: "20px", border: "1px solid var(--line)", borderRadius: "20px", background: "#fdfefe" }}>
            <div className="return-detail-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: "12px", marginBottom: "16px" }}>
              <div>
                <span style={{ background: "var(--soft)", padding: "4px 10px", borderRadius: "999px", color: "var(--blue)", fontSize: "11px", fontWeight: "900" }}>{labelFor(detail.reason, reasonLabels)}</span>
                <h3 style={{ margin: "8px 0 0 0", fontSize: "20px" }}>{detail.returnNumber}</h3>
              </div>
              <b style={{ fontSize: "16px" }}>{labelFor(detail.status, statusLabels)}</b>
            </div>
            <div className="order-summary-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
              <article style={{ background: "#fff", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)" }}><span style={{ fontSize: "11px", color: "var(--muted)" }}>İade Edilecek Tutar</span><strong style={{ display: "block", fontSize: "16px", marginTop: "4px" }}>{formatTry(detail.refundAmountCents ?? 0)}</strong></article>
              <article style={{ background: "#fff", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)" }}><span style={{ fontSize: "11px", color: "var(--muted)" }}>Kargo Ödemesi</span><strong style={{ display: "block", fontSize: "16px", marginTop: "4px" }}>{detail.returnShippingPaidBy === "seller" ? "Satıcı Öder" : "Müşteri Öder"}</strong></article>
            </div>
            <div className="order-info-list" style={{ display: "grid", gap: "6px", background: "var(--soft)", padding: "12px", borderRadius: "12px", fontSize: "13px", marginBottom: "16px" }}>
              <p style={{ margin: 0 }}><b>İade Kargo Takip Kodu:</b> <code>{detail.returnTrackingNumber ?? "Atanmadı"}</code></p>
              <p style={{ margin: 0 }}><b>Müşteri Notu:</b> {detail.customerNote ?? "-"}</p>
              <p style={{ margin: 0 }}><b>Yönetici Notu:</b> {detail.adminNote ?? "-"}</p>
              {detail.rejectedReason && <p style={{ margin: 0, color: "#b42318" }}><b>Red Gerekçesi:</b> {detail.rejectedReason}</p>}
            </div>

            {Array.isArray(detail.photos) && detail.photos.length > 0 && (
              <div style={{ marginTop: "15px", borderTop: "1px solid var(--line)", paddingTop: "15px", marginBottom: "15px" }}>
                <b style={{ fontSize: "13px", display: "block", marginBottom: "8px" }}>Ekli Hasar Fotoğrafları:</b>
                <div className="return-photo-gallery">
                  {detail.photos.map((photoUrl: string, index: number) => (
                    <img 
                      key={index} 
                      src={photoUrl} 
                      alt={`Hasar Fotoğrafı ${index + 1}`} 
                      className="return-photo-thumb"
                      onClick={() => setLightboxImage(photoUrl)}
                    />
                  ))}
                </div>
              </div>
            )}

            <h4 style={{ margin: "16px 0 8px 0" }}>İade Edilen Ürünler</h4>
            <div className="order-item-list" style={{ display: "grid", gap: "8px", marginBottom: "20px" }}>
              {detail.items?.map((item) => (
                <article key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: "12px", border: "1px solid var(--line)", borderRadius: "12px" }}>
                  <div>
                    <b style={{ fontSize: "14px" }}>{item.quantity} Adet</b>
                    <small style={{ display: "block", color: "var(--muted)", fontSize: "12px", marginTop: "2px" }}>Kondisyon: {item.itemCondition ? labelFor(item.itemCondition, conditionLabels) : "Depoya ulaşmadı"}</small>
                  </div>
                  <strong style={{ color: "var(--ink)" }}>{formatTry(item.unitRefundCents * item.quantity)}</strong>
                </article>
              ))}
            </div>
            {!!detail.history?.length && (
              <div className="return-timeline" style={{ background: "#f2f4f7", padding: "14px", borderRadius: "14px", marginBottom: "20px" }}>
                <h4 style={{ margin: "0 0 8px 0" }}>Talep Gelişimi</h4>
                {detail.history.map((item) => (
                  <p key={item.id} style={{ margin: "4px 0", fontSize: "12px", display: "flex", justifyContent: "space-between" }}>
                    <b>{labelFor(item.toStatus, statusLabels)}</b>
                    <span style={{ color: "var(--muted)" }}>{new Date(item.changedAt).toLocaleString("tr-TR")}</span>
                  </p>
                ))}
              </div>
            )}
            <div className="account-actions" style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              {["requested", "approved"].includes(detail.status) && <button className="ghost" onClick={() => void cancelReturn(detail.id)} style={{ color: "#b42318" }}>Talebi İptal Et</button>}
              <button onClick={() => setDetail(null)}>Detayı Kapat</button>
            </div>
          </section>
        )}
      </div>

      {lightboxImage && (
        <div className="lightbox-modal" onClick={() => setLightboxImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxImage} alt="Hasar Fotoğrafı Detayı" />
            <div className="lightbox-caption">Hasar Bildirim Fotoğrafı - Kapatmak için boşluğa tıklayın</div>
          </div>
        </div>
      )}
    </CustomerPortalShell>
  );
}

function AuthRequired({ title, setView }: { title: string; setView: (view: View) => void }) {
  return (
    <section className="content-page">
      <PageHero title={title} subtitle="Bu sayfa backend hesabına bağlıdır." />
      <div className="auth-required">
        <h3>Önce hesap girişi yapmalısın.</h3>
        <button className="primary" onClick={() => setView("account")}>Giriş Yap / Kaydol</button>
      </div>
    </section>
  );
}

function AboutPage() {
  return (
    <section className="content-page">
      <PageHero title="Hakkımızda" subtitle="Toolband tasarım dilinde Bahçe Shop hikayesi." />
      <div className="split-content">
        <div>
          <h2>Kaliteli ürünler, gerçek e-ticaret altyapısı.</h2>
          <p>Bu vitrin, WordPress demosundaki endüstriyel araç mağazası hissini mevcut Bahçe Shop backendine bağlar. Katalog, sepet, kupon, kargo, sipariş ve iade akışları API üzerinden çalışır.</p>
          <p>Amacımız hızlı, güvenilir ve mobilde de rahat kullanılan bir e-ticaret deneyimi sunmak.</p>
        </div>
        <img src={wpAssets.cms1} alt="Workshop" />
      </div>
      <section className="service-row inline-services">
        {["Hızlı Teslimat|Entegre kargo akışı", "Güvenli Ödeme|Test Iyzico akışı hazır", "Kolay İade|14 günlük iade süreci", "Yönetim Raporları|Gerçek backend metrikleri"].map((item) => {
          const [title, text] = item.split("|");
          return <div key={title}><span>◎</span><b>{title}</b><small>{text}</small></div>;
        })}
      </section>
    </section>
  );
}

function storefrontBlogPosts(settings: StorefrontSettings) {
  return (settings.blogPosts.length ? settings.blogPosts : defaultStorefrontSettings.blogPosts).map((post) => ({
    ...post,
    contentHtml: post.contentHtml || `<p>${post.excerpt}</p>`,
    fontFamily: post.fontFamily || "inherit",
    fontSize: post.fontSize || "16px",
    textColor: post.textColor || "#1f2937",
  }));
}

function BlogPage({
  settings,
  selectedBlogId,
  openBlog,
  setView,
}: {
  settings: StorefrontSettings;
  selectedBlogId: string;
  openBlog: (postId: string) => void;
  setView: (view: View) => void;
}) {
  const posts = storefrontBlogPosts(settings);
  const selectedPost = posts.find((post) => post.id === selectedBlogId) ?? null;

  if (selectedPost) {
    return (
      <section className="content-page">
        <nav className="breadcrumb">
          <button onClick={() => setView("home")}>Anasayfa</button>
          <button onClick={() => { window.location.hash = "blog"; }}>Blog</button>
          <strong>{selectedPost.title}</strong>
        </nav>
        <div className="blog-detail-page">
          <img src={selectedPost.imageUrl} alt={selectedPost.title} />
          <div className="blog-detail-copy">
            <span>{selectedPost.date} • {selectedPost.author}</span>
            <h1>{selectedPost.title}</h1>
            <p className="blog-detail-excerpt">{selectedPost.excerpt}</p>
            <div
              className="blog-detail-content"
              style={{ fontFamily: selectedPost.fontFamily, fontSize: selectedPost.fontSize, color: selectedPost.textColor }}
              dangerouslySetInnerHTML={{ __html: selectedPost.contentHtml }}
            />
            <div className="product-actions">
              <button className="blog-back-btn" onClick={() => { window.location.hash = "blog"; }}>Tüm Yazılara Dön</button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="content-page">
      <PageHero title="Blog" subtitle="Bahçe ve ürün kullanımı için kısa rehberler." />
      <div className="blog-archive">
        {posts.map((post, index) => (
          <article key={post.id}>
            <img src={post.imageUrl || wpAssets.productImages[index % wpAssets.productImages.length]} alt={post.title} />
            <span>{post.date} - {post.author}</span>
            <h3>{post.title}</h3>
            <p>{post.excerpt}</p>
            <div
              className="blog-content-preview"
              style={{ fontFamily: post.fontFamily, fontSize: post.fontSize, color: post.textColor }}
              dangerouslySetInnerHTML={{ __html: post.contentHtml }}
            />
            <button onClick={() => openBlog(post.id)}>Devamını Oku</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ContactPage({ setNotice, settings }: { setNotice: (value: string) => void; settings: StorefrontSettings }) {
  const [form, setForm] = useState({ fullName: "", email: "", message: "", phone: "", subject: "" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api("/contact-messages", {
      method: "POST",
      body: JSON.stringify({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || null,
        subject: form.subject || null,
        message: form.message,
      }),
    });
    setForm({ fullName: "", email: "", message: "", phone: "", subject: "" });
    setNotice("Mesaj backend'e kaydedildi.");
  }

  return (
    <section className="content-page">
      <PageHero title="İletişim" subtitle="Mağaza, sipariş ve destek talepleriniz için bize ulaşın." />
      <div className="contact-layout">
        <form onSubmit={submit}>
          <label>Ad Soyad<input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Ad Soyad" /></label>
          <label>E-posta<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder={settings.contactInfo.email} /></label>
          <label>Telefon<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Telefon" /></label>
          <label>Konu<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Konu" /></label>
          <label>Mesaj<textarea required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Mesajınız..." /></label>
          <button className="primary">Mesaj Gönder</button>
        </form>
        <aside>
          <h3>Bize Ulaşın</h3>
          <p>{settings.contactInfo.address}</p>
          <p>{settings.contactInfo.phone}</p>
          <p>{settings.contactInfo.email}</p>
          <div className="map-card">{settings.contactInfo.mapLabel}</div>
        </aside>
      </div>
    </section>
  );
}

function FaqPage() {
  return (
    <section className="content-page">
      <PageHero title="Sık Sorulan Sorular" subtitle="Müşteri akışları için sık sorulan sorular." />
      <div className="faq-list">
        {[
          ["Sepete ürün ekleme backend ile çalışıyor mu?", "Evet. /cart/items endpoint'i ve cookie tabanlı sepet akışı kullanılıyor."],
          ["Kuponlar gerçek mi?", "Evet. SPRINT9 gibi kuponlar backend kupon servisinde doğrulanır."],
          ["Ödeme nasıl ilerliyor?", "Kargo seçeneği, ödeme başlatma ve test Iyzico onay akışı bağlı."],
          ["Siparişler nerede görünür?", "Hesap girişi sonrası Siparişlerim sayfası /orders endpoint'ini okur."],
          ["İade akışı hazır mı?", "İadelerim sayfası /returns endpoint'ine bağlıdır; backend iade durum akışı hazır."],
        ].map(([question, answer]) => (
          <details key={question} open>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function ProductPage({
  product,
  session,
  setView,
  selectProduct,
  addToCart,
  setNotice,
}: {
  product: ProductWithDetail;
  session: AuthSession | null;
  setView: (view: View) => void;
  selectProduct: (product: ProductWithDetail) => void;
  addToCart: (product: ProductWithDetail, variantId?: string | null, qty?: number) => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"description" | "info" | "reviews">("description");
  const [selectedVariantId, setSelectedVariantId] = useState(product.variantId ?? "");
  const [qty, setQty] = useState(1);
  const [related, setRelated] = useState<ProductWithDetail[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewMeta, setReviewMeta] = useState({ averageRating: 0, total: 0 });
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", comment: "" });

  useEffect(() => {
    setSelectedVariantId(bestSellableVariant(product)?.id ?? product.variantId ?? "");
    setActiveTab("description");
    void loadProductExtras();
  }, [product.slug]);

  async function loadProductExtras() {
    const [relatedResult, reviewResult] = await Promise.all([
      api<{ data: Product[] }>(`/products/${product.slug}/related?limit=4`),
      api<{ data: ProductReview[]; meta: { averageRating: number; total: number } }>(`/products/${product.slug}/reviews`),
    ]);
    setRelated(relatedResult.data.map(normalizeProduct));
    setReviews(reviewResult.data);
    setReviewMeta(reviewResult.meta);
  }

  async function submitReview() {
    if (!session) {
      setNotice("Yorum yazmak icin once hesap girisi yap.");
      setView("account");
      return;
    }
    try {
      await api(`/products/${product.slug}/reviews`, {
        method: "POST",
        token: session.accessToken,
        body: JSON.stringify(reviewForm),
      });
      setNotice("Yorumun yayınlandı.");
      setReviewForm({ rating: 5, title: "", comment: "" });
      await loadProductExtras();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Yorum gönderilemedi.");
    }
  }

  return (
    <section className="content-page">
      <nav className="breadcrumb">
        <button onClick={() => setView("home")}>Anasayfa</button>
        <button onClick={() => setView("shop")}>Mağaza</button>
        {product.breadcrumb?.map((category) => <span key={category.id}>{category.name}</span>)}
        <strong>{product.name}</strong>
      </nav>
      <div className="product-detail-page">
        <div className="product-gallery">
          <span className="sale-tag product-sale">Öne Çıkan</span>
          <img src={productImageUrl(product)} alt={product.name} />
          <div>{(product.images?.length ? product.images : [product.primaryImage].filter(Boolean)).slice(0, 4).map((image, index) => <img src={productImageUrl(product, index)} alt={image?.altText ?? product.name} key={image?.id ?? index} />)}</div>
        </div>
        <div className="product-summary">
          <button className="link-button" onClick={() => setView("shop")}>← Mağazaya dön</button>
          <h1>{product.name}</h1>
          <div className="stars">★★★★★ {reviewMeta.averageRating || 5} / 5 ({reviewMeta.total} yorum)</div>
          <strong>{formatTry(product.priceCents)}</strong>
          <p>{product.description ?? product.shortDescription ?? "Backend katalog ürünü."}</p>
          <div className="stock-bar"><span style={{ width: `${Math.min(product.stock?.available ?? 0, 25) * 4}%` }} /> <small>{stockLabel(product)}</small></div>
          <dl>
            <dt>SKU</dt><dd>{product.sku}</dd>
            <dt>Kategori</dt><dd>{product.category?.name ?? "Genel"}</dd>
            <dt>Stok Satırı</dt><dd>{selectedVariantId ? "Seçilebilir" : "Uygun değil"}</dd>
          </dl>
          <div className="variant-row">
            <label>Stok Kodu / Fiyat
              <select value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value)}>
                {product.variants?.map((variant) => {
                  const available = variantAvailability(product, variant.id);
                  return <option disabled={available < 1} key={variant.id} value={variant.id}>{variant.sku} - {formatTry(variant.priceCents)} ({available} stok)</option>;
                })}
              </select>
            </label>
            <label>Adet
              <input type="number" min="1" max={Math.max(1, variantAvailability(product, selectedVariantId))} value={qty} onChange={(event) => setQty(Math.max(1, Number(event.target.value) || 1))} />
            </label>
          </div>
          <div className="product-actions">
            <button className="primary" disabled={!isSellable(product, selectedVariantId)} onClick={() => addToCart(product, selectedVariantId, qty)}>{isSellable(product, selectedVariantId) ? "Sepete Ekle" : "Stokta Yok"}</button>
            <button onClick={() => setView("cart")}>Sepeti Gör</button>
            <button onClick={() => setView("checkout")}>Ödemeye Geç</button>
          </div>
          <div className="product-assurance">
            <article><b>Hızlı Kargo</b><span>Kargo seçenekleri backend üzerinden gelir.</span></article>
            <article><b>30 Gün İade</b><span>İade ve ücret iadesi akışı hazır.</span></article>
            <article><b>Güvenli Ödeme</b><span>Test Iyzico ödeme onayı entegre.</span></article>
          </div>
        </div>
      </div>
      <section className="product-tabs">
        <button className={activeTab === "description" ? "active-tab" : ""} onClick={() => setActiveTab("description")}>Açıklama</button>
        <button className={activeTab === "info" ? "active-tab" : ""} onClick={() => setActiveTab("info")}>Ek Bilgiler</button>
        <button className={activeTab === "reviews" ? "active-tab" : ""} onClick={() => setActiveTab("reviews")}>Yorumlar</button>
        <article>
          {activeTab === "description" && (
            <>
              <h2>Ürün Açıklaması</h2>
              <p>{product.description ?? product.shortDescription ?? "Bu ürün backend katalog servisinden okunur; sepet, kupon ve ödeme akışları aynı API üzerinden devam eder."}</p>
            </>
          )}
          {activeTab === "info" && (
            <>
              <h2>Ek Bilgiler</h2>
              <p>SKU: <b>{product.sku}</b>. Kategori: <b>{product.category?.name ?? "Genel"}</b>. Stok durumu: <b>{product.variantId ? "Seçilebilir" : "Uygun değil"}</b>.</p>
            </>
          )}
          {activeTab === "reviews" && (
            <>
              <h2>Müşteri Yorumları</h2>
              <p>{reviewMeta.averageRating || 0} / 5. {reviewMeta.total} yorum kaydı backendden geliyor.</p>
              <div className="review-list">
                {reviews.map((review) => (
                  <article key={review.id}>
                    <b>{review.title ?? "Müşteri yorumu"}</b>
                    <span>{"★".repeat(review.rating)} - {review.customerName}</span>
                    <p>{review.comment}</p>
                  </article>
                ))}
                {!reviews.length && <p>Bu ürüne henüz yorum yok.</p>}
              </div>
              <div className="review-form">
                <select value={reviewForm.rating} onChange={(event) => setReviewForm({ ...reviewForm, rating: Number(event.target.value) })}>
                  {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} yıldız</option>)}
                </select>
                <input value={reviewForm.title} onChange={(event) => setReviewForm({ ...reviewForm, title: event.target.value })} placeholder="Yorum başlığı" />
                <textarea value={reviewForm.comment} onChange={(event) => setReviewForm({ ...reviewForm, comment: event.target.value })} placeholder="Yorumunuz" />
                <button className="primary" onClick={submitReview}>Yorumu Gönder</button>
              </div>
            </>
          )}
        </article>
      </section>
      <SectionTitle title="Benzer Ürünler" />
      <ProductGrid
        products={related}
        selectProduct={selectProduct}
        addToCart={(item) => void addToCart(item)}
        toggleCustomerItem={async () => setNotice("Beğenilenler ve karşılaştırma için mağaza sayfasındaki ürün kartlarını kullanabilirsin.")}
        wishlistIds={[]}
        compareIds={[]}
      />
    </section>
  );
}

function PolicyPage() {
  return (
    <section className="content-page">
      <PageHero title="Gizlilik Politikası" subtitle="Yayın öncesi temel KVKK ve gizlilik sayfa iskeleti." />
      <div className="faq-list">
        {["Hesap ve sipariş verileri sadece e-ticaret akışları için kullanılır.", "Ödeme akışı test Iyzico entegrasyonu ile ayrı tutulur.", "Sepet cookie bilgisi kullanıcı deneyimini sürdürmek için saklanır.", "İade ve kargo verileri operasyon kaydı olarak tutulur."].map((text) => (
          <details key={text} open><summary>{text}</summary><p>Canlıya çıkmadan önce hukuk metni marka gereksinimlerine göre genişletilebilir.</p></details>
        ))}
      </div>
    </section>
  );
}

function StoresPage() {
  return (
    <section className="content-page">
      <PageHero title="Mağazalar" subtitle="Footer mağaza bağlantısı için teslim ve servis noktaları." />
      <div className="record-list">
        {["İstanbul Operasyon Merkezi", "Ankara Teslim Noktası", "İzmir Servis Deposu"].map((store, index) => (
          <article key={store}>
            <span>Mağaza 0{index + 1}</span>
            <h3>{store}</h3>
            <p>Hafta içi 09:00 - 18:00</p>
            <strong>Teslim Noktası ve Destek</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function PageHero({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="page-hero"><h1>{title}</h1><p>{subtitle}</p></div>;
}

function ProductGrid(props: {
  products: ProductWithDetail[];
  selectProduct: (product: ProductWithDetail) => void;
  addToCart: (product: ProductWithDetail) => void;
  toggleCustomerItem: (kind: "wishlist" | "compare", product: ProductWithDetail) => Promise<void>;
  wishlistIds: string[];
  compareIds: string[];
}) {
  return (
    <section className="product-grid">
      {props.products.map((product, index) => (
        <article className="product-card" key={product.id}>
          {index % 3 === 0 && <span className="sale-tag">-{3 + index}%</span>}
          <button className="image-button" onClick={() => props.selectProduct(product)}><img src={productImageUrl(product, index)} alt={product.name} /></button>
          <div className="quick-actions">
            <button onClick={() => void props.toggleCustomerItem("wishlist", product)}>{props.wishlistIds.includes(product.id) ? "Favoride" : "Favori"}</button>
            <button onClick={() => void props.toggleCustomerItem("compare", product)}>{props.compareIds.includes(product.id) ? "Karşılaştırmada" : "Karşılaştır"}</button>
            <button onClick={() => props.selectProduct(product)}>Hızlı bakış</button>
          </div>
          <button className="product-title-button" onClick={() => props.selectProduct(product)}>{product.name}</button>
          <div className="stars">★★★★★</div>
          <p>{formatTry(product.priceCents)} <small>{stockLabel(product)}</small></p>
          <button disabled={!isSellable(product)} onClick={() => props.addToCart(product)}>{isSellable(product) ? "Sepete Ekle" : "Stokta Yok"}</button>
        </article>
      ))}
    </section>
  );
}

function ProductList({ products, selectProduct }: { products: ProductWithDetail[]; selectProduct: (product: ProductWithDetail) => void }) {
  return (
    <div className="deal-list">
      {products.map((product) => (
        <button key={product.id} onClick={() => selectProduct(product)}>
          <img src={productImageUrl(product)} alt="" />
          <div><b>{product.name}</b><span>{formatTry(product.priceCents)}</span></div>
        </button>
      ))}
    </div>
  );
}

function ProductModal({ product, onClose, addToCart }: { product: ProductWithDetail; onClose: () => void; addToCart: (product: ProductWithDetail) => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <article className="product-modal" onClick={(event) => event.stopPropagation()}>
        <button className="close" onClick={onClose}>×</button>
        <img src={productImageUrl(product)} alt={product.name} />
        <div>
          <h2>{product.name}</h2>
          <div className="stars">★★★★★</div>
          <p>{product.description ?? product.shortDescription}</p>
          <strong>{formatTry(product.priceCents)}</strong>
          <button className="primary" disabled={!isSellable(product)} onClick={() => addToCart(product)}>{isSellable(product) ? "Sepete Ekle" : "Stokta Yok"}</button>
        </div>
      </article>
    </div>
  );
}

function SectionTitle({ title, tabs, subtitle }: { title: string; tabs?: string[]; subtitle?: string }) {
  return <div className="section-title"><h2>{title}</h2><p>{subtitle ?? "Bahçe ve el aletleri için özenle seçilmiş ürünleri keşfedin."}</p>{tabs && <div>{tabs.map((tab) => <button key={tab} onClick={() => { window.location.hash = "shop"; }}>{tab}</button>)}</div>}</div>;
}

function Promo({ image, eyebrow, title, buttonText, setView }: { image: string; eyebrow: string; title: string; buttonText: string; setView: (view: View) => void }) {
  return <article className="promo" style={{ backgroundImage: `url(${image})` }}><span>{eyebrow}</span><h3>{title}</h3><button onClick={() => setView("shop")}>{buttonText}</button></article>;
}

function Testimonials() {
  return <section className="testimonials"><SectionTitle title="Müşterilerimiz Ne Diyor?" /><div>{["Ürün, fiyat ve teslimat çok başarılı", "Güven veren alışveriş deneyimi", "Kaliteli ürün ve güçlü destek"].map((title) => <article key={title}><b>{title}</b><p>Ürün seçimi net, ödeme akışı kolay ve teslimat süreci hesap panelinden rahatça takip ediliyor.</p><strong>Jenny Cristofor</strong><small>Kurucu</small></article>)}</div></section>;
}

function BlogPreview({ settings, openBlog }: { settings: StorefrontSettings; openBlog: (postId: string) => void }) {
  const posts = storefrontBlogPosts(settings)
    .filter((post) => post.isFeatured)
    .slice(0, 3);

  return (
    <section className="blog-preview">
      <SectionTitle title="Son Rehberler ve Haberler" />
      <div>
        {posts.map((post) => (
          <article key={post.id}>
            <span>{post.date} - {post.author}</span>
            <h3>{post.title}</h3>
            <p>{post.excerpt}</p>
            <button onClick={() => openBlog(post.id)}>Devamını Oku</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Footer({ setView, settings }: { setView: (view: View) => void; settings: StorefrontSettings }) {
  return (
    <footer>
      <section className="footer-grid">
        <div><h3>Mağazamız</h3><p>Kaliteli ürünler, güvenli ödeme ve güçlü müşteri desteğiyle bahçe ihtiyaçlarınız için buradayız.</p></div>
        <div><h3>Ürünler</h3><button onClick={() => setView("shop")}>İndirimdekiler</button><button onClick={() => setView("shop")}>Yeni Ürünler</button><button onClick={() => setView("shop")}>Çok Satanlar</button><button onClick={() => setView("stores")}>Mağazalar</button></div>
        <div><h3>Kurumsal</h3><button onClick={() => setView("orders")}>Teslimat</button><button onClick={() => setView("privacy")}>Yasal Bilgilendirme</button><button onClick={() => setView("privacy")}>Kullanım Koşulları</button><button onClick={() => setView("about")}>Hakkımızda</button></div>
        <div><h3>İletişim</h3><p>{settings.contactInfo.address}</p><p>{settings.contactInfo.phone}</p><p>{settings.contactInfo.email}</p><button onClick={() => setView("contact")}>İletişim Formu</button></div>
      </section>
      <div className="copyright">© 2026 Toolband Demo - Bahçe Shop vitrini</div>
    </footer>
  );
}

export default App;
