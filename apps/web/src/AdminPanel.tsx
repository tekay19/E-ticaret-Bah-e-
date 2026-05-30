import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  ApiError,
  api,
  defaultStorefrontSettings,
  formatTry,
  type AuthSession,
  type Category,
  type Product,
  type StorefrontSettings,
} from "./api";

type AdminSection = "dashboard" | "showcase" | "blog" | "productsCatalog" | "productCreate" | "categories" | "inventory" | "orders" | "returns" | "coupons";
type AdminProduct = Product & {
  priceCents?: number;
  primaryImage?: Product["primaryImage"];
  material?: string | null;
  usageArea?: string[] | null;
  seasonTags?: string[] | null;
  warrantyMonths?: number | null;
  isReturnable?: boolean;
  isHazardous?: boolean;
};
type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  subtotalCents?: number;
  discountCents?: number;
  shippingCents?: number;
  carrierCode?: string;
  couponCode?: string | null;
  customerNote?: string | null;
  internalNote?: string | null;
  shippingAddress?: Record<string, unknown>;
  customer?: { fullName?: string; phone?: string | null } | null;
  items?: Array<{ id: string; productSnapshot: { name?: string; sku?: string }; variantSnapshot?: { sku?: string }; quantity: number; unitPriceCents?: number; totalCents: number }>;
  createdAt: string;
};
type AdminOrderDetail = AdminOrder & {
  payment?: { status: string; provider: string; amountCents: number } | null;
  internalNote?: string | null;
};
type AdminReturn = {
  id: string;
  returnNumber: string;
  status: string;
  reason: string;
  refundAmountCents: number | null;
  returnShippingPaidBy?: string;
  requestedAt: string;
};
type AdminReturnDetail = AdminReturn & {
  customerNote?: string | null;
  adminNote?: string | null;
  rejectedReason?: string | null;
  returnTrackingNumber?: string | null;
  approvedAt?: string | null;
  receivedAt?: string | null;
  refundedAt?: string | null;
  items?: Array<{ id: string; quantity: number; unitRefundCents: number; itemCondition: string | null; restockEligible: boolean }>;
  history?: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; changedAt: string }>;
};
type AdminCoupon = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: "percent" | "fixed";
  discountValue: number;
  maxDiscountCents: number | null;
  minSubtotalCents: number;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
type ProductHistoryItem = {
  id: string;
  action: string;
  summary: string;
  actorRole: string | null;
  statusCode: number;
  path: string;
  createdAt: string;
};
type ProductEditorStep = "details" | "media" | "sales";
type AdminCategory = Category & {
  parentId?: string | null;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  depth: number;
};
type CategoryFormState = {
  name: string;
  parentId: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
};

const sections: Array<{ id: AdminSection; label: string; icon: string }> = [
  { id: "dashboard", label: "Kontrol Merkezi", icon: "⌁" },
  { id: "showcase", label: "Vitrin", icon: "◈" },
  { id: "blog", label: "Blog", icon: "✎" },
  { id: "productsCatalog", label: "Katalog", icon: "◆" },
  { id: "productCreate", label: "Yeni ürün oluştur", icon: "+" },
  { id: "categories", label: "Kategoriler", icon: "▦" },
  { id: "inventory", label: "Stok", icon: "↕" },
  { id: "orders", label: "Siparişler", icon: "☰" },
  { id: "returns", label: "İadeler", icon: "↺" },
  { id: "coupons", label: "Kuponlar", icon: "%" },
];

const orderStatusLabels: Record<string, string> = {
  pending_payment: "Ödeme bekliyor",
  paid: "Ödendi",
  preparing: "Hazırlanıyor",
  shipped: "Kargoda",
  delivered: "Teslim edildi",
  completed: "Tamamlandı",
  cancelled: "İptal",
};
const orderTransitions: Record<string, string[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

const movementLabels: Record<string, string> = {
  purchase: "Satın alma / depoya giriş",
  sale: "Satış / stoktan düş",
  return: "İade / depoya dönüş",
  adjustment: "Manuel düzeltme",
  waste: "Fire / kayıp",
  transfer_in: "Transfer giriş",
  transfer_out: "Transfer çıkış",
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

const returnReasonLabels: Record<string, string> = {
  cayma_hakki: "Cayma hakkı",
  hasarli_kargo: "Hasarlı kargo",
  yanlis_urun: "Yanlış ürün",
  defolu_urun: "Defolu ürün",
  aciklamayla_uyumsuz: "Açıklamayla uyumsuz",
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

function friendlyError(error: unknown, fallback = "İşlem tamamlanamadı. Bilgileri kontrol edip tekrar dene.") {
  const message = error instanceof Error ? error.message : "";
  if (!message) return fallback;
  if (message.includes("Invalid enum value") && message.includes("image/")) return "Bu görsel formatı desteklenmiyor. Sadece PNG, JPG veya WEBP yükleyebilirsin; SVG desteklenmiyor.";
  if (message.toLowerCase().includes("beklenmeyen bir hata")) return fallback;
  if (message.toLowerCase().includes("rate limit")) return "Çok hızlı işlem yaptık. Birkaç dakika sonra tekrar dene.";
  if (message.toLowerCase().includes("failed to fetch")) return "Sunucuya ulaşılamadı. Docker/API çalışıyor mu kontrol edelim.";
  if (message.includes("uuid")) return "Seçilen kayıt geçersiz görünüyor. Listeden tekrar seçim yap.";
  return message.length > 160 ? fallback : message;
}

function listToText(value?: string[] | null) {
  return value?.join(", ") ?? "";
}

function textToList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const supportedUploadImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
type SupportedUploadImageType = typeof supportedUploadImageTypes[number];

function uploadImageContentType(file: File): SupportedUploadImageType | null {
  const detectedType = file.type.toLowerCase();
  if (supportedUploadImageTypes.includes(detectedType as SupportedUploadImageType)) {
    return detectedType as SupportedUploadImageType;
  }
  if (detectedType) {
    return null;
  }

  const fileName = file.name.toLowerCase();
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) return "image/jpeg";
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  return null;
}

function unsupportedImageMessage(files: File[]) {
  const names = files.map((file) => file.name).join(", ");
  return `${names} desteklenmiyor. Sadece PNG, JPG veya WEBP yükleyebilirsin; SVG desteklenmiyor.`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function productImage(product: Product) {
  const image = product.primaryImage ?? product.images?.[0];
  return image?.webpUrl ?? image?.thumbnailUrl ?? image?.url ?? "";
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function isoInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateQuery(from: string, to: string, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (from) params.set("from", new Date(`${from}T00:00:00.000Z`).toISOString());
  if (to) params.set("to", new Date(`${to}T23:59:59.999Z`).toISOString());
  return params.toString();
}

function dashboardRange(preset: "today" | "7d" | "30d") {
  const to = new Date();
  const from = new Date(to);
  if (preset === "7d") from.setDate(to.getDate() - 6);
  if (preset === "30d") from.setDate(to.getDate() - 29);
  return { from: isoInput(from), to: isoInput(to) };
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

const blogFonts = [
  { label: "Site fontu", value: "inherit" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: "'Times New Roman', serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', sans-serif" },
];

const blogFontSizes = ["14px", "16px", "18px", "20px", "24px", "28px"];

function normalizeBlogPost(post: StorefrontSettings["blogPosts"][number]): StorefrontSettings["blogPosts"][number] {
  return {
    ...post,
    contentHtml: post.contentHtml || `<p>${post.excerpt}</p>`,
    fontFamily: post.fontFamily || "inherit",
    fontSize: post.fontSize || "16px",
    textColor: post.textColor || "#1f2937",
  };
}

function sanitizeBlogHtml(input: string) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = input;
  wrapper.querySelectorAll("script, style, iframe, object, embed, meta, link").forEach((node) => node.remove());
  const allowedTags = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "A", "H2", "H3", "H4", "SPAN"]);

  function cleanNode(node: Node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    Array.from(element.childNodes).forEach(cleanNode);
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    Array.from(element.attributes).forEach((attribute) => {
      if (element.tagName === "A" && attribute.name === "href") return;
      if (attribute.name !== "style") element.removeAttribute(attribute.name);
    });
    const safeStyle = [
      element.style.color ? `color: ${element.style.color}` : "",
      element.style.fontWeight ? `font-weight: ${element.style.fontWeight}` : "",
      element.style.fontStyle ? `font-style: ${element.style.fontStyle}` : "",
      element.style.textDecoration ? `text-decoration: ${element.style.textDecoration}` : "",
      element.style.fontSize ? `font-size: ${element.style.fontSize}` : "",
      element.style.fontFamily ? `font-family: ${element.style.fontFamily}` : "",
      element.style.textAlign ? `text-align: ${element.style.textAlign}` : "",
    ].filter(Boolean).join("; ");
    if (safeStyle) element.setAttribute("style", safeStyle);
    else element.removeAttribute("style");
    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer");
    }
  }

  Array.from(wrapper.childNodes).forEach(cleanNode);
  wrapper.querySelectorAll("p, div").forEach((node) => {
    const text = node.textContent?.trim() ?? "";
    if (text === "/" || /^\/\s*(başlık|liste|resim|image|heading|todo|table|quote)?$/i.test(text)) node.remove();
  });
  return wrapper.innerHTML.trim() || "<p></p>";
}

function blogPlainText(input: string) {
  if (!input) return "";
  const wrapper = document.createElement("div");
  wrapper.innerHTML = input;
  return wrapper.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function BlogRichEditor({
  editorKey,
  html,
  fontFamily,
  fontSize,
  textColor,
  onChange,
}: {
  editorKey: string;
  html: string;
  fontFamily: string;
  fontSize: string;
  textColor: string;
  onChange: (html: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [editorKey]);

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const rawHtml = event.clipboardData.getData("text/html");
    const rawText = event.clipboardData.getData("text/plain");
    const fallbackHtml = rawText.split("\n").map((line) => `<p>${line || "<br>"}</p>`).join("");
    const cleaned = sanitizeBlogHtml(rawHtml || fallbackHtml);
    document.execCommand("insertHTML", false, cleaned);
    window.setTimeout(() => {
      onChange(sanitizeBlogHtml(editorRef.current?.innerHTML ?? ""));
    }, 0);
  }

  function syncEditor() {
    window.setTimeout(() => {
      onChange(sanitizeBlogHtml(editorRef.current?.innerHTML ?? ""));
    }, 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    document.execCommand(event.shiftKey ? "insertLineBreak" : "insertParagraph", false);
    syncEditor();
  }

  return (
    <div
      ref={editorRef}
      className="blog-rich-editor"
      contentEditable
      dir="ltr"
      lang="tr"
      spellCheck
      autoCorrect="on"
      autoCapitalize="sentences"
      suppressContentEditableWarning
      style={{ fontFamily, fontSize, color: textColor }}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      onInput={(event) => onChange(sanitizeBlogHtml(event.currentTarget.innerHTML))}
    />
  );
}

function addressLine(address?: Record<string, unknown>) {
  if (!address) return "Adres yok";
  return [address.addressLine, address.district, address.city].map(textValue).filter(Boolean).join(", ") || "Adres yok";
}

function orderProductSummary(order: AdminOrder) {
  const names = order.items?.map((item) => item.productSnapshot.name).filter(Boolean) ?? [];
  if (!names.length) return "Ürün bilgisi yok";
  if (names.length === 1) return String(names[0]);
  return `${names[0]} + ${names.length - 1} ürün`;
}

function orderCustomerName(order: AdminOrder) {
  return order.customer?.fullName || textValue(order.shippingAddress?.fullName) || "Müşteri bilgisi yok";
}

function isAdmin(session: AuthSession | null) {
  return session?.user.role === "admin" || session?.user.role === "super_admin";
}

function AdminPagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="admin-pagination">
      <button
        type="button"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
        className="pagination-btn"
      >
        ← Önceki
      </button>
      <span className="pagination-info">
        Sayfa <strong>{currentPage}</strong> / {totalPages}
      </span>
      <button
        type="button"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className="pagination-btn"
      >
        Sonraki →
      </button>
    </div>
  );
}

export function AdminPanel({
  session,
  saveSession,
  setNotice,
  goStorefront,
  onCatalogChanged,
  onStorefrontChanged,
}: {
  session: AuthSession | null;
  saveSession: (session: AuthSession | null) => void;
  setNotice: (value: string) => void;
  goStorefront: () => void;
  onCatalogChanged: () => Promise<void>;
  onStorefrontChanged: () => Promise<void>;
}) {
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [openProductId, setOpenProductId] = useState<string | null>(null);

  useEffect(() => {
    function handleExpired(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail as { message?: string } : null;
      saveSession(null);
      setNotice(detail?.message ?? "Oturum süresi doldu, tekrar giriş yapman gerekiyor.");
    }

    window.addEventListener("admin-session-expired", handleExpired);
    return () => window.removeEventListener("admin-session-expired", handleExpired);
  }, [saveSession, setNotice]);

  useEffect(() => {
    if (!session) return;
    api("/admin/ping", { token: session.accessToken })
      .catch((error: Error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          saveSession(null);
          setNotice("Oturum süreniz doldu. Lütfen tekrar giriş yapın.");
        }
      });
  }, [session?.accessToken]);

  if (!session || !isAdmin(session)) {
    return (
      <div className="admin-loading-container" style={{ display: "grid", placeItems: "center", height: "100vh", background: "#f8fafc" }}>
        <div style={{ textAlign: "center", color: "#64748b", fontFamily: "Inter, sans-serif" }}>
          <p style={{ fontSize: "16px", fontWeight: 600 }}>Yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  return (
    <section className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>GM</span>
          <strong>Gnbtechmachinery</strong>
          <small>Operasyon merkezi</small>
        </div>
        {sections.map((item) => {
          const isProductSub = item.id === "productsCatalog" || item.id === "productCreate";
          return (
            <div className="admin-menu-wrap" key={item.id}>
              {item.id === "productsCatalog" && <small className="admin-menu-group">Ürünler</small>}
              <button className={`${section === item.id ? "active-admin" : ""} ${isProductSub ? "admin-subnav" : ""}`} onClick={() => setSection(item.id)}><span>{item.icon}</span>{item.label}</button>
            </div>
          );
        })}
        <div className="admin-sidebar-footer">
          <button onClick={goStorefront}>Vitrine dön</button>
          <button onClick={() => saveSession(null)}>Çıkış yap</button>
        </div>
      </aside>
      <main className="admin-main">
        {section === "dashboard" && <AdminDashboard token={session.accessToken} />}
        {section === "showcase" && <AdminShowcase token={session.accessToken} setNotice={setNotice} onStorefrontChanged={onStorefrontChanged} />}
        {section === "blog" && <AdminBlogSettings token={session.accessToken} setNotice={setNotice} onStorefrontChanged={onStorefrontChanged} />}
        {section === "productsCatalog" && <AdminProducts mode="catalog" token={session.accessToken} setNotice={setNotice} onCatalogChanged={onCatalogChanged} openProductId={openProductId} onProductOpened={() => setOpenProductId(null)} />}
        {section === "productCreate" && <AdminProducts mode="create" token={session.accessToken} setNotice={setNotice} onCatalogChanged={onCatalogChanged} onCreated={(productId) => { setOpenProductId(productId); setSection("productsCatalog"); }} />}
        {section === "categories" && <AdminCategories token={session.accessToken} setNotice={setNotice} onCatalogChanged={onCatalogChanged} />}
        {section === "inventory" && <AdminInventory token={session.accessToken} setNotice={setNotice} />}
        {section === "orders" && <AdminOrders token={session.accessToken} setNotice={setNotice} />}
        {section === "returns" && <AdminReturns token={session.accessToken} setNotice={setNotice} />}
        {section === "coupons" && <AdminCoupons token={session.accessToken} setNotice={setNotice} />}
      </main>
    </section>
  );
}

function MetricCardPremium({ 
  title, 
  value, 
  text, 
  tone, 
  trend 
}: { 
  title: string; 
  value: string | number; 
  text: string; 
  tone?: "blue" | "gold" | "red" | "green"; 
  trend?: { type: "up" | "down" | "neutral"; label: string } 
}) {
  return (
    <article className={`admin-metric-premium ${tone ? `tone-${tone}` : ""}`}>
      <span>{title}</span>
      <strong style={{ display: "block", margin: "5px 0" }}>
        {value} <span style={{ fontSize: "14px", fontWeight: "normal", color: "var(--muted)" }}>{text}</span>
      </strong>
      {trend && (
        <div className={`trend-badge ${trend.type}`}>
          {trend.type === "up" ? "▲" : trend.type === "down" ? "▼" : "•"} {trend.label}
        </div>
      )}
    </article>
  );
}

function AdminSalesChart({ series }: { series: any[] }) {
  const [hovered, setHovered] = useState<any | null>(null);
  
  if (!series || !series.length) {
    return <p className="admin-help">Seçilen aralıkta satış verisi yok.</p>;
  }

  const width = 600;
  const height = 240;
  const margin = { top: 20, right: 30, bottom: 35, left: 65 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const salesValues = series.map((item) => numberValue(item.netSalesCents));
  const maxSales = Math.max(...salesValues, 10000);
  const maxOrders = Math.max(...series.map((item) => numberValue(item.orderCount)), 1);

  // Generate coordinates for Sales
  const salesPoints = series.map((item, index) => {
    const x = margin.left + (series.length > 1 ? (index / (series.length - 1)) * chartWidth : chartWidth / 2);
    const y = margin.top + chartHeight - (numberValue(item.netSalesCents) / maxSales) * chartHeight;
    return { x, y, item };
  });

  // Generate coordinates for Orders
  const ordersPoints = series.map((item, index) => {
    const x = margin.left + (series.length > 1 ? (index / (series.length - 1)) * chartWidth : chartWidth / 2);
    const y = margin.top + chartHeight - (numberValue(item.orderCount) / maxOrders) * chartHeight;
    return { x, y, item };
  });

  // SVG Paths
  const salesLinePath = salesPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const salesAreaPath = salesPoints.length ? `${salesLinePath} L ${salesPoints[salesPoints.length - 1].x} ${margin.top + chartHeight} L ${salesPoints[0].x} ${margin.top + chartHeight} Z` : "";

  const ordersLinePath = ordersPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const ordersAreaPath = ordersPoints.length ? `${ordersLinePath} L ${ordersPoints[ordersPoints.length - 1].x} ${margin.top + chartHeight} L ${ordersPoints[0].x} ${margin.top + chartHeight} Z` : "";

  // Grid levels (4 levels)
  const gridLevels = [0, 0.33, 0.66, 1];

  return (
    <div className="svg-chart-wrapper">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
        <defs>
          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--yellow)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--yellow)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLevels.map((lvl, idx) => {
          const y = margin.top + lvl * chartHeight;
          const val = Math.round(((1 - lvl) * maxSales) / 100);
          return (
            <g key={idx}>
              <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} className="chart-grid-line" />
              <text x={margin.left - 8} y={y + 4} textAnchor="end" className="chart-axis-text">
                {val} TL
              </text>
            </g>
          );
        })}

        {/* X axis labels (Dates) */}
        {series.map((item, index) => {
          if (series.length > 8 && index % Math.ceil(series.length / 5) !== 0) return null;
          const x = margin.left + (series.length > 1 ? (index / (series.length - 1)) * chartWidth : chartWidth / 2);
          return (
            <text key={index} x={x} y={height - 8} textAnchor="middle" className="chart-axis-text">
              {String(item.day).slice(5)}
            </text>
          );
        })}

        {/* Chart Areas */}
        {salesAreaPath && <path d={salesAreaPath} className="chart-area-sales" />}
        {ordersAreaPath && <path d={ordersAreaPath} className="chart-area-orders" />}

        {/* Chart Lines */}
        {salesLinePath && <path d={salesLinePath} className="chart-line-sales" />}
        {ordersLinePath && <path d={ordersLinePath} className="chart-line-orders" />}

        {/* Hover highlight line */}
        {hovered && (
          <line 
            x1={hovered.x} 
            y1={margin.top} 
            x2={hovered.x} 
            y2={margin.top + chartHeight} 
            className="chart-hover-highlight" 
            style={{ opacity: 1 }}
          />
        )}

        {/* Sales Dots */}
        {salesPoints.map((p, i) => (
          <circle
            key={`s-${i}`}
            cx={p.x}
            cy={p.y}
            r={hovered && hovered.index === i ? 6 : 4}
            className="chart-interactive-dot sales-dot"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.parentElement?.getBoundingClientRect();
              const svgWidth = rect?.width ?? width;
              const ratio = svgWidth / width;
              setHovered({
                index: i,
                x: p.x,
                y: p.y,
                left: p.x * ratio,
                top: p.y * ratio,
                date: p.item.day,
                sales: Math.round(numberValue(p.item.netSalesCents) / 100),
                orders: numberValue(p.item.orderCount),
              });
            }}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        {/* Orders Dots */}
        {ordersPoints.map((p, i) => (
          <circle
            key={`o-${i}`}
            cx={p.x}
            cy={p.y}
            r={hovered && hovered.index === i ? 5 : 3}
            className="chart-interactive-dot orders-dot"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.parentElement?.getBoundingClientRect();
              const svgWidth = rect?.width ?? width;
              const ratio = svgWidth / width;
              setHovered({
                index: i,
                x: p.x,
                y: p.y,
                left: p.x * ratio,
                top: p.y * ratio,
                date: p.item.day,
                sales: Math.round(numberValue(series[i]?.netSalesCents ?? 0) / 100),
                orders: numberValue(p.item.orderCount),
              });
            }}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div 
          className="chart-tooltip" 
          style={{ 
            left: `${hovered.left}px`, 
            top: `${hovered.top}px`,
            opacity: 1
          }}
        >
          <strong>{hovered.sales} TL</strong>
          <small>{hovered.orders} Sipariş</small>
          <small>{hovered.date}</small>
        </div>
      )}
    </div>
  );
}

function AdminShowcase({ token, setNotice, onStorefrontChanged }: { token: string; setNotice: (value: string) => void; onStorefrontChanged: () => Promise<void> }) {
  const [form, setForm] = useState<StorefrontSettings>(defaultStorefrontSettings);
  const [showcaseTab, setShowcaseTab] = useState<"general" | "campaign">("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [token]);

  async function load() {
    try {
      setLoading(true);
      const result = await api<{ data: StorefrontSettings }>("/site-settings", { token });
      setForm({ ...defaultStorefrontSettings, ...result.data });
      setError(null);
    } catch (caught) {
      setError(friendlyError(caught, "Vitrin ayarları alınamadı."));
    } finally {
      setLoading(false);
    }
  }

  function patch(patch: Partial<StorefrontSettings>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function patchCategoryName(index: number, name: string) {
    setForm((current) => ({
      ...current,
      fallbackCategories: current.fallbackCategories.map((category, itemIndex) => (
        itemIndex === index ? { ...category, name } : category
      )),
    }));
  }

  function patchRecord(field: "orderStatusLabels" | "returnReasonLabels" | "returnStatusLabels" | "returnConditionLabels", key: string, value: string) {
    setForm((current) => ({
      ...current,
      [field]: {
        ...current[field],
        [key]: value,
      },
    }));
  }

  function patchAddress(field: keyof StorefrontSettings["checkoutAddressDefaults"], value: string) {
    setForm((current) => ({
      ...current,
      checkoutAddressDefaults: {
        ...current.checkoutAddressDefaults,
        [field]: value,
      },
    }));
  }

  function patchContact(field: keyof StorefrontSettings["contactInfo"], value: string) {
    setForm((current) => ({
      ...current,
      contactInfo: {
        ...current.contactInfo,
        [field]: value,
      },
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      const result = await api<{ data: StorefrontSettings }>("/admin/site-settings", {
        method: "PATCH",
        token,
        body: JSON.stringify(form),
      });
      setForm({ ...defaultStorefrontSettings, ...result.data });
      await onStorefrontChanged();
      setNotice("Vitrin ayarları güncellendi. Ana sayfa yeni metinlerle yenilendi.");
      setError(null);
    } catch (caught) {
      setError(friendlyError(caught, "Vitrin ayarları kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-card admin-form">
      <div className="admin-section-head">
        <div><span>Vitrin kontrolü</span><h2>Ana sayfa ve üst bant</h2></div>
        <button type="button" onClick={load}>Yenile</button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {loading ? <p className="admin-help">Vitrin ayarları yükleniyor...</p> : (
        <form className="cat-form" onSubmit={submit}>
          <div className="showcase-tabs">
            <button
              type="button"
              className={showcaseTab === "general" ? "active" : ""}
              onClick={() => setShowcaseTab("general")}
            >
              ◈ Genel & İletişim
            </button>
            <button
              type="button"
              className={showcaseTab === "campaign" ? "active" : ""}
              onClick={() => setShowcaseTab("campaign")}
            >
              ✦ Kampanya & Fırsat
            </button>
          </div>

          {showcaseTab === "general" && (
            <>
              <div className="showcase-section-box">
                <h3>◈ Genel Mağaza Bilgileri</h3>
                <div className="cat-form-grid">
                  <label className="cat-field cat-field-wide">
                    <span className="cat-field-label">Üst mavi bant yazısı</span>
                    <input value={form.promoText} onChange={(event) => patch({ promoText: event.target.value })} />
                    <span className="cat-field-help">Sitenin en üst kısmında yer alan mavi duyuru şeridindeki metin (Örn: kampanya duyuruları, indirim kodları).</span>
                  </label>
                  <label className="cat-field">
                    <span className="cat-field-label">Telefon başlığı</span>
                    <input value={form.phoneLabel} onChange={(event) => patch({ phoneLabel: event.target.value })} />
                    <span className="cat-field-help">Telefon numarasının solunda görüntülenen başlık metni (Örn: 'Hemen Ara:', 'Destek Hattı:').</span>
                  </label>
                  <label className="cat-field">
                    <span className="cat-field-label">Telefon numarası</span>
                    <input value={form.phoneNumber} onChange={(event) => patch({ phoneNumber: event.target.value })} />
                    <span className="cat-field-help">Sitenin sağ üstünde ve en alt (footer) alanında gösterilen iletişim numarası.</span>
                  </label>
                </div>
              </div>

              <div className="showcase-section-box">
                <h3>✉ İletişim Bilgileri</h3>
                <div className="cat-form-grid">
                  <label className="cat-field">
                    <span className="cat-field-label">Mağaza e-posta</span>
                    <input value={form.contactInfo.email} onChange={(event) => patchContact("email", event.target.value)} />
                    <span className="cat-field-help">Müşterilerin size ulaşabileceği, İletişim sayfasında ve alt bilgi (footer) alanında yer alan e-posta adresi.</span>
                  </label>
                  <label className="cat-field">
                    <span className="cat-field-label">Mağaza telefon</span>
                    <input value={form.contactInfo.phone} onChange={(event) => patchContact("phone", event.target.value)} />
                    <span className="cat-field-help">İletişim sayfasında listelenen resmi mağaza telefon numarası.</span>
                  </label>
                  <label className="cat-field cat-field-wide">
                    <span className="cat-field-label">Mağaza adresi</span>
                    <input value={form.contactInfo.address} onChange={(event) => patchContact("address", event.target.value)} />
                    <span className="cat-field-help">İletişim sayfasında ve fatura şablonlarında görüntülenecek fiziki mağaza/şirket adresi.</span>
                  </label>
                  <label className="cat-field">
                    <span className="cat-field-label">Harita kartı yazısı</span>
                    <input value={form.contactInfo.mapLabel} onChange={(event) => patchContact("mapLabel", event.target.value)} />
                    <span className="cat-field-help">İletişim sayfasındaki harita görselinin üzerinde veya yanında gösterilecek tanıtıcı kısa metin.</span>
                  </label>
                </div>
              </div>


            </>
          )}

          {showcaseTab === "campaign" && (
            <>
              <div className="showcase-section-box">
                <h3>✦ Fırsat & Kampanya Metinleri</h3>
                <div className="cat-form-grid">
                  <label className="cat-field">
                    <span className="cat-field-label">Günün fırsatları menü yazısı</span>
                    <input value={form.dailyDealLabel} onChange={(event) => patch({ dailyDealLabel: event.target.value })} />
                    <span className="cat-field-help">Üst menü çubuğundaki Günün Fırsatları butonunun üzerinde yazacak metin (Örn: 'Günün Fırsatları', 'İndirimler').</span>
                  </label>
                  <label className="cat-field">
                    <span className="cat-field-label">Haftanın fırsatları başlığı</span>
                    <input value={form.weeklyDealsTitle} onChange={(event) => patch({ weeklyDealsTitle: event.target.value })} />
                    <span className="cat-field-help">Ana sayfadaki haftalık indirimli ürünler bölümünün ana başlığı (Örn: 'Haftanın Fırsatları').</span>
                  </label>
                  <label className="cat-field cat-field-wide">
                    <span className="cat-field-label">Haftanın fırsatları açıklaması</span>
                    <input value={form.weeklyDealsSubtitle} onChange={(event) => patch({ weeklyDealsSubtitle: event.target.value })} />
                    <span className="cat-field-help">Haftanın Fırsatları başlığının hemen altında yer alan açıklayıcı alt başlık metni.</span>
                  </label>
                </div>
              </div>

              <div className="showcase-section-box">
                <h3>⏱ Kampanya Sayaç & Limit Ayarları</h3>
                <div className="cat-form-grid">
                  <label className="cat-field">
                    <span className="cat-field-label">Gösterilecek ürün sayısı</span>
                    <input type="number" min={1} max={12} value={form.weeklyDealsLimit} onChange={(event) => patch({ weeklyDealsLimit: Number(event.target.value) })} />
                    <span className="cat-field-help">Haftanın Fırsatları alanında listelenecek maksimum ürün adedi (1 ile 12 arasında olmalıdır).</span>
                  </label>
                  <label className="cat-field">
                    <span className="cat-field-label">Sayaç gün</span>
                    <input type="number" min={0} max={999} value={form.weeklyCountdownDays} onChange={(event) => patch({ weeklyCountdownDays: Number(event.target.value) })} />
                    <span className="cat-field-help">Haftanın fırsatı süresinin bitmesine kaç gün kaldığını gösteren sayaç değeri.</span>
                  </label>
                  <label className="cat-field">
                    <span className="cat-field-label">Sayaç saat</span>
                    <input type="number" min={0} max={23} value={form.weeklyCountdownHours} onChange={(event) => patch({ weeklyCountdownHours: Number(event.target.value) })} />
                    <span className="cat-field-help">Geri sayım sayacındaki saat değeri (0 - 23 arası).</span>
                  </label>
                  <label className="cat-field">
                    <span className="cat-field-label">Sayaç dakika</span>
                    <input type="number" min={0} max={59} value={form.weeklyCountdownMinutes} onChange={(event) => patch({ weeklyCountdownMinutes: Number(event.target.value) })} />
                    <span className="cat-field-help">Geri sayım sayacındaki dakika değeri (0 - 59 arası).</span>
                  </label>
                </div>
              </div>

              <div className="showcase-section-box">
                <h3>⇄ Öne Çıkarılan Promosyon Kartları (Yan Yana Çift Kart)</h3>
                <div className="cat-form-grid">
                  {/* Sol Kart */}
                  <div style={{ gridColumn: "span 1", borderRight: "1px solid var(--line)", paddingRight: "16px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--blue)" }}>Sol Kart Ayarları</h4>
                    <label className="cat-field cat-field-wide">
                      <span className="cat-field-label">Sol fırsat üst yazı</span>
                      <input value={form.promoCardOneEyebrow} onChange={(event) => patch({ promoCardOneEyebrow: event.target.value })} />
                      <span className="cat-field-help">Sol tanıtım kartının en üstündeki küçük renkli etiket yazısı (Örn: 'Kaçırma! Sıcak Fırsat').</span>
                    </label>
                    <label className="cat-field cat-field-wide">
                      <span className="cat-field-label">Sol fırsat başlığı</span>
                      <input value={form.promoCardOneTitle} onChange={(event) => patch({ promoCardOneTitle: event.target.value })} />
                      <span className="cat-field-help">Sol tanıtım kartının büyük kalın başlığı.</span>
                    </label>
                    <label className="cat-field cat-field-wide">
                      <span className="cat-field-label">Sol fırsat butonu</span>
                      <input value={form.promoCardOneButton} onChange={(event) => patch({ promoCardOneButton: event.target.value })} />
                      <span className="cat-field-help">Sol tanıtım kartının üzerindeki buton metni.</span>
                    </label>
                  </div>

                  {/* Sağ Kart */}
                  <div style={{ gridColumn: "span 1", paddingLeft: "8px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--blue)" }}>Sağ Kart Ayarları</h4>
                    <label className="cat-field cat-field-wide">
                      <span className="cat-field-label">Sağ fırsat üst yazı</span>
                      <input value={form.promoCardTwoEyebrow} onChange={(event) => patch({ promoCardTwoEyebrow: event.target.value })} />
                      <span className="cat-field-help">Sağ tanıtım kartının en üstündeki küçük renkli etiket yazısı (Örn: 'Yeni Gelenler').</span>
                    </label>
                    <label className="cat-field cat-field-wide">
                      <span className="cat-field-label">Sağ fırsat başlığı</span>
                      <input value={form.promoCardTwoTitle} onChange={(event) => patch({ promoCardTwoTitle: event.target.value })} />
                      <span className="cat-field-help">Sağ tanıtım kartının büyük kalın başlığı.</span>
                    </label>
                    <label className="cat-field cat-field-wide">
                      <span className="cat-field-label">Sağ fırsat butonu</span>
                      <input value={form.promoCardTwoButton} onChange={(event) => patch({ promoCardTwoButton: event.target.value })} />
                      <span className="cat-field-help">Sağ tanıtım kartının üzerindeki buton metni.</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="showcase-section-box">
                <h3>▭ Alt Geniş Banner Afişi</h3>
                <div className="cat-form-grid">
                  <label className="cat-field">
                    <span className="cat-field-label">Alt geniş banner başlığı</span>
                    <input value={form.wideBannerTitle} onChange={(event) => patch({ wideBannerTitle: event.target.value })} />
                    <span className="cat-field-help">Ana sayfanın alt kısmındaki büyük tam genişlikli kampanya bandının ana başlığı.</span>
                  </label>
                  <label className="cat-field">
                    <span className="cat-field-label">Alt geniş banner butonu</span>
                    <input value={form.wideBannerButton} onChange={(event) => patch({ wideBannerButton: event.target.value })} />
                    <span className="cat-field-help">Büyük kampanya bandının üzerindeki yönlendirme butonu metni.</span>
                  </label>
                </div>
              </div>
            </>
          )}

<div className="wizard-actions">
            <button type="button" onClick={() => setForm(defaultStorefrontSettings)}>Varsayılanı yükle</button>
            <button className="primary" disabled={saving}>{saving ? "Kaydediliyor..." : "Vitrini Kaydet"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function AdminBlogSettings({ token, setNotice, onStorefrontChanged }: { token: string; setNotice: (value: string) => void; onStorefrontChanged: () => Promise<void> }) {
  const [form, setForm] = useState<StorefrontSettings>(defaultStorefrontSettings);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [blogQuery, setBlogQuery] = useState("");
  const [blogFilter, setBlogFilter] = useState<"all" | "featured" | "hidden">("all");
  const [blogPage, setBlogPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedPost = form.blogPosts[selectedIndex] ? normalizeBlogPost(form.blogPosts[selectedIndex]) : null;
  const pageSize = 6;
  const filteredBlogPosts = form.blogPosts
    .map((post, index) => ({ post: normalizeBlogPost(post), index }))
    .filter(({ post }) => {
      const haystack = `${post.title} ${post.excerpt} ${post.author}`.toLocaleLowerCase("tr-TR");
      const matchesQuery = !blogQuery.trim() || haystack.includes(blogQuery.trim().toLocaleLowerCase("tr-TR"));
      const matchesFilter = blogFilter === "all" || (blogFilter === "featured" ? post.isFeatured : !post.isFeatured);
      return matchesQuery && matchesFilter;
    });
  const blogTotalPages = Math.max(1, Math.ceil(filteredBlogPosts.length / pageSize));
  const pagedBlogPosts = filteredBlogPosts.slice((blogPage - 1) * pageSize, blogPage * pageSize);

  useEffect(() => {
    void load();
  }, [token]);

  async function load() {
    try {
      setLoading(true);
      const result = await api<{ data: StorefrontSettings }>("/site-settings", { token });
      const next = { ...defaultStorefrontSettings, ...result.data };
      setForm({ ...next, blogPosts: next.blogPosts.map(normalizeBlogPost) });
      setSelectedIndex(0);
      setBlogPage(1);
      setError(null);
    } catch (caught) {
      setError(friendlyError(caught, "Blog yazıları alınamadı."));
    } finally {
      setLoading(false);
    }
  }

  function patchBlogPost(index: number, patch: Partial<StorefrontSettings["blogPosts"][number]>) {
    setForm((current) => ({
      ...current,
      blogPosts: current.blogPosts.map((post, itemIndex) => (
        itemIndex === index ? { ...post, ...patch } : post
      )),
    }));
  }

  function addBlogPost() {
    const nextPost = {
      id: `blog-${Date.now()}`,
      title: "Yeni blog yazısı",
      excerpt: "Kısa açıklama yazın.",
      contentHtml: "<p>Yeni blog içeriğini buraya yazın.</p>",
      date: new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }),
      author: "Editör",
      imageUrl: "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/10/23-460x460.jpg",
      fontFamily: "inherit",
      fontSize: "16px",
      textColor: "#1f2937",
      isFeatured: true,
    };
    setForm((current) => ({
      ...current,
      blogPosts: [...current.blogPosts, nextPost],
    }));
    setSelectedIndex(form.blogPosts.length);
    setBlogQuery("");
    setBlogFilter("all");
    setBlogPage(Math.max(1, Math.ceil((form.blogPosts.length + 1) / pageSize)));
  }

  function removeBlogPost(index: number) {
    setForm((current) => ({
      ...current,
      blogPosts: current.blogPosts.filter((_, itemIndex) => itemIndex !== index),
    }));
    setSelectedIndex((current) => Math.max(0, Math.min(current === index ? index - 1 : current, form.blogPosts.length - 2)));
  }

  async function chooseBlogImage(index: number, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const contentType = uploadImageContentType(file);
    if (!contentType) {
      setError(unsupportedImageMessage([file]));
      return;
    }
    if (file.size > 1_500_000) {
      setError("Blog görseli çok büyük. Hızlı açılması için 1.5 MB altında PNG, JPG veya WEBP seç.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      patchBlogPost(index, { imageUrl: dataUrl });
      setError(null);
    } catch {
      setError("Görsel okunamadı. Farklı bir dosya seçip tekrar dene.");
    }
  }

  function runEditorCommand(command: string) {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false);
    syncSelectedEditor();
  }

  function runEditorCommandWithValue(command: string, value: string) {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    syncSelectedEditor();
  }

  function applyEditorLineHeight(value: string) {
    const selection = window.getSelection();
    const editor = document.querySelector<HTMLDivElement>(".blog-rich-editor");
    if (!selection || !editor) return;
    const anchor = selection.anchorNode;
    if (!anchor || !editor.contains(anchor)) return;
    const target = anchor.nodeType === Node.ELEMENT_NODE ? anchor as HTMLElement : anchor.parentElement;
    const block = target?.closest("p, div, li, h2, h3, h4") as HTMLElement | null;
    if (block && editor.contains(block)) {
      block.style.lineHeight = value;
    } else {
      editor.style.lineHeight = value;
    }
    syncSelectedEditor();
  }

  function syncSelectedEditor() {
    window.setTimeout(() => {
      const editor = document.querySelector<HTMLDivElement>(".blog-rich-editor");
      if (editor) {
        patchBlogPost(selectedIndex, { contentHtml: sanitizeBlogHtml(editor.innerHTML) });
      }
    }, 0);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true);
      const result = await api<{ data: StorefrontSettings }>("/admin/site-settings", {
        method: "PATCH",
        token,
        body: JSON.stringify({ blogPosts: form.blogPosts.map(normalizeBlogPost) }),
      });
      const next = { ...defaultStorefrontSettings, ...result.data };
      setForm({ ...next, blogPosts: next.blogPosts.map(normalizeBlogPost) });
      setSelectedIndex((current) => Math.min(current, Math.max(0, next.blogPosts.length - 1)));
      await onStorefrontChanged();
      setNotice("Blog yazıları güncellendi. Blog sayfası ve ana sayfa önizlemesi yenilendi.");
      setError(null);
    } catch (caught) {
      setError(friendlyError(caught, "Blog yazıları kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-card admin-form">
      <div className="admin-section-head">
        <div><span>İçerik yönetimi</span><h2>Blog yazıları</h2></div>
        <div className="wizard-actions">
          <button type="button" onClick={load}>Yenile</button>
          <button type="button" onClick={addBlogPost}>Yeni Yazı Ekle</button>
        </div>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {loading ? <p className="admin-help">Blog yazıları yükleniyor...</p> : (
        <form className="cat-form" onSubmit={submit}>
          <div className="blog-manager-layout">
            <aside className="blog-manager-list">
              <div className="blog-manager-list-head">
                <strong>Yazılar</strong>
                <span>{filteredBlogPosts.length} / {form.blogPosts.length} kayıt</span>
              </div>
              <div className="blog-list-filters">
                <input value={blogQuery} onChange={(event) => { setBlogQuery(event.target.value); setBlogPage(1); }} placeholder="Yazı ara..." />
                <select value={blogFilter} onChange={(event) => { setBlogFilter(event.target.value as "all" | "featured" | "hidden"); setBlogPage(1); }}>
                  <option value="all">Tüm yazılar</option>
                  <option value="featured">Ana sayfada görünenler</option>
                  <option value="hidden">Sadece blogda olanlar</option>
                </select>
              </div>
              {pagedBlogPosts.map(({ post, index }) => (
                <button
                  type="button"
                  className={`blog-list-item ${selectedIndex === index ? "active" : ""}`}
                  onClick={() => setSelectedIndex(index)}
                  key={post.id}
                >
                  <img src={post.imageUrl} alt="" />
                  <span>
                    <b>{post.title}</b>
                    <small>
                      {post.date}
                      {post.isFeatured && (
                        <span className="blog-item-featured-badge">Öne Çıkan</span>
                      )}
                    </small>
                  </span>
                </button>
              ))}
              {!pagedBlogPosts.length && <p className="admin-help">Bu filtreye uygun yazı yok.</p>}
              <div className="blog-list-pagination">
                <button type="button" disabled={blogPage <= 1} onClick={() => setBlogPage((page) => Math.max(1, page - 1))}>Önceki</button>
                <span>{blogPage} / {blogTotalPages}</span>
                <button type="button" disabled={blogPage >= blogTotalPages} onClick={() => setBlogPage((page) => Math.min(blogTotalPages, page + 1))}>Sonraki</button>
              </div>
            </aside>

            {selectedPost && (
              <section className="blog-editor-panel">
                <div className="blog-editor-panel-head">
                  <div>
                    <span>Yazı içeriğini düzenle</span>
                    <h3>{selectedPost.title}</h3>
                  </div>
                  {form.blogPosts.length > 1 && <button type="button" className="danger-soft" onClick={() => removeBlogPost(selectedIndex)}>Yazıyı Sil</button>}
                </div>

                <div className="blog-metadata-wrapper" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "16px", marginBottom: "16px" }}>
                  <div className="blog-cover-section">
                    <span className="cat-field-label" style={{ display: "block", marginBottom: "6px" }}>Kapak Görseli</span>
                    <div 
                      className="blog-cover-upload-container"
                      onClick={() => document.getElementById("blog-file-input")?.click()}
                    >
                      {selectedPost.imageUrl ? (
                        <>
                          <img src={selectedPost.imageUrl} className="blog-cover-preview-img" alt="" />
                          <div className="blog-cover-overlay">
                            <span>Görseli Değiştir</span>
                          </div>
                        </>
                      ) : (
                        <div className="blog-cover-empty-label">
                          <span className="icon">🖼</span>
                          <span>Görsel Seç</span>
                        </div>
                      )}
                    </div>
                    <input 
                      type="file" 
                      id="blog-file-input" 
                      accept="image/png,image/jpeg,image/webp" 
                      style={{ display: "none" }} 
                      onChange={(event) => void chooseBlogImage(selectedIndex, event.currentTarget.files)} 
                    />
                  </div>
                  <div className="cat-form-grid" style={{ flex: 1 }}>
                    <label className="cat-field">
                      <span className="cat-field-label">Başlık</span>
                      <input value={selectedPost.title} onChange={(event) => patchBlogPost(selectedIndex, { title: event.target.value })} />
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", gridColumn: "span 1" }}>
                      <label className="cat-field" style={{ gridColumn: "span 1" }}>
                        <span className="cat-field-label">Tarih</span>
                        <input value={selectedPost.date} onChange={(event) => patchBlogPost(selectedIndex, { date: event.target.value })} />
                      </label>
                      <label className="cat-field" style={{ gridColumn: "span 1" }}>
                        <span className="cat-field-label">Yazar</span>
                        <input value={selectedPost.author} onChange={(event) => patchBlogPost(selectedIndex, { author: event.target.value })} />
                      </label>
                    </div>
                    <label className="cat-field cat-field-wide">
                      <span className="cat-field-label">Kısa açıklama</span>
                      <textarea value={selectedPost.excerpt} onChange={(event) => patchBlogPost(selectedIndex, { excerpt: event.target.value })} style={{ height: "68px", resize: "none" }} />
                    </label>
                  </div>
                </div>

                <div className="blog-editor-shell">
                  <div className="blog-editor-toolbar">
                    <div className="blog-toolbar-group">
                      <span>Paragraf</span>
                      <select defaultValue="P" onChange={(event) => runEditorCommandWithValue("formatBlock", event.target.value)}>
                        <option value="P">Normal yazı</option>
                        <option value="H2">Başlık 1</option>
                        <option value="H3">Başlık 2</option>
                        <option value="H4">Başlık 3</option>
                      </select>
                    </div>
                    <div className="blog-toolbar-group">
                      <span>Yazı</span>
                      <select value={selectedPost.fontFamily} onChange={(event) => patchBlogPost(selectedIndex, { fontFamily: event.target.value })}>
                        {blogFonts.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
                      </select>
                      <select value={selectedPost.fontSize} onChange={(event) => patchBlogPost(selectedIndex, { fontSize: event.target.value })}>
                        {blogFontSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                      <input type="color" value={selectedPost.textColor} onChange={(event) => patchBlogPost(selectedIndex, { textColor: event.target.value })} aria-label="Yazı rengi" />
                    </div>
                    <div className="blog-toolbar-group blog-toolbar-buttons">
                      <span>Biçim</span>
                      <button type="button" title="Geri Al" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("undo"); }}>↶</button>
                      <button type="button" title="İleri Al" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("redo"); }}>↷</button>
                      <button type="button" title="Kalın" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("bold"); }}><b>B</b></button>
                      <button type="button" title="İtalik" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("italic"); }}><i>I</i></button>
                      <button type="button" title="Altı Çizili" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("underline"); }}><u>U</u></button>
                      <button type="button" title="Biçimlendirmeyi Temizle" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("removeFormat"); }}>🧹</button>
                      <button type="button" title="Madde İşaretli Liste" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("insertUnorderedList"); }}>•</button>
                      <button type="button" title="Numaralı Liste" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("insertOrderedList"); }}>1.</button>
                    </div>
                    <div className="blog-toolbar-group blog-toolbar-buttons">
                      <span>Hizala</span>
                      <button type="button" title="Sola Hizala" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("justifyLeft"); }}>Sol</button>
                      <button type="button" title="Ortala" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("justifyCenter"); }}>Orta</button>
                      <button type="button" title="Sağa Hizala" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("justifyRight"); }}>Sağ</button>
                      <button type="button" title="İki Yana Yasla" onMouseDown={(event) => { event.preventDefault(); runEditorCommand("justifyFull"); }}>İki yana</button>
                    </div>
                    <div className="blog-toolbar-group">
                      <span>Satır</span>
                      <select defaultValue="1.7" onChange={(event) => applyEditorLineHeight(event.target.value)}>
                        <option value="1.2">Sıkı</option>
                        <option value="1.5">Normal</option>
                        <option value="1.7">Rahat</option>
                        <option value="2">Çift</option>
                      </select>
                    </div>
                  </div>
                  <div className="blog-editor-page">
                    <BlogRichEditor
                      editorKey={selectedPost.id}
                      html={selectedPost.contentHtml}
                      fontFamily={selectedPost.fontFamily}
                      fontSize={selectedPost.fontSize}
                      textColor={selectedPost.textColor}
                      onChange={(html) => patchBlogPost(selectedIndex, { contentHtml: html })}
                    />
                  </div>
                  <div className="blog-editor-status">
                    <small>Kopyala-yapıştır yapabilirsin; gereksiz slash/blok komutları temizlenir, temel biçim korunur.</small>
                    <span>{blogPlainText(selectedPost.contentHtml).split(/\s+/).filter(Boolean).length} kelime</span>
                    <span>{blogPlainText(selectedPost.contentHtml).length} karakter</span>
                    <span>Yazım denetimi açık</span>
                  </div>
                </div>

                <div className="blog-card-actions">
                  <label className="admin-check">
                    <input type="checkbox" checked={selectedPost.isFeatured} onChange={(event) => patchBlogPost(selectedIndex, { isFeatured: event.target.checked })} />
                    Ana sayfada göster
                  </label>
                </div>
              </section>
            )}
          </div>
          <div className="wizard-actions">
            <button type="button" onClick={() => { setForm({ ...form, blogPosts: defaultStorefrontSettings.blogPosts.map(normalizeBlogPost) }); setSelectedIndex(0); }}>Varsayılan blogları yükle</button>
            <button className="primary" disabled={saving}>{saving ? "Kaydediliyor..." : "Blogları Kaydet"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function AdminDashboard({ token }: { token: string }) {
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [sales, setSales] = useState<Record<string, unknown> | null>(null);
  const [inventory, setInventory] = useState<unknown[]>([]);
  const [coupons, setCoupons] = useState<unknown[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [returns, setReturns] = useState<AdminReturn[]>([]);
  const [rangePreset, setRangePreset] = useState<"today" | "7d" | "30d" | "custom">("7d");
  const defaultRange = dashboardRange("7d");
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, [token, from, to]);

  function choosePreset(next: "today" | "7d" | "30d" | "custom") {
    setRangePreset(next);
    if (next !== "custom") {
      const range = dashboardRange(next);
      setFrom(range.from);
      setTo(range.to);
    }
  }

  async function loadDashboard() {
    setError(null);
    const query = dateQuery(from, to, 20);
    try {
      const [overviewResult, salesResult, inventoryResult, couponResult, orderResult, returnResult] = await Promise.all([
        api<{ data: Record<string, unknown> }>(`/admin/reports/overview?${query}`, { token }),
        api<{ data: Record<string, unknown> }>(`/admin/reports/sales?${query}`, { token }),
        api<{ data: unknown[] }>(`/admin/reports/inventory?${query}`, { token }),
        api<{ data: unknown[] }>(`/admin/reports/coupons?${query}`, { token }),
        api<{ data: AdminOrder[] }>(`/admin/orders?${query}`, { token }),
        api<{ data: AdminReturn[] }>("/admin/returns", { token }),
      ]);
      setOverview(overviewResult.data);
      setSales(salesResult.data);
      setInventory(inventoryResult.data);
      setCoupons(couponResult.data);
      setOrders(orderResult.data);
      setReturns(returnResult.data);
    } catch (caught) {
      setError(friendlyError(caught, "Yönetim özeti verileri alınamadı."));
    }
  }

  const series = Array.isArray(sales?.series) ? sales.series as Array<Record<string, unknown>> : [];

  // Extra metrics calculation
  const totalOrdersVal = numberValue(overview?.totalOrders);
  const netSalesCentsVal = numberValue(overview?.netSalesCents);
  const grossSalesCentsVal = numberValue(overview?.grossSalesCents);
  const discountCentsVal = numberValue(overview?.discountCents);
  const refundCountVal = numberValue(overview?.refundCount);
  const lowStockCountVal = numberValue(overview?.lowStockCount);
  const outOfStockCountVal = numberValue(overview?.outOfStockCount);
  const newCustomersVal = numberValue(overview?.newCustomers);

  const aovTL = Math.round(numberValue(overview?.avgOrderValueCents) / 100);

  const returnRatePercent = totalOrdersVal > 0 
    ? ((refundCountVal / totalOrdersVal) * 100).toFixed(1) 
    : "0.0";

  const cancelledOrdersVal = numberValue(overview?.cancelledOrders);
  const cancelRatePercent = totalOrdersVal > 0 
    ? ((cancelledOrdersVal / totalOrdersVal) * 100).toFixed(1) 
    : "0.0";

  const discountRatioPercent = grossSalesCentsVal > 0 
    ? ((discountCentsVal / grossSalesCentsVal) * 100).toFixed(1) 
    : "0.0";

  return (
    <div className="admin-grid">
      <section className="admin-card dashboard-filter">
        <div className="admin-section-head"><div><span>Tarih filtresi</span><h2>Yönetim Özeti</h2></div><button onClick={loadDashboard}>Yenile</button></div>
        {error && <p className="admin-error">{error}</p>}
        <div className="dashboard-range-buttons">
          <button className={rangePreset === "today" ? "active" : ""} onClick={() => choosePreset("today")}>Bugün</button>
          <button className={rangePreset === "7d" ? "active" : ""} onClick={() => choosePreset("7d")}>7 gün</button>
          <button className={rangePreset === "30d" ? "active" : ""} onClick={() => choosePreset("30d")}>30 gün</button>
          <button className={rangePreset === "custom" ? "active" : ""} onClick={() => choosePreset("custom")}>Özel</button>
        </div>
        <div className="dashboard-date-row">
          <label>Başlangıç<input type="date" value={from} onChange={(event) => { setRangePreset("custom"); setFrom(event.target.value); }} /></label>
          <label>Bitiş<input type="date" value={to} onChange={(event) => { setRangePreset("custom"); setTo(event.target.value); }} /></label>
        </div>
      </section>
      
      <MetricCardPremium title="Net Satış Ciro" value={Math.round(netSalesCentsVal / 100)} text="TL" tone="gold" trend={{ type: "neutral", label: "KDV/Kargo hariç" }} />
      <MetricCardPremium title="Brüt Satış Ciro" value={Math.round(grossSalesCentsVal / 100)} text="TL" tone="blue" trend={{ type: "up", label: "Tüm siparişler" }} />
      <MetricCardPremium title="Ortalama Sipariş (AOV)" value={aovTL} text="TL" tone="blue" trend={{ type: "up", label: "Sipariş ortalaması" }} />
      
      <MetricCardPremium title="İade Oranı" value={returnRatePercent} text="%" tone="green" trend={{ type: "down", label: `${refundCountVal} İade Talebi` }} />
      <MetricCardPremium title="Sipariş İptal Oranı" value={cancelRatePercent} text="%" tone="red" trend={{ type: "neutral", label: `${cancelledOrdersVal} İptal` }} />
      <MetricCardPremium title="Düşük Stok Alarmı" value={lowStockCountVal} text="ürün" tone="red" trend={{ type: "down", label: `${outOfStockCountVal} stokta yok` }} />
      <MetricCardPremium title="Kupon Etkisi" value={discountRatioPercent} text="%" tone="gold" trend={{ type: "up", label: `${Math.round(discountCentsVal / 100)} TL İndirim` }} />
      <MetricCardPremium title="Yeni Kayıt" value={newCustomersVal} text="üye" tone="green" trend={{ type: "up", label: "Dönemlik üye" }} />

      <section className="admin-card dashboard-chart" style={{ gridColumn: "span 4" }}>
        <div className="admin-section-head"><div><span>Satış & Sipariş Analizi</span><h2>Gelir & Talep Gelişimi (Mavi: Satış Ciro, Sarı: Sipariş Adedi)</h2></div></div>
        <AdminSalesChart series={series} />
      </section>
      <section className="admin-card dashboard-list">
        <div className="admin-section-head"><div><span>En çok satanlar</span><h2>Ürün performansı</h2></div></div>
        {(Array.isArray(sales?.topProducts) ? sales.topProducts : []).slice(0, 5).map((item: any) => (
          <article key={item.productId ?? item.sku}>
            <span><b>{item.productName}</b><small>{item.sku}</small></span>
            <strong>{item.quantitySold} adet</strong>
            <em>{formatTry(numberValue(item.grossSalesCents))}</em>
          </article>
        ))}
        {!(Array.isArray(sales?.topProducts) && sales.topProducts.length) && <p className="admin-help">Henüz satış verisi yok.</p>}
      </section>
      <section className="admin-card dashboard-list">
        <div className="admin-section-head"><div><span>Son siparişler</span><h2>Takip edilecek işler</h2></div></div>
        {orders.slice(0, 5).map((order) => (
          <article key={order.id}><span><b>{order.orderNumber}</b><small>{orderProductSummary(order)} / {orderCustomerName(order)}</small></span><strong>{formatTry(order.totalCents)}</strong><em>{labelFor(order.status, orderStatusLabels)}</em></article>
        ))}
        {!orders.length && <p className="admin-help">Sipariş kaydı yok.</p>}
      </section>
      <section className="admin-card dashboard-list">
        <div className="admin-section-head"><div><span>Uyarılar</span><h2>Stok ve iade</h2></div></div>
        {(inventory as Array<Record<string, unknown>>).slice(0, 4).map((item) => (
          <article key={String(item.variantId ?? item.sku)}><span><b>{String(item.productName ?? "Ürün")}</b><small>{String(item.sku ?? "")}</small></span><strong>{Number(item.available ?? 0)} adet</strong><em>Düşük stok</em></article>
        ))}
        {returns.slice(0, 3).map((record) => (
          <article key={record.id}><span><b>{record.returnNumber}</b><small>{labelFor(record.reason, returnReasonLabels)}</small></span><strong>{formatTry(record.refundAmountCents ?? 0)}</strong><em>{labelFor(record.status, returnStatusLabels)}</em></article>
        ))}
        {!inventory.length && !returns.length && <p className="admin-help">Şu an bekleyen stok/iade uyarısı yok.</p>}
      </section>
      <section className="admin-card dashboard-list">
        <div className="admin-section-head"><div><span>Kuponlar</span><h2>Kampanya etkisi</h2></div></div>
        {(coupons as Array<Record<string, unknown>>).slice(0, 5).map((coupon) => (
          <article key={String(coupon.code)}><span><b>{String(coupon.code)}</b><small>{String(coupon.name ?? "")}</small></span><strong>{Number(coupon.redemptionCount ?? 0)} kullanım</strong><em>{formatTry(Number(coupon.discountCents ?? 0))}</em></article>
        ))}
        {!coupons.length && <p className="admin-help">Kupon performans kaydı yok.</p>}
      </section>
    </div>
  );
}

function AdminProducts({
  mode,
  token,
  setNotice,
  onCatalogChanged,
  onCreated,
  openProductId,
  onProductOpened,
}: {
  mode: "catalog" | "create";
  token: string;
  setNotice: (value: string) => void;
  onCatalogChanged: () => Promise<void>;
  onCreated?: (productId: string) => void;
  openProductId?: string | null;
  onProductOpened?: () => void;
}) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<AdminProduct | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    sku: "",
    name: "",
    shortDescription: "",
    description: "",
    categoryId: "",
    priceCents: 10000,
    material: "",
    usageArea: "",
    seasonTags: "",
    warrantyMonths: 24,
    isReturnable: true,
    isHazardous: false,
  });
  const [variantForm, setVariantForm] = useState({ sku: "", priceCents: 10000 });
  const [history, setHistory] = useState<ProductHistoryItem[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [editorStep, setEditorStep] = useState<ProductEditorStep>("details");
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  useEffect(() => {
    void load();
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void search();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, token]);

  useEffect(() => {
    if (!openProductId || !products.length) return;
    const product = products.find((item) => item.id === openProductId);
    if (!product) return;
    void open(product).then(onProductOpened);
  }, [openProductId, products]);

  async function load() {
    const [productResult, categoryResult] = await Promise.all([
      api<{ data: AdminProduct[] }>("/admin/products?limit=50&isActive=all", { token }),
      api<{ data: Category[] }>("/categories", { token }),
    ]);
    setProducts(productResult.data.map((product) => ({ ...product, priceCents: product.variants?.[0]?.priceCents ?? 0 })));
    setCategories(flattenCategories(categoryResult.data));
  }

  async function search() {
    try {
      const path = query.trim() ? `/admin/products?limit=50&isActive=all&q=${encodeURIComponent(query.trim())}` : "/admin/products?limit=50&isActive=all";
      const result = await api<{ data: AdminProduct[] }>(path, { token });
      setProducts(result.data.map((product) => ({ ...product, priceCents: product.variants?.[0]?.priceCents ?? 0 })));
      setError(null);
    } catch (caught) {
      setError(friendlyError(caught, "Ürün listesi alınamadı."));
    }
  }

  async function open(product: AdminProduct) {
    const [result, historyResult] = await Promise.all([
      api<{ data: AdminProduct }>(`/admin/products/${product.id}`, { token }),
      api<{ data: ProductHistoryItem[] }>(`/admin/products/${product.id}/history`, { token }).catch(() => ({ data: [] })),
    ]);
    setSelected({ ...result.data, priceCents: result.data.variants?.[0]?.priceCents ?? 0 });
    setHistory(historyResult.data);
    setEditorStep("details");
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const categoryId = form.categoryId || categories[0]?.id;
    const categoryName = categories.find((category) => category.id === categoryId)?.name ?? "Genel";
    if (!categoryId) {
      setError("Ürün oluşturmak için önce en az bir kategori oluştur.");
      return;
    }
    const unsupportedFiles = selectedFiles.filter((file) => !uploadImageContentType(file));
    if (unsupportedFiles.length) {
      setError(unsupportedImageMessage(unsupportedFiles));
      return;
    }
    try {
      const created = await api<AdminProduct>("/admin/products", {
        method: "POST",
        token,
        body: JSON.stringify({
          sku: form.sku,
          name: form.name,
          shortDescription: form.shortDescription || null,
          description: form.description || form.shortDescription || null,
          categoryId,
          material: form.material || null,
          usageArea: textToList(form.usageArea),
          seasonTags: textToList(form.seasonTags),
          warrantyMonths: Number(form.warrantyMonths),
          isReturnable: form.isReturnable,
          isHazardous: form.isHazardous,
          variants: [{ sku: `${form.sku}-STD`, options: { paket: "standart" }, priceCents: Number(form.priceCents) }],
        }),
      });

      let imageWarning: string | null = null;
      if (selectedFiles.length > 0) {
        try {
          setImageUploading(true);
          setUploadProgress(10);
          const total = selectedFiles.length;
          for (let i = 0; i < total; i++) {
            const file = selectedFiles[i];
            const contentType = uploadImageContentType(file);
            if (!contentType) {
              throw new Error(unsupportedImageMessage([file]));
            }
            const upload = await api<{ key: string; uploadUrl: string }>("/admin/images/upload-url", {
              method: "POST",
              token,
              body: JSON.stringify({ fileName: file.name, contentType }),
            });
            setUploadProgress(Math.round(10 + (i / total) * 60));
            const uploadResponse = await fetch(upload.uploadUrl, { method: "PUT", body: file, headers: { "content-type": contentType } });
            if (!uploadResponse.ok) {
              throw new Error("Görsel depoya yüklenemedi. Ürünü oluşturduk, görseli detay ekranından tekrar ekleyebilirsin.");
            }
            setUploadProgress(Math.round(10 + ((i + 0.5) / total) * 60));
            await api(`/admin/products/${created.id}/images`, {
              method: "POST",
              token,
              body: JSON.stringify({ originalKey: upload.key, altText: created.name }),
            });
            setUploadProgress(Math.round(10 + ((i + 1) / total) * 60));
          }
          setUploadProgress(100);
        } catch (caught) {
          imageWarning = friendlyError(caught, "Görseller yüklenemedi. Ürünü oluşturduk, görselleri detay ekranından tekrar ekleyebilirsin.");
        }
      }

      setForm({ sku: "", name: "", shortDescription: "", description: "", categoryId: "", priceCents: 10000, material: "", usageArea: "", seasonTags: "", warrantyMonths: 24, isReturnable: true, isHazardous: false });
      setSelectedFiles([]);
      setNotice(imageWarning
        ? `${created.name} oluşturuldu. ${imageWarning}`
        : `${form.name} oluşturuldu. Vitrinde Mağaza > ${categoryName} kategorisinde görünür; stok girilmeden sepete eklenemez.`);
      await load();
      await onCatalogChanged();
      onCreated?.(created.id);
    } catch (caught) {
      setError(friendlyError(caught, "Ürün oluşturulamadı."));
    } finally {
      setImageUploading(false);
      setUploadProgress(0);
    }
  }

  async function updateSelected() {
    if (!selected) return;
    try {
      await api(`/admin/products/${selected.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          name: selected.name,
          description: selected.description,
          shortDescription: selected.shortDescription,
          categoryId: selected.categoryId,
          isActive: selected.isActive,
          minStockAlert: selected.minStockAlert,
          material: selected.material,
          usageArea: selected.usageArea ?? [],
          seasonTags: selected.seasonTags ?? [],
          warrantyMonths: selected.warrantyMonths,
          isReturnable: selected.isReturnable,
          isHazardous: selected.isHazardous,
        }),
      });
      setNotice("Ürün güncellendi.");
      await open(selected);
      await load();
      await onCatalogChanged();
    } catch (caught) {
      setNotice(friendlyError(caught, "Ürün güncellenemedi."));
    }
  }

  async function addVariant() {
    if (!selected) return;
    if (!variantForm.sku.trim()) {
      setNotice("Satış satırı için SKU girmen gerekiyor.");
      return;
    }
    try {
      await api(`/admin/products/${selected.id}/variants`, {
        method: "POST",
        token,
        body: JSON.stringify({ sku: variantForm.sku, options: {}, priceCents: Number(variantForm.priceCents) }),
      });
      setVariantForm({ sku: "", priceCents: 10000 });
      setNotice("Satış satırı eklendi.");
      await open(selected);
      setEditorStep("sales");
    } catch (caught) {
      setNotice(friendlyError(caught, "Satış satırı eklenemedi."));
    }
  }

  async function patchVariant(variantId: string, patch: { isActive?: boolean; sku?: string; priceCents?: number }) {
    if (!selected) return;
    try {
      await api(`/admin/products/${selected.id}/variants/${variantId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(patch),
      });
      setNotice("Satış satırı güncellendi.");
      await open(selected);
      setEditorStep("sales");
    } catch (caught) {
      setNotice(friendlyError(caught, "Satış satırı güncellenemedi."));
    }
  }

  async function softDelete(product: AdminProduct) {
    await api(`/admin/products/${product.id}`, { method: "DELETE", token });
    setNotice("Ürün pasife alındı.");
    await load();
    await onCatalogChanged();
  }

  async function activateProduct(product: AdminProduct) {
    await api(`/admin/products/${product.id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ isActive: true }),
    });
    setNotice("Ürün aktif edildi.");
    await load();
    await onCatalogChanged();
  }

  async function uploadImage(file: File) {
    if (!selected) return;
    const contentType = uploadImageContentType(file);
    if (!contentType) {
      setNotice(unsupportedImageMessage([file]));
      return;
    }
    setImageUploading(true);
    setUploadProgress(10);
    setEditorStep("media");
    try {
      const upload = await api<{ key: string; uploadUrl: string }>("/admin/images/upload-url", {
        method: "POST",
        token,
        body: JSON.stringify({ fileName: file.name, contentType }),
      });
      setUploadProgress(40);
      await fetch(upload.uploadUrl, { method: "PUT", body: file, headers: { "content-type": contentType } });
      setUploadProgress(70);
      await api(`/admin/products/${selected.id}/images`, {
        method: "POST",
        token,
        body: JSON.stringify({ originalKey: upload.key, altText: selected.name }),
      });
      setUploadProgress(100);
      setNotice("Görsel yüklendi, galeri yenileniyor.");
      await open(selected);
      setEditorStep("media");
      await load();
      window.setTimeout(() => {
        void open(selected).then(() => setEditorStep("media"));
        setUploadProgress(0);
      }, 1800);
    } catch (caught) {
      setNotice(friendlyError(caught, "Görsel yüklenemedi."));
      setUploadProgress(0);
    } finally {
      setImageUploading(false);
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = Array.from(e.dataTransfer.files).find((item) => item.type.startsWith("image/"));
    if (file) void uploadImage(file);
  };

  function addSelectedProductImages(files: File[]) {
    const acceptedFiles = files.filter((file) => uploadImageContentType(file));
    const rejectedFiles = files.filter((file) => !uploadImageContentType(file));
    if (rejectedFiles.length) {
      setError(unsupportedImageMessage(rejectedFiles));
    }
    if (acceptedFiles.length) {
      setSelectedFiles((current) => [...current, ...acceptedFiles]);
    }
  }

  if (mode === "create") {
    return (
      <div className="product-create-layout">
        <section className="admin-card">
          <form className="cat-form" onSubmit={createProduct}>
            <div className="admin-section-head">
              <div>
                <span>Yeni Ürün</span>
                <h2>Temel Ürün Bilgileri</h2>
              </div>
            </div>
            {error && <p className="admin-error">{error}</p>}
            
            <div className="cat-field-row">
              <div className="cat-field">
                <span className="cat-field-label">SKU <small>(Stok Kodu)</small></span>
                <input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="örn: EL-001" required />
              </div>
              <div className="cat-field">
                <span className="cat-field-label">Ürün Adı</span>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Vitrindeki ürün başlığı" required />
              </div>
            </div>

            <div className="cat-field-row">
              <div className="cat-field">
                <span className="cat-field-label">Kategori</span>
                <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} required>
                  <option value="">Kategori seçin...</option>
                  {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
                </select>
              </div>
              <div className="cat-field">
                <span className="cat-field-label">Fiyat (Kuruş)</span>
                <input type="number" value={form.priceCents} onChange={(event) => setForm({ ...form, priceCents: Number(event.target.value) })} />
              </div>
            </div>

            <div className="cat-field">
              <span className="cat-field-label">Kısa Açıklama</span>
              <textarea value={form.shortDescription} onChange={(event) => setForm({ ...form, shortDescription: event.target.value })} placeholder="Kart ve ürün özetinde görünen kısa metin" />
            </div>

            <div className="cat-field">
              <span className="cat-field-label">Ürün Açıklaması</span>
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ürün detayındaki detaylı açıklama" />
            </div>

            <div className="cat-field-row">
              <div className="cat-field">
                <span className="cat-field-label">Materyal</span>
                <input value={form.material} onChange={(event) => setForm({ ...form, material: event.target.value })} placeholder="Çelik, ahşap, plastik..." />
              </div>
              <div className="cat-field">
                <span className="cat-field-label">Kullanım Alanı <small>(Virgülle ayırın)</small></span>
                <input value={form.usageArea} onChange={(event) => setForm({ ...form, usageArea: event.target.value })} placeholder="Bahçe, balkon, sera" />
              </div>
            </div>

            <div className="cat-field-row">
              <div className="cat-field">
                <span className="cat-field-label">Sezon Etiketleri <small>(Virgülle ayırın)</small></span>
                <input value={form.seasonTags} onChange={(event) => setForm({ ...form, seasonTags: event.target.value })} placeholder="İlkbahar, yaz" />
              </div>
              <div className="cat-field">
                <span className="cat-field-label">Garanti (Ay)</span>
                <input type="number" value={form.warrantyMonths} onChange={(event) => setForm({ ...form, warrantyMonths: Number(event.target.value) })} />
              </div>
            </div>

            <div className="cat-status-panel" style={{ display: 'flex', gap: '20px' }}>
              <label className="cat-toggle-label">
                <input type="checkbox" checked={form.isReturnable} onChange={(event) => setForm({ ...form, isReturnable: event.target.checked })} /> 
                İade Edilebilir
              </label>
              <label className="cat-toggle-label">
                <input type="checkbox" checked={form.isHazardous} onChange={(event) => setForm({ ...form, isHazardous: event.target.checked })} /> 
                Tehlikeli Ürün
              </label>
            </div>

            <p className="admin-help">Bu ürün vitrinde Mağaza sayfasında ve seçtiğin kategori filtresinde görünür. Satılabilir olması için Stok ekranından ürün stoğu gir.</p>
            <button className="primary" style={{ marginTop: '10px' }} disabled={imageUploading}>
              {imageUploading ? "Görseller Yükleniyor..." : "Ürünü Oluştur"}
            </button>
          </form>
        </section>

        <section className="admin-card">
          <div className="admin-section-head">
            <div>
              <span>Görsel Yükleme</span>
              <h2>Ürün Resimleri</h2>
            </div>
          </div>
          
          <div 
            className={`media-dropzone ${dragActive ? "drag-active" : ""}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(false);
              addSelectedProductImages(Array.from(e.dataTransfer.files));
            }}
            onClick={() => document.getElementById("create-file-input")?.click()}
            style={{ marginBottom: "20px" }}
          >
            <input 
              id="create-file-input"
              type="file" 
              accept="image/png,image/jpeg,image/webp" 
              multiple
              onChange={(event) => {
                addSelectedProductImages(Array.from(event.target.files ?? []));
                event.currentTarget.value = "";
              }}
              style={{ display: "none" }}
            />
            <div className="dropzone-icon">☁️</div>
            <div>
              <p style={{ margin: 0 }}>Görselleri buraya sürükleyin veya <strong>dosya seçmek için tıklayın</strong></p>
              <small style={{ color: "var(--muted)", display: "block", marginTop: "4px" }}>Birden fazla görsel seçebilirsiniz. (PNG, JPG, WEBP)</small>
            </div>
          </div>

          {selectedFiles.length > 0 && (
            <div className="staged-media-gallery">
              <h4>Seçilen Görseller ({selectedFiles.length})</h4>
              <div className="staged-media-grid">
                {selectedFiles.map((file, idx) => {
                  const url = URL.createObjectURL(file);
                  return (
                    <article className="staged-media-item" key={idx}>
                      <img src={url} alt={file.name} onLoad={() => URL.revokeObjectURL(url)} />
                      <button 
                        type="button" 
                        className="staged-media-remove" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        ✕
                      </button>
                      <small className="staged-media-name">{file.name}</small>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {imageUploading && (
            <div style={{ marginTop: "20px" }}>
              <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>Görseller sunucuya yükleniyor...</p>
              <div className="dropzone-progress-bar">
                <div className="dropzone-progress-inner" style={{ width: `${uploadProgress}%` }} />
              </div>
              <small style={{ color: "var(--muted)", display: "block", marginTop: "4px" }}>Lütfen sayfayı kapatmayın veya yenilemeyin.</small>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="admin-two-col">
      <section className="admin-card">
        <div className="admin-section-head"><div><span>Katalog</span><h2>Ürün listesi</h2></div><button onClick={search}>Listeyi yenile</button></div>
        <div className="admin-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün adı veya SKU ara" /><button onClick={search}>Ara</button></div>
        <div className="admin-table">
          {products.map((product) => (
            <button className="admin-table-row" key={product.id} onClick={() => void open(product)}>
              <span>{product.name}<small>{product.sku}</small></span>
              <b>{formatTry(product.priceCents ?? 0)}</b>
              <em>{product.isActive ? "Aktif" : "Pasif"}</em>
              {product.isActive ? <button className="row-action danger" onClick={(event) => { event.stopPropagation(); void softDelete(product); }}>Pasife al</button> : <button className="row-action success" onClick={(event) => { event.stopPropagation(); void activateProduct(product); }}>Aktif et</button>}
            </button>
          ))}
        </div>
      </section>
      <section className="admin-card">
        {!selected && <div className="admin-empty"><b>Ürün seç</b><p>Sol listeden bir ürün seçince detay, fiyat, stok kodu ve görsel işlemleri burada açılır.</p></div>}
        {selected && (
          <div className="admin-product-editor">
            <div className="admin-editor-hero">
              <div className="admin-editor-image">{productImage(selected) ? <img src={productImage(selected)} alt={selected.name} /> : <span>Görsel yok</span>}</div>
              <div>
                <span>Vitrin ürün detayı</span>
                <h3>{selected.name}</h3>
                <p>{selected.shortDescription ?? "Kısa açıklama henüz girilmedi."}</p>
              </div>
            </div>
            <div className="product-wizard-steps">
              <button className={editorStep === "details" ? "active" : ""} onClick={() => setEditorStep("details")}><span>1</span> Ürün bilgisi</button>
              <button className={editorStep === "media" ? "active" : ""} onClick={() => setEditorStep("media")}><span>2</span> Görsel galeri</button>
              <button className={editorStep === "sales" ? "active" : ""} onClick={() => setEditorStep("sales")}><span>3</span> Satış & stok</button>
            </div>
            <div className="product-editor-summary">
              <article><span>Durum</span><strong>{selected.isActive ? "Vitrinde aktif" : "Pasif"}</strong></article>
              <article><span>Görsel</span><strong>{selected.images?.length ?? 0} adet</strong></article>
              <article><span>Satış satırı</span><strong>{selected.variants?.length ?? 0} adet</strong></article>
            </div>
            <div className="admin-form">
              {editorStep === "details" && <>
                <div className="admin-section-head"><div><span>Adım 1</span><h2>Ürün bilgisi</h2></div></div>
                <div className="admin-editor-grid">
                  <label>Ürün adı<input value={selected.name} onChange={(event) => setSelected({ ...selected, name: event.target.value })} /></label>
                  <label>Kategori<select value={selected.categoryId} onChange={(event) => setSelected({ ...selected, categoryId: event.target.value })}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
                </div>
                <label>Kısa açıklama<textarea value={selected.shortDescription ?? ""} onChange={(event) => setSelected({ ...selected, shortDescription: event.target.value })} /></label>
                <label>Ürün açıklaması<textarea value={selected.description ?? ""} onChange={(event) => setSelected({ ...selected, description: event.target.value })} /></label>
                <div className="admin-editor-grid">
                  <label>Materyal<input value={selected.material ?? ""} onChange={(event) => setSelected({ ...selected, material: event.target.value })} /></label>
                  <label>Kullanım alanı<input value={listToText(selected.usageArea)} onChange={(event) => setSelected({ ...selected, usageArea: textToList(event.target.value) })} /></label>
                  <label>Sezon etiketleri<input value={listToText(selected.seasonTags)} onChange={(event) => setSelected({ ...selected, seasonTags: textToList(event.target.value) })} /></label>
                  <label>Garanti (ay)<input type="number" value={selected.warrantyMonths ?? 0} onChange={(event) => setSelected({ ...selected, warrantyMonths: Number(event.target.value) })} /></label>
                </div>
                <div className="admin-check-row">
                  <label><input type="checkbox" checked={selected.isActive} onChange={(event) => setSelected({ ...selected, isActive: event.target.checked })} /> Vitrinde aktif</label>
                  <label><input type="checkbox" checked={selected.isReturnable ?? true} onChange={(event) => setSelected({ ...selected, isReturnable: event.target.checked })} /> İade edilebilir</label>
                  <label><input type="checkbox" checked={selected.isHazardous ?? false} onChange={(event) => setSelected({ ...selected, isHazardous: event.target.checked })} /> Tehlikeli ürün</label>
                </div>
                <div className="wizard-actions"><button className="primary" onClick={updateSelected}>Bilgileri kaydet</button><button onClick={() => setEditorStep("media")}>Görsele geç</button></div>
              </>}
              {editorStep === "media" && <div className="product-gallery-admin">
                <div className="admin-section-head"><div><span>Adım 2</span><h2>Görsel galeri</h2></div></div>
                
                <div 
                  className={`media-dropzone ${dragActive ? "drag-active" : ""}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById("dropzone-file-input")?.click()}
                  style={{ marginBottom: "20px" }}
                >
                  <input 
                    id="dropzone-file-input"
                    type="file" 
                    accept="image/png,image/jpeg,image/webp" 
                    disabled={imageUploading} 
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void uploadImage(file);
                    }} 
                  />
                  <div className="dropzone-icon">☁️</div>
                  {imageUploading ? (
                    <div style={{ width: "100%" }}>
                      <p style={{ margin: "0 0 8px 0" }}>Görsel yükleniyor, lütfen bekleyin...</p>
                      <div className="dropzone-progress-bar">
                        <div className="dropzone-progress-inner" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ margin: 0 }}>Görseli buraya sürükleyin veya <strong>dosya seçmek için tıklayın</strong></p>
                      <small style={{ color: "var(--muted)", display: "block", marginTop: "4px" }}>PNG, JPG, WEBP (maks. 5MB)</small>
                    </div>
                  )}
                </div>

                <div className="admin-gallery-grid">
                  {(selected.images ?? []).map((image) => <article key={image.id}><img src={image.webpUrl ?? image.thumbnailUrl ?? image.url} alt={image.altText ?? selected.name} /><small>{image.sortOrder === 0 ? "Ana görsel" : `Sıra ${image.sortOrder}`}</small></article>)}
                  {!(selected.images?.length) && <p className="admin-help">Henüz galeri görseli yok. Görsel yükleyince işlemden sonra burada görünür.</p>}
                </div>
                <div className="wizard-actions"><button onClick={() => setEditorStep("details")}>Bilgiye dön</button><button className="primary" onClick={() => setEditorStep("sales")}>Satış & stoka geç</button></div>
              </div>}
              {editorStep === "sales" && <>
                <div className="admin-section-head"><div><span>Adım 3</span><h2>Satış & stok satırları</h2></div></div>
                <p className="admin-help">Her satır müşteriye satılan fiyat ve SKU bilgisidir. Stok ekranında aynı SKU ile adet girilir.</p>
                <div className="sku-card-list">
                  {selected.variants?.map((variant) => (
                    <article className={!variant.isActive ? "is-passive" : ""} key={variant.id}>
                      <label>SKU<input value={variant.sku} onChange={(event) => setSelected({ ...selected, variants: selected.variants?.map((item) => item.id === variant.id ? { ...item, sku: event.target.value } : item) })} /></label>
                      <label>Fiyat (kuruş)<input type="number" value={variant.priceCents} onChange={(event) => setSelected({ ...selected, variants: selected.variants?.map((item) => item.id === variant.id ? { ...item, priceCents: Number(event.target.value) } : item) })} /></label>
                      <span>{variant.isActive ? "Satışta" : "Pasif"}</span>
                      <div>
                        <button onClick={() => void patchVariant(variant.id, { sku: variant.sku, priceCents: Number(variant.priceCents) })}>Kaydet</button>
                        <button onClick={() => void patchVariant(variant.id, { isActive: !variant.isActive })}>{variant.isActive ? "Pasife al" : "Aktif et"}</button>
                      </div>
                    </article>
                  ))}
                  {!selected.variants?.length && <p className="admin-help">Bu üründe satış satırı yok. Aşağıdan SKU ve fiyat girerek ekle.</p>}
                </div>
                <div className="add-sales-row">
                  <label>Yeni SKU<input value={variantForm.sku} onChange={(event) => setVariantForm({ ...variantForm, sku: event.target.value })} placeholder={`${selected.sku}-STD`} /></label>
                  <label>Fiyat (kuruş)<input type="number" value={variantForm.priceCents} onChange={(event) => setVariantForm({ ...variantForm, priceCents: Number(event.target.value) })} /></label>
                  <button className="primary" onClick={addVariant}>Satış satırı ekle</button>
                </div>
                <div className="wizard-actions"><button onClick={() => setEditorStep("media")}>Görsele dön</button></div>
              </>}
              <div className="product-history">
                <div className="admin-section-head"><div><span>Geçmiş</span><h2>Ürün işlemleri</h2></div></div>
                {history.slice(0, 8).map((item) => <article key={item.id}><span>{item.action}</span><b>{item.summary}</b><small>{new Date(item.createdAt).toLocaleString("tr-TR")} / {item.actorRole ?? "sistem"}</small></article>)}
                {!history.length && <p className="admin-help">Bu ürün için işlem geçmişi henüz oluşmadı.</p>}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const emptyCategoryForm = (parentId = ""): CategoryFormState => ({
  name: "",
  parentId,
  description: "",
  imageUrl: "",
  sortOrder: 0,
  isActive: true,
});

function AdminCategories({ token, setNotice, onCatalogChanged }: { token: string; setNotice: (value: string) => void; onCatalogChanged: () => Promise<void> }) {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [form, setForm] = useState<CategoryFormState>(() => emptyCategoryForm());
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [categoryImageUploading, setCategoryImageUploading] = useState(false);
  const [categoryPreviewFailed, setCategoryPreviewFailed] = useState(false);

  useEffect(() => { void load(); }, [token]);
  async function load() {
    try {
      setLoading(true);
      const result = await api<{ data: Category[] }>("/admin/categories", { token });
      setCategories(flattenCategories(result.data));
    } catch (caught) {
      setError(friendlyError(caught, "Kategoriler yüklenemedi."));
    } finally {
      setLoading(false);
    }
  }

  function startCreate(parentId = "") {
    setError(null);
    setEditing(null);
    setCategoryPreviewFailed(false);
    setForm(emptyCategoryForm(parentId));
  }

  function startEdit(category: AdminCategory) {
    setError(null);
    setEditing(category);
    setCategoryPreviewFailed(false);
    setForm({
      name: category.name,
      parentId: category.parentId ?? "",
      description: category.description ?? "",
      imageUrl: category.imageUrl ?? "",
      sortOrder: Number(category.sortOrder ?? 0),
      isActive: category.isActive ?? true,
    });
  }

  function descendantIdsOf(categoryId: string) {
    const ids = new Set<string>();
    const visit = (parentId: string) => {
      categories
        .filter((category) => category.parentId === parentId)
        .forEach((child) => {
          ids.add(child.id);
          visit(child.id);
        });
    };
    visit(categoryId);
    return ids;
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const name = form.name.trim();
    if (!name) {
      setError("Kategori adı zorunlu.");
      return;
    }
    if (editing && form.parentId && descendantIdsOf(editing.id).has(form.parentId)) {
      setError("Kategori kendi alt kategorisinin altına alınamaz.");
      return;
    }
    const imageUrl = form.imageUrl.trim() || null;
    setIsSaving(true);
    try {
      if (editing) {
        await api(`/admin/categories/${editing.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({
            name,
            description: form.description.trim() || null,
            imageUrl,
            sortOrder: Number(form.sortOrder),
            isActive: form.isActive,
          }),
        });
        if ((editing.parentId ?? "") !== form.parentId) {
          await api(`/admin/categories/${editing.id}/move`, {
            method: "PATCH",
            token,
            body: JSON.stringify({ parentId: form.parentId || null }),
          });
        }
        setNotice(`${name} kategorisi güncellendi.`);
      } else {
        await api("/admin/categories", {
          method: "POST",
          token,
          body: JSON.stringify({
            name,
            parentId: form.parentId || null,
            description: form.description.trim() || null,
            imageUrl,
            sortOrder: Number(form.sortOrder),
            isActive: form.isActive,
          }),
        });
        setNotice(`${name} kategorisi oluşturuldu.`);
      }
      startCreate();
      await load();
      await onCatalogChanged();
    } catch (caught) {
      setError(friendlyError(caught, editing ? "Kategori güncellenemedi." : "Kategori oluşturulamadı."));
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadCategoryImage(file: File) {
    const contentType = uploadImageContentType(file);
    if (!contentType) {
      setError(unsupportedImageMessage([file]));
      return;
    }
    setError(null);
    setCategoryImageUploading(true);
    try {
      const upload = await api<{ key: string; uploadUrl: string; publicUrl: string }>("/admin/images/upload-url", {
        method: "POST",
        token,
        body: JSON.stringify({ fileName: file.name, contentType }),
      });
      const uploadResponse = await fetch(upload.uploadUrl, { method: "PUT", body: file, headers: { "content-type": contentType } });
      if (!uploadResponse.ok) {
        throw new Error("Resim depoya yüklenemedi. Lütfen dosyayı tekrar seç.");
      }
      setCategoryPreviewFailed(false);
      setForm((current) => ({ ...current, imageUrl: upload.publicUrl }));
      setNotice("Kategori resmi yüklendi. Kaydettiğinde vitrine yansır.");
    } catch (caught) {
      setError(friendlyError(caught, "Kategori resmi yüklenemedi."));
    } finally {
      setCategoryImageUploading(false);
    }
  }

  async function toggleCategory(category: AdminCategory) {
    const nextStatus = !(category.isActive ?? true);
    try {
      await api(`/admin/categories/${category.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          isActive: nextStatus,
        }),
      });
      setNotice(nextStatus ? "Kategori aktif edildi." : "Kategori pasife alındı.");
      await load();
      await onCatalogChanged();
    } catch (caught) {
      setError(friendlyError(caught, "Kategori durumu değiştirilemedi."));
    }
  }

  async function deleteCategory(category: AdminCategory) {
    if (!confirm(`${category.name} kategorisini silmek istiyor musun? Sadece boş kategoriler silinir.`)) return;
    try {
      await api(`/admin/categories/${category.id}`, { method: "DELETE", token });
      setNotice("Kategori silindi.");
      if (editing?.id === category.id) {
        startCreate();
      }
      await load();
      await onCatalogChanged();
    } catch (caught) {
      setError(friendlyError(caught, "Bu kategori silinemedi. Ürün veya alt kategori varsa önce onları taşı."));
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const editingExcludedIds = editing ? new Set([editing.id, ...descendantIdsOf(editing.id)]) : new Set<string>();
  const parentOptions = categories.filter((category) => !editingExcludedIds.has(category.id));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const visibleIds = new Set<string>();
  const addWithAncestors = (category: AdminCategory) => {
    visibleIds.add(category.id);
    let parentId = category.parentId ?? null;
    while (parentId) {
      const parent = categoryById.get(parentId);
      if (!parent || visibleIds.has(parent.id)) break;
      visibleIds.add(parent.id);
      parentId = parent.parentId ?? null;
    }
  };
  const addDescendants = (categoryId: string) => {
    categories
      .filter((category) => category.parentId === categoryId)
      .forEach((child) => {
        visibleIds.add(child.id);
        addDescendants(child.id);
      });
  };

  if (normalizedQuery) {
    categories
      .filter((category) => [category.name, category.slug, category.description].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery)))
      .forEach((category) => {
        addWithAncestors(category);
        addDescendants(category.id);
      });
  } else {
    categories.forEach((category) => visibleIds.add(category.id));
  }

  const visibleCategories = categories.filter((category) => visibleIds.has(category.id));
  const rootCategories = visibleCategories.filter((category) => !category.parentId || !visibleIds.has(category.parentId));
  const childrenOf = (parentId: string) => visibleCategories.filter((category) => category.parentId === parentId);

  function renderCategoryNode(category: AdminCategory) {
    const children = childrenOf(category.id);
    const isEditing = editing?.id === category.id;
    const isMatched = normalizedQuery && [category.name, category.slug, category.description].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
    return (
      <div key={category.id} className={`cat-tree-node ${isEditing ? "cat-tree-active" : ""} ${isMatched ? "cat-tree-match" : ""}`}>
        <div className="cat-tree-item">
            <div className="cat-tree-info">
            <div className="cat-tree-icon">{category.imageUrl ? (
              <img src={category.imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
            ) : children.length ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
            )}</div>
            <div className="cat-tree-text">
              <strong>{category.name}</strong>
              <span className="cat-tree-slug">{category.parentId ? "Alt kategori" : "Ana kategori"} · /{category.slug}</span>
            </div>
          </div>
          <div className="cat-tree-meta">
            <span className={`cat-tree-badge ${category.isActive === false ? "passive" : "active"}`}>
              {category.isActive === false ? "Pasif" : "Aktif"}
            </span>
            {children.length > 0 && <span className="cat-tree-child-count">{children.length} alt</span>}
          </div>
          <div className="cat-tree-actions" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cat-row-action" onClick={() => startEdit(category)}>
              Düzenle
            </button>
            <button type="button" className={`cat-row-action ${category.isActive === false ? "cat-row-action-success" : "cat-row-action-warning"}`} onClick={() => void toggleCategory(category)}>
              {category.isActive === false ? "Aktif et" : "Pasife al"}
            </button>
            <button type="button" className="cat-btn cat-btn-danger" title="Sil" onClick={() => void deleteCategory(category)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>
        {children.length > 0 && (
          <div className="cat-tree-children">
            {children.map((child) => renderCategoryNode(child))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="category-admin-layout">
      <section className="admin-card category-create-card">
        <div className="admin-section-head">
          <div>
            <span>{editing ? "Düzenleme" : "Yeni kayıt"}</span>
            <h2>{editing ? "Kategori düzenle" : "Kategori oluştur"}</h2>
          </div>
          {editing && <button type="button" className="cat-btn-new" onClick={() => startCreate()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Yeni kategori
          </button>}
        </div>
        {error && <p className="admin-error">{error}</p>}
        <form className="admin-form cat-form" onSubmit={submitCategory}>
          <label className="cat-field">
            <span className="cat-field-label">Kategori adı</span>
            <input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Örn. Bahçe Mobilyaları" />
          </label>
          <label className="cat-field">
            <span className="cat-field-label">Bağlı olduğu yer</span>
            <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">Ana kategori olarak göster</option>
              {parentOptions.map((category) => <option value={category.id} key={category.id}>{"  ".repeat(category.depth)}└ {category.name}</option>)}
            </select>
          </label>
          <label className="cat-field">
            <span className="cat-field-label">Açıklama <small>(opsiyonel)</small></span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Vitrinde kullanılacak kısa açıklama" rows={3} />
          </label>
          <div className="cat-image-editor">
            <div className="cat-image-preview">
              {form.imageUrl && !categoryPreviewFailed ? (
                <img src={form.imageUrl} alt="" onError={() => setCategoryPreviewFailed(true)} />
              ) : (
                <span>{categoryPreviewFailed ? "Resim açılamadı" : "Resim yok"}</span>
              )}
            </div>
            <div className="cat-image-controls">
              <p className="cat-image-help">Kategori resmi sadece bilgisayardan yüklenir. PNG, JPG veya WEBP seç.</p>
              <label className="cat-upload-button">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={categoryImageUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void uploadCategoryImage(file);
                  }}
                />
                {categoryImageUploading ? "Yükleniyor..." : "Bilgisayardan resim seç"}
              </label>
              {form.imageUrl && (
                <button
                  type="button"
                  className="cat-clear-image"
                  onClick={() => {
                    setCategoryPreviewFailed(false);
                    setForm((current) => ({ ...current, imageUrl: "" }));
                  }}
                >
                  Resmi kaldır
                </button>
              )}
            </div>
          </div>
          <div className="cat-field cat-toggle-field cat-status-panel">
            <span className="cat-field-label">Durum</span>
            <label className="cat-toggle-label">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              <span className="cat-toggle-switch" />
              <span>{form.isActive ? "Aktif" : "Pasif"}</span>
            </label>
          </div>
          <div className="category-preview">
            <span>Önizleme</span>
            <strong>{form.name.trim() || "Kategori adı"}</strong>
            <small>{form.parentId ? "Seçilen kategorinin altında alt kategori olarak görünecek." : "Üst menü ve ürün filtrelerinde ana kategori olarak görünecek."}</small>
          </div>
          <button className="primary cat-submit-btn" disabled={isSaving}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{editing ? <polyline points="20 6 9 17 4 12"/> : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}</svg>
            {isSaving ? "Kaydediliyor..." : editing ? "Değişiklikleri kaydet" : "Kategori oluştur"}
          </button>
        </form>
      </section>

      <section className="admin-card category-list-card" data-testid="admin-category-tree">
        <div className="admin-section-head">
          <div>
            <span>Kategori ağacı</span>
            <h2>Mevcut Kategoriler</h2>
          </div>
          <b className="cat-count-badge">{visibleCategories.length}</b>
        </div>
        <div className="cat-search-bar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kategori adı veya slug ara..." />
        </div>
        <div className="cat-tree-container">
          {loading && <p className="admin-help" style={{ textAlign: "center", padding: "40px 20px" }}>Kategoriler yükleniyor...</p>}
          {!loading && rootCategories.length === 0 && <p className="admin-help" style={{ textAlign: "center", padding: "40px 20px" }}>Henüz kategori oluşturulmamış veya arama sonucu bulunamadı.</p>}
          {!loading && rootCategories.map((category) => renderCategoryNode(category))}
        </div>
        <p className="cat-tree-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          Alt kategori yapmak için soldaki formda “Bağlı olduğu yer” alanından üst kategori seç.
        </p>
      </section>
    </div>
  );
}

function AdminInventory({ token, setNotice }: { token: string; setNotice: (value: string) => void }) {
  const [stockRows, setStockRows] = useState<Array<Record<string, unknown>>>([]);
  const [lowStock, setLowStock] = useState<Array<Record<string, unknown>>>([]);
  const [movements, setMovements] = useState<Array<Record<string, unknown>>>([]);
  const [stockSearch, setStockSearch] = useState("");
  const [inventoryView, setInventoryView] = useState<"stock" | "low" | "movements">("stock");
  const [stockFilter, setStockFilter] = useState("all");
  const [movementFilter, setMovementFilter] = useState("all");
  const [form, setForm] = useState({ variantId: "", onHand: 25, movementType: "adjustment", quantity: 1, reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"adjust" | "movement">("adjust");
  const [movementPage, setMovementPage] = useState(1);

  useEffect(() => {
    setMovementPage(1);
  }, [stockSearch, movementFilter, inventoryView]);
  useEffect(() => { void load(); }, [token]);
  async function load() {
    const [stock, low, movement] = await Promise.all([
      api<{ data: Array<Record<string, unknown>> }>("/admin/inventory", { token }),
      api<{ data: Array<Record<string, unknown>> }>("/admin/inventory/low-stock", { token }),
      api<{ data: Array<Record<string, unknown>> }>("/admin/inventory/movements", { token }),
    ]);
    setStockRows(stock.data);
    setLowStock(low.data);
    setMovements(movement.data);
  }
  async function setInventory() {
    setError(null);
    try {
      await api("/admin/inventory", { method: "POST", token, body: JSON.stringify({ variantId: form.variantId, onHand: Number(form.onHand), unitType: "piece" }) });
      setNotice(`Mevcut stok ${form.onHand} adet olarak ayarlandı.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stok ayarlanamadı.");
    }
  }
  async function addMovement() {
    setError(null);
    try {
      await api("/admin/inventory/movements", { method: "POST", token, body: JSON.stringify({ variantId: form.variantId, movementType: form.movementType, quantity: Number(form.quantity), reason: form.reason || null }) });
      setNotice(`Stok hareketi kaydedildi: ${Number(form.quantity) > 0 ? "+" : ""}${form.quantity} adet.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stok hareketi kaydedilemedi.");
    }
  }
  const filterText = stockSearch.trim().toLowerCase();
  const filteredStock = stockRows.filter((row) => {
    const matchesSearch = [row.productName, row.sku, row.variantId].some((value) => String(value ?? "").toLowerCase().includes(filterText));
    const available = Number(row.available ?? 0);
    const matchesFilter = stockFilter === "all" || (stockFilter === "available" && available > 0) || (stockFilter === "out" && available <= 0);
    return matchesSearch && matchesFilter;
  });
  const filteredLowStock = lowStock.filter((row) => [row.productName, row.sku, row.variantId].some((value) => String(value ?? "").toLowerCase().includes(filterText)));
  const filteredMovements = movements.filter((row) => {
    const product = stockRows.find((item) => item.variantId === row.variantId);
    const matchesSearch = [product?.productName, product?.sku, row.variantId, row.reason, row.movementType].some((value) => String(value ?? "").toLowerCase().includes(filterText));
    const matchesType = movementFilter === "all" || row.movementType === movementFilter;
    return matchesSearch && matchesType;
  });
  const selectStock = (row: Record<string, unknown>) => setForm({ ...form, variantId: String(row.variantId ?? ""), onHand: Number(row.onHand ?? form.onHand) });
  const selectedProduct = stockRows.find((item) => item.variantId === form.variantId);

  const movementsPerPage = 10;
  const totalMovementPages = Math.ceil(filteredMovements.length / movementsPerPage) || 1;
  const paginatedMovements = filteredMovements.slice((movementPage - 1) * movementsPerPage, movementPage * movementsPerPage);

  return (
    <div className="inventory-workspace admin-two-col">
      {/* Left Column: Form Panel */}
      <section className="admin-card admin-form inventory-panel">
        <div className="admin-section-head">
          <div>
            <span>Stok yönetimi</span>
            <h2>Stok Güncelle</h2>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="inventory-tabs">
          <button
            type="button"
            className={`inventory-tab-btn ${activeTab === "adjust" ? "active" : ""}`}
            onClick={() => setActiveTab("adjust")}
          >
            Stoğu Ayarla
          </button>
          <button
            type="button"
            className={`inventory-tab-btn ${activeTab === "movement" ? "active" : ""}`}
            onClick={() => setActiveTab("movement")}
          >
            Stok Hareketi Ekle
          </button>
        </div>

        {/* Selected Product Summary */}
        {selectedProduct ? (
          <div className="selected-product-preview">
            <span>Seçili Ürün</span>
            <strong>{String(selectedProduct.productName ?? "")}</strong>
            <small>
              SKU: {String(selectedProduct.sku ?? "-")} | Hazır: {Number(selectedProduct.available ?? 0)} adet (Toplam: {Number(selectedProduct.onHand ?? 0)} / Ayrılmış: {Number(selectedProduct.reserved ?? 0)})
            </small>
          </div>
        ) : (
          <div className="selected-product-preview" style={{ borderStyle: "solid", borderColor: "var(--line)" }}>
            <span>Seçili Ürün Yok</span>
            <strong>Lütfen sağdaki tablodan ürün seçin</strong>
            <small>Seçtiğiniz ürünün bilgileri ve stok durumu burada görünecektir.</small>
          </div>
        )}

        {error && <p className="admin-error">{error}</p>}

        {activeTab === "adjust" ? (
          <div className="inventory-form-block">
            <div className="cat-form">
              <label className="cat-field">
                <span className="cat-field-label">Ürün Stok Satırı</span>
                <input
                  required
                  value={form.variantId}
                  onChange={(event) => setForm({ ...form, variantId: event.target.value })}
                  placeholder="Tablodan seçin veya yapıştırın"
                />
              </label>
              <label className="cat-field">
                <span className="cat-field-label">Yeni Fiziksel Stok Adedi</span>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.onHand}
                  onChange={(event) => setForm({ ...form, onHand: Number(event.target.value) })}
                />
              </label>
              <button className="primary cat-submit-btn" style={{ marginTop: "10px" }} onClick={setInventory}>
                Stoğu Ayarla
              </button>
            </div>
          </div>
        ) : (
          <div className="inventory-form-block">
            <div className="cat-form">
              <label className="cat-field">
                <span className="cat-field-label">Ürün Stok Satırı</span>
                <input
                  required
                  value={form.variantId}
                  onChange={(event) => setForm({ ...form, variantId: event.target.value })}
                  placeholder="Tablodan seçin veya yapıştırın"
                />
              </label>
              <div className="cat-field-row">
                <label className="cat-field">
                  <span className="cat-field-label">İşlem Tipi (Movement Type)</span>
                  <select
                    value={form.movementType}
                    onChange={(event) => setForm({ ...form, movementType: event.target.value })}
                  >
                    {["purchase", "sale", "return", "adjustment", "waste", "transfer_in", "transfer_out"].map((item) => (
                      <option key={item} value={item}>
                        {labelFor(item, movementLabels)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cat-field">
                  <span className="cat-field-label">Adet</span>
                  <input
                    type="number"
                    required
                    value={form.quantity}
                    onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })}
                    placeholder="+10 / -2"
                  />
                </label>
              </div>
              <label className="cat-field">
                <span className="cat-field-label">Gerekçe / Açıklama (Reason)</span>
                <input
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                  placeholder="Örn: Satın alma faturası, fire veya düzenleme"
                />
              </label>
              <button className="primary cat-submit-btn" style={{ marginTop: "10px" }} onClick={addMovement}>
                Hareketi Kaydet
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Right Column: List Panel */}
      <section className="admin-card inventory-summary">
        <div className="admin-section-head">
          <div>
            <span>Liste görünümü</span>
            <h2>Stok Kayıtları</h2>
          </div>
          <input
            className="admin-search-input"
            value={stockSearch}
            onChange={(event) => setStockSearch(event.target.value)}
            placeholder="Ürün, SKU veya stok kodu ara..."
          />
        </div>

        {/* Tab Controls for Lists */}
        <div className="inventory-list-tabs">
          <button
            type="button"
            className={`list-tab-btn ${inventoryView === "stock" ? "active" : ""}`}
            onClick={() => setInventoryView("stock")}
          >
            Ürün Stokları
          </button>
          <button
            type="button"
            className={`list-tab-btn ${inventoryView === "low" ? "active" : ""}`}
            onClick={() => setInventoryView("low")}
          >
            Düşük Stok
          </button>
          <button
            type="button"
            className={`list-tab-btn ${inventoryView === "movements" ? "active" : ""}`}
            onClick={() => setInventoryView("movements")}
          >
            Son Hareketler
          </button>
        </div>

        {/* Filters bar */}
        <div className="inventory-filter-bar" style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
          {inventoryView === "stock" && (
            <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
              <option value="all">Tüm stoklar</option>
              <option value="available">Stokta olanlar</option>
              <option value="out">Tükenenler</option>
            </select>
          )}
          {inventoryView === "movements" && (
            <select value={movementFilter} onChange={(event) => setMovementFilter(event.target.value)}>
              <option value="all">Tüm hareketler</option>
              {Object.entries(movementLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </div>

        {inventoryView === "stock" && (
          <InventoryTable title="Ürün stokları" rows={filteredStock} onSelect={selectStock} selectedVariantId={form.variantId} />
        )}
        {inventoryView === "low" && (
          <InventoryTable title="Düşük stok listesi" rows={filteredLowStock} onSelect={selectStock} selectedVariantId={form.variantId} />
        )}
        {inventoryView === "movements" && (
          <div className="inventory-table-block">
            <div className="ops-table inventory-movement-table">
              <div className="ops-table-header">
                <span>Ürün</span>
                <span>İşlem</span>
                <span>Adet</span>
                <span>Tarih</span>
              </div>
              {paginatedMovements.map((row) => {
                const product = stockRows.find((item) => item.variantId === row.variantId);
                const isSelected = form.variantId === row.variantId;
                return (
                  <button
                    className={`ops-table-row ${isSelected ? "active-row" : ""}`}
                    key={String(row.id)}
                    onClick={() => product && selectStock(product)}
                  >
                    <span>
                      <b>{String(product?.productName ?? "Ürün")}</b>
                      <small>{String(product?.sku ?? row.variantId ?? "")}</small>
                    </span>
                    <span>
                      {labelFor(String(row.movementType ?? ""), movementLabels)}
                      <small>{String(row.reason ?? "Açıklama yok")}</small>
                    </span>
                    <strong>
                      {Number(row.quantity ?? 0) > 0 ? "+" : ""}
                      {Number(row.quantity ?? 0)} adet
                    </strong>
                    <em>{row.createdAt ? new Date(String(row.createdAt)).toLocaleString("tr-TR") : "-"}</em>
                  </button>
                );
              })}
            </div>
            <AdminPagination
              currentPage={movementPage}
              totalPages={totalMovementPages}
              onPageChange={setMovementPage}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function InventoryTable({
  title,
  rows,
  onSelect,
  selectedVariantId,
  compact,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  onSelect: (row: Record<string, unknown>) => void;
  selectedVariantId?: string;
  compact?: boolean;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(rows.length / itemsPerPage) || 1;

  useEffect(() => {
    setCurrentPage(1);
  }, [rows.length]);

  const paginatedRows = rows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="inventory-table-block">
      <div className="inventory-table-head">
        <h3>{title}</h3>
        <span>{rows.length} ürün</span>
      </div>
      <div className={`ops-table ${compact ? "compact" : ""}`}>
        <div className="ops-table-header">
          <span>Ürün</span>
          <span>SKU</span>
          <span>Hazır</span>
          <span>Toplam / Ayrılmış</span>
        </div>
        {paginatedRows.map((row) => {
          const isSelected = selectedVariantId === row.variantId;
          return (
            <button
              className={`ops-table-row ${isSelected ? "active-row" : ""}`}
              key={String(row.id)}
              onClick={() => onSelect(row)}
            >
              <span>
                <b>{String(row.productName ?? "Ürün")}</b>
                <small>{String(row.variantId ?? "")}</small>
              </span>
              <span>{String(row.sku ?? "-")}</span>
              <strong>{Number(row.available ?? 0)} hazır</strong>
              <em>
                Toplam {Number(row.onHand ?? 0)} / Ayrılmış {Number(row.reserved ?? 0)}
              </em>
            </button>
          );
        })}
      </div>
      <AdminPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

function AdminOrders({ token, setNotice }: { token: string; setNotice: (value: string) => void }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [tracking, setTracking] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [orderSearch, statusFilter]);
  useEffect(() => { void load(); }, [token]);
  async function load() { setOrders((await api<{ data: AdminOrder[] }>("/admin/orders", { token })).data); }
  async function open(id: string) {
    const result = await api<{ data: AdminOrderDetail }>(`/admin/orders/${id}`, { token });
    setDetail(result.data);
    setNote(result.data.internalNote ?? "");
    const trackingResult = await api<{ data: Record<string, unknown> }>(`/admin/orders/${id}/tracking`, { token }).catch(() => ({ data: null as unknown as Record<string, unknown> }));
    setTracking(trackingResult.data);
  }
  async function transition(to: string) { if (!detail) return; await api(`/admin/orders/${detail.id}/transition`, { method: "POST", token, body: JSON.stringify({ to, reason: "admin_panel" }) }); setNotice("Sipariş durumu güncellendi."); await open(detail.id); await load(); }
  async function shipment() { if (!detail) return; await api(`/admin/orders/${detail.id}/shipments`, { method: "POST", token, body: JSON.stringify({ carrierCode: detail.carrierCode ?? "aras" }) }); setNotice("Kargo kaydı oluşturuldu."); await open(detail.id); await load(); }
  async function saveNote() { if (!detail) return; await api(`/admin/orders/${detail.id}/note`, { method: "PATCH", token, body: JSON.stringify({ internalNote: note }) }); setNotice("Not kaydedildi."); }
  const filterText = orderSearch.trim().toLowerCase();
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    const haystack = [order.orderNumber, order.status, orderProductSummary(order), orderCustomerName(order), order.customer?.phone].map((value) => String(value ?? "").toLowerCase());
    return matchesStatus && haystack.some((value) => value.includes(filterText));
  });
  const nextStatuses = detail ? orderTransitions[detail.status] ?? [] : [];

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return <div className="order-workspace"><section className="admin-card admin-table order-list-panel"><div className="admin-section-head"><div><span>Operasyon listesi</span><h2>Siparişler</h2></div><b>{filteredOrders.length}</b></div><div className="admin-list-toolbar"><input className="admin-search-input" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Sipariş no, ürün, müşteri veya telefon ara" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tüm durumlar</option>{Object.entries(orderStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="ops-table order-ops-table"><div className="ops-table-header"><span>Sipariş</span><span>Ürün</span><span>Müşteri</span><span>Tutar</span><span>Durum</span></div>{paginatedOrders.map((order) => <button className="ops-table-row" key={order.id} onClick={() => void open(order.id)}><span><b>{order.orderNumber}</b><small>{new Date(order.createdAt).toLocaleString("tr-TR")}</small></span><span>{orderProductSummary(order)}<small>{order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0} adet</small></span><span>{orderCustomerName(order)}<small>{order.customer?.phone ?? "Telefon yok"}</small></span><strong>{formatTry(order.totalCents)}</strong><em>{labelFor(order.status, orderStatusLabels)}</em></button>)}</div><AdminPagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} /></section><section className="admin-card order-detail-card">{detail ? <div className="admin-form order-detail-panel"><div className="admin-section-head"><div><span>Sipariş detayı</span><h2>{detail.orderNumber}</h2></div><em>{labelFor(detail.status, orderStatusLabels)}</em></div><div className="order-detail-grid"><div><div className="order-summary-grid"><article><span>Toplam</span><strong>{formatTry(detail.totalCents)}</strong></article><article><span>Ara toplam</span><strong>{formatTry(detail.subtotalCents ?? 0)}</strong></article><article><span>İndirim</span><strong>{formatTry(detail.discountCents ?? 0)}</strong></article><article><span>Kargo</span><strong>{formatTry(detail.shippingCents ?? 0)}</strong></article></div><div className="order-info-list"><p><b>Müşteri:</b> {orderCustomerName(detail)} / {detail.customer?.phone ?? "Telefon yok"}</p><p><b>Kargo firması:</b> {detail.carrierCode ?? "Seçilmedi"}</p><p><b>Kupon:</b> {detail.couponCode ?? "Yok"}</p><p><b>Adres:</b> {addressLine(detail.shippingAddress)}</p><p><b>Müşteri notu:</b> {detail.customerNote ?? "Yok"}</p><p><b>Ödeme:</b> {detail.payment ? `${detail.payment.provider} / ${detail.payment.status} / ${formatTry(detail.payment.amountCents)}` : "Ödeme kaydı yok"}</p>{tracking && <p><b>Takip:</b> {String(tracking.trackingNumber ?? tracking.status ?? "Kargo takip kaydı var")}</p>}</div></div><div><h3>Ürünler</h3><div className="order-item-list">{detail.items?.map((item) => <article key={item.id}><span><b>{item.productSnapshot.name ?? "Ürün"}</b><small>{item.variantSnapshot?.sku ?? item.productSnapshot.sku ?? ""}</small></span><strong>{item.quantity} adet</strong><em>{formatTry(item.totalCents)}</em></article>)}</div><h3>Durum değiştir</h3><div className="admin-row">{nextStatuses.map((status) => <button key={status} onClick={() => void transition(status)}>{labelFor(status, orderStatusLabels)}</button>)}{!nextStatuses.length && <span className="admin-help">Bu sipariş için sıradaki durum aksiyonu yok.</span>}</div><button onClick={shipment}>Kargo oluştur / takip başlat</button><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Operasyon notu" /><button className="primary" onClick={saveNote}>Notu kaydet</button></div></div></div> : <div className="admin-empty"><b>Sipariş seç</b><p>Listeden bir sipariş seçince detay, müşteri, ürünler ve durum aksiyonları burada açılır.</p></div>}</section></div>;
}

function AdminReturns({ token, setNotice }: { token: string; setNotice: (value: string) => void }) {
  const [returns, setReturns] = useState<AdminReturn[]>([]);
  const [detail, setDetail] = useState<AdminReturnDetail | null>(null);
  const [returnSearch, setReturnSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [returnSearch, statusFilter]);
  const [adminNote, setAdminNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [receiveItems, setReceiveItems] = useState<Array<{ returnItemId: string; itemCondition: string; restockEligible: boolean }>>([]);
  useEffect(() => { void load(); }, [token]);
  async function load() { setReturns((await api<{ data: AdminReturn[] }>("/admin/returns", { token })).data); }
  async function open(id: string) {
    const result = (await api<{ data: AdminReturnDetail }>(`/admin/returns/${id}`, { token })).data;
    setDetail(result);
    setAdminNote(result.adminNote ?? "");
    setRejectReason(result.rejectedReason ?? "");
    setReceiveItems((result.items ?? []).map((item) => ({
      returnItemId: item.id,
      itemCondition: item.itemCondition ?? "unopened",
      restockEligible: item.restockEligible ?? true,
    })));
  }
  async function approve() {
    if (!detail) return;
    await api(`/admin/returns/${detail.id}/approve`, { method: "POST", token, body: JSON.stringify({ adminNote: adminNote || null }) });
    setNotice("İade onaylandı. Geri gönderim süreci başlatıldı.");
    await open(detail.id);
    await load();
  }
  async function reject() {
    if (!detail || rejectReason.trim().length < 3) return;
    await api(`/admin/returns/${detail.id}/reject`, { method: "POST", token, body: JSON.stringify({ rejectedReason: rejectReason.trim() }) });
    setNotice("İade reddedildi.");
    await open(detail.id);
    await load();
  }
  async function receive() {
    if (!detail) return;
    await api(`/admin/returns/${detail.id}/receive`, { method: "POST", token, body: JSON.stringify({ items: receiveItems }) });
    setNotice("İade teslim alındı ve ödeme iadesi kuyruğa alındı.");
    await open(detail.id);
    await load();
  }
  function updateReceiveItem(returnItemId: string, patch: Partial<{ itemCondition: string; restockEligible: boolean }>) {
    setReceiveItems((current) => current.map((item) => item.returnItemId === returnItemId ? { ...item, ...patch } : item));
  }
  const canApprove = detail?.status === "requested";
  const canReject = detail?.status === "requested";
  const canReceive = detail?.status === "approved" || detail?.status === "in_transit";
  const returnFilterText = returnSearch.trim().toLowerCase();
  const filteredReturns = returns.filter((record) => {
    const matchesStatus = statusFilter === "all" || record.status === statusFilter;
    const matchesSearch = [record.returnNumber, record.reason, record.status].some((value) => String(value ?? "").toLowerCase().includes(returnFilterText));
    return matchesStatus && matchesSearch;
  });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage) || 1;
  const paginatedReturns = filteredReturns.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return <div className="admin-two-col"><section className="admin-card admin-table return-list-panel"><div className="admin-section-head"><div><span>İade talepleri</span><h2>İadeler</h2></div><b>{filteredReturns.length}</b></div><div className="admin-list-toolbar"><input className="admin-search-input" value={returnSearch} onChange={(event) => setReturnSearch(event.target.value)} placeholder="İade no, sebep veya durum ara" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tüm durumlar</option>{Object.entries(returnStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="ops-table return-ops-table"><div className="ops-table-header"><span>İade no</span><span>Sebep</span><span>Tutar</span><span>Durum</span></div>{paginatedReturns.map((record) => <button className="ops-table-row" key={record.id} onClick={() => void open(record.id)}><span><b>{record.returnNumber}</b><small>{new Date(record.requestedAt).toLocaleString("tr-TR")}</small></span><span>{labelFor(record.reason, returnReasonLabels)}</span><strong>{formatTry(record.refundAmountCents ?? 0)}</strong><em>{labelFor(record.status, returnStatusLabels)}</em></button>)}</div><AdminPagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} /></section><section className="admin-card">{detail ? <div className="admin-form return-admin-panel"><div className="admin-section-head"><div><span>{labelFor(detail.reason, returnReasonLabels)}</span><h2>{detail.returnNumber}</h2></div><em className="return-status-pill">{labelFor(detail.status, returnStatusLabels)}</em></div><div className="order-summary-grid"><article><span>İade tutarı</span><strong>{formatTry(detail.refundAmountCents ?? 0)}</strong></article><article><span>Geri kargo</span><strong>{detail.returnShippingPaidBy === "seller" ? "Satıcı öder" : "Müşteri öder"}</strong></article><article><span>Talep tarihi</span><strong>{new Date(detail.requestedAt).toLocaleDateString("tr-TR")}</strong></article><article><span>Takip</span><strong>{detail.returnTrackingNumber ?? "Bekliyor"}</strong></article></div><div className="order-info-list"><p><b>Müşteri notu:</b> {detail.customerNote ?? "Yok"}</p><p><b>Admin notu:</b> {detail.adminNote ?? "Yok"}</p>{detail.rejectedReason && <p><b>Red sebebi:</b> {detail.rejectedReason}</p>}<p><b>Onay:</b> {detail.approvedAt ? new Date(detail.approvedAt).toLocaleString("tr-TR") : "Yok"}</p><p><b>Teslim alma:</b> {detail.receivedAt ? new Date(detail.receivedAt).toLocaleString("tr-TR") : "Yok"}</p><p><b>Ödeme iadesi:</b> {detail.refundedAt ? new Date(detail.refundedAt).toLocaleString("tr-TR") : "Bekliyor"}</p></div><h3>İade edilen ürünler</h3><div className="return-item-list">{detail.items?.map((item) => { const receiveItem = receiveItems.find((entry) => entry.returnItemId === item.id); return <article key={item.id}><span><b>{item.quantity} adet</b><small>{formatTry(item.unitRefundCents * item.quantity)}</small></span><select value={receiveItem?.itemCondition ?? "unopened"} onChange={(event) => updateReceiveItem(item.id, { itemCondition: event.target.value, restockEligible: !["damaged", "missing"].includes(event.target.value) })} disabled={!canReceive}>{Object.entries(returnConditionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><label><input type="checkbox" checked={receiveItem?.restockEligible ?? true} onChange={(event) => updateReceiveItem(item.id, { restockEligible: event.target.checked })} disabled={!canReceive} /> Stoka alınır</label></article>; })}</div>{canApprove && <textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder="Onay notu, örn. kargo kodu veya kontrol açıklaması" />}{canReject && <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Red sebebi, müşteriye anlaşılır şekilde yaz" />}
  <div className="admin-row">{canApprove && <button onClick={approve}>Onayla</button>}{canReject && <button onClick={reject} disabled={rejectReason.trim().length < 3}>Reddet</button>}{canReceive && <button className="primary" onClick={receive}>Teslim al ve iade sürecini başlat</button>}{!canApprove && !canReject && !canReceive && <span className="admin-help">Bu iade için bekleyen operasyon yok.</span>}</div>{!!detail.history?.length && <div className="return-timeline">{detail.history.map((item) => <p key={item.id}><b>{labelFor(item.toStatus, returnStatusLabels)}</b><span>{new Date(item.changedAt).toLocaleString("tr-TR")}</span></p>)}</div>}</div> : <div className="admin-empty"><b>İade seç</b><p>Talep sebebi, ücret, ürün durumu ve stok kararı burada yönetilir.</p></div>}</section></div>;
}

function AdminCoupons({ token, setNotice }: { token: string; setNotice: (value: string) => void }) {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [couponSearch, setCouponSearch] = useState("");
  const [couponFilter, setCouponFilter] = useState<"all" | "active" | "scheduled" | "expired" | "passive">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [isFormMode, setIsFormMode] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    discountType: "percent",
    discountValue: 10,
    minSubtotalTl: 0,
    maxDiscountTl: 0,
    usageLimit: "",
    perCustomerLimit: "",
    startsAt: "",
    endsAt: "",
    isActive: true,
  });
  useEffect(() => { void load(); }, [token]);
  useEffect(() => { setCurrentPage(1); }, [couponSearch, couponFilter]);

  async function load() {
    const result = await api<{ data: AdminCoupon[] }>("/admin/coupons", { token });
    setCoupons(result.data);
    setSelectedCouponId((current) => current ?? result.data[0]?.id ?? null);
  }

  function couponState(coupon: AdminCoupon) {
    const now = Date.now();
    if (!coupon.isActive) return "passive";
    if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return "scheduled";
    if (coupon.endsAt && new Date(coupon.endsAt).getTime() < now) return "expired";
    return "active";
  }

  function couponStateLabel(coupon: AdminCoupon) {
    const state = couponState(coupon);
    if (state === "active") return "Aktif";
    if (state === "scheduled") return "Planlandı";
    if (state === "expired") return "Süresi bitti";
    return "Pasif";
  }

  function couponDiscountLabel(coupon: AdminCoupon) {
    return coupon.discountType === "percent" ? `%${coupon.discountValue}` : formatTry(coupon.discountValue);
  }

  function datetimeLocalValue(value: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function resetCouponForm() {
    setEditingCouponId(null);
    setForm({ code: "", name: "", description: "", discountType: "percent", discountValue: 10, minSubtotalTl: 0, maxDiscountTl: 0, usageLimit: "", perCustomerLimit: "", startsAt: "", endsAt: "", isActive: true });
  }

  function handleNewCoupon() {
    resetCouponForm();
    setIsFormMode(true);
  }

  function cancelEdit() {
    resetCouponForm();
    setIsFormMode(false);
  }

  function editCoupon(coupon: AdminCoupon) {
    setEditingCouponId(coupon.id);
    setForm({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description ?? "",
      discountType: coupon.discountType,
      discountValue: coupon.discountType === "percent" ? coupon.discountValue : coupon.discountValue / 100,
      minSubtotalTl: coupon.minSubtotalCents / 100,
      maxDiscountTl: coupon.maxDiscountCents ? coupon.maxDiscountCents / 100 : 0,
      usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : "",
      perCustomerLimit: coupon.perCustomerLimit ? String(coupon.perCustomerLimit) : "",
      startsAt: datetimeLocalValue(coupon.startsAt),
      endsAt: datetimeLocalValue(coupon.endsAt),
      isActive: coupon.isActive,
    });
    setIsFormMode(true);
  }

  function couponPayload() {
    return {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        discountType: form.discountType,
        discountValue: form.discountType === "percent" ? Number(form.discountValue) : Math.round(Number(form.discountValue) * 100),
        minSubtotalCents: Math.round(Number(form.minSubtotalTl) * 100),
        maxDiscountCents: form.discountType === "percent" && Number(form.maxDiscountTl) > 0 ? Math.round(Number(form.maxDiscountTl) * 100) : null,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        isActive: form.isActive,
    };
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ data: AdminCoupon }>(editingCouponId ? `/admin/coupons/${editingCouponId}` : "/admin/coupons", {
        method: editingCouponId ? "PATCH" : "POST",
        token,
        body: JSON.stringify(couponPayload()),
      });
      setNotice(editingCouponId ? "Kupon güncellendi." : "Kupon oluşturuldu.");
      setSelectedCouponId(result.data.id);
      resetCouponForm();
      setIsFormMode(false);
      await load();
    } catch (caught) {
      setError(friendlyError(caught, "Kupon kaydedilemedi. Alanları kontrol edip tekrar dene."));
    }
  }

  async function toggleCoupon(coupon: AdminCoupon) {
    const result = await api<{ data: AdminCoupon }>(`/admin/coupons/${coupon.id}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ isActive: !coupon.isActive }),
    });
    setSelectedCouponId(result.data.id);
    setNotice(result.data.isActive ? "Kupon aktif edildi." : "Kupon pasife alındı.");
    await load();
  }

  async function deleteCoupon(coupon: AdminCoupon) {
    const result = await api<{ data: { deleted: boolean; deactivated: boolean } }>(`/admin/coupons/${coupon.id}`, {
      method: "DELETE",
      token,
    });
    setNotice(result.data.deleted ? "Kupon silindi." : "Kupon kullanıldığı için silinmedi, pasife alındı.");
    setSelectedCouponId(null);
    if (editingCouponId === coupon.id) {
      resetCouponForm();
      setIsFormMode(false);
    }
    await load();
  }

  const query = couponSearch.trim().toLocaleLowerCase("tr-TR");
  const filteredCoupons = coupons.filter((coupon) => {
    const matchesSearch = !query || `${coupon.code} ${coupon.name} ${coupon.description ?? ""}`.toLocaleLowerCase("tr-TR").includes(query);
    const matchesFilter = couponFilter === "all" || couponState(coupon) === couponFilter;
    return matchesSearch && matchesFilter;
  });
  const pageSize = 8;
  const totalPages = Math.ceil(filteredCoupons.length / pageSize) || 1;
  const paginatedCoupons = filteredCoupons.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedCoupon = coupons.find((coupon) => coupon.id === selectedCouponId) ?? filteredCoupons[0] ?? null;
  const activeCount = coupons.filter((coupon) => couponState(coupon) === "active").length;
  const scheduledCount = coupons.filter((coupon) => couponState(coupon) === "scheduled").length;
  const expiredCount = coupons.filter((coupon) => couponState(coupon) === "expired").length;

  return (
    <div className="coupon-workspace">
      <section className="admin-card coupon-list-panel">
        <div className="admin-section-head">
          <div><span>Kampanya yönetimi</span><h2>Kuponlar</h2></div>
          <div className="coupon-header-actions">
            <button className="coupon-new-btn" type="button" onClick={handleNewCoupon}>+ Yeni Kupon</button>
            <b>{filteredCoupons.length}</b>
          </div>
        </div>
        <div className="coupon-metrics">
          <article><span>Aktif</span><strong>{activeCount}</strong></article>
          <article><span>Planlı</span><strong>{scheduledCount}</strong></article>
          <article><span>Süresi biten</span><strong>{expiredCount}</strong></article>
        </div>
        <div className="admin-list-toolbar">
          <input className="admin-search-input" value={couponSearch} onChange={(event) => setCouponSearch(event.target.value)} placeholder="Kod, ad veya açıklama ara" />
          <select value={couponFilter} onChange={(event) => setCouponFilter(event.target.value as typeof couponFilter)}>
            <option value="all">Tüm kuponlar</option>
            <option value="active">Aktif</option>
            <option value="scheduled">Planlandı</option>
            <option value="expired">Süresi bitti</option>
            <option value="passive">Pasif</option>
          </select>
        </div>
        <div className="ops-table coupon-table">
          <div className="ops-table-header"><span>Kupon</span><span>İndirim</span><span>Limit</span><span>Durum</span></div>
          {paginatedCoupons.map((coupon) => (
            <button className={`ops-table-row ${selectedCoupon?.id === coupon.id ? "selected-row" : ""}`} key={coupon.id} onClick={() => { setSelectedCouponId(coupon.id); setIsFormMode(false); }} type="button">
              <span><b>{coupon.code}</b><small>{coupon.name}</small></span>
              <strong>{couponDiscountLabel(coupon)}</strong>
              <span>{coupon.minSubtotalCents > 0 ? `${formatTry(coupon.minSubtotalCents)} üzeri` : "Alt limitsiz"}<small>{coupon.usageLimit ? `${coupon.usageLimit} toplam kullanım` : "Kullanım limiti yok"}</small></span>
              <em className={`coupon-status coupon-status-${couponState(coupon)}`}>{couponStateLabel(coupon)}</em>
            </button>
          ))}
          {!paginatedCoupons.length && <p className="admin-help">Bu filtreye uygun kupon yok.</p>}
        </div>
        <AdminPagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </section>

      <section className="admin-card coupon-detail-panel">
        {isFormMode ? (
          <form className="admin-form coupon-form" onSubmit={create}>
            <div className="admin-section-head">
              <div><span>{editingCouponId ? "Kampanya Düzenle" : "Yeni Kampanya"}</span><h2>{editingCouponId ? "Kuponu Güncelle" : "Kupon Oluştur"}</h2></div>
              <button type="button" className="coupon-cancel-header-btn" onClick={cancelEdit}>Vazgeç</button>
            </div>
            {error && <p className="admin-error">{error}</p>}
            
            <fieldset className="coupon-form-section">
              <legend>Genel Bilgiler</legend>
              <div className="coupon-form-grid">
                <label className="cat-field"><span className="cat-field-label">Kupon kodu</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="BAHCE25" required /></label>
                <label className="cat-field"><span className="cat-field-label">Kupon adı</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Bahar kampanyası" required /></label>
                <label className="cat-field cat-field-wide"><span className="cat-field-label">Açıklama</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Kampanya koşullarını kısa ve net yazın." /></label>
              </div>
            </fieldset>

            <fieldset className="coupon-form-section">
              <legend>İndirim & Sepet Koşulları</legend>
              <div className="coupon-form-grid">
                <label className="cat-field"><span className="cat-field-label">İndirim tipi</span><select value={form.discountType} onChange={(event) => setForm({ ...form, discountType: event.target.value })}><option value="percent">Yüzde indirim (%)</option><option value="fixed">Sabit TL indirim</option></select></label>
                <label className="cat-field"><span className="cat-field-label">{form.discountType === "percent" ? "İndirim yüzdesi" : "İndirim tutarı (TL)"}</span><input type="number" min={1} max={form.discountType === "percent" ? 100 : undefined} value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: Number(event.target.value) })} required /></label>
                <label className="cat-field"><span className="cat-field-label">Minimum sepet (TL)</span><input type="number" min={0} value={form.minSubtotalTl} onChange={(event) => setForm({ ...form, minSubtotalTl: Number(event.target.value) })} /></label>
                <label className="cat-field"><span className="cat-field-label">Maks. indirim (TL)</span><input type="number" min={0} disabled={form.discountType !== "percent"} value={form.maxDiscountTl} onChange={(event) => setForm({ ...form, maxDiscountTl: Number(event.target.value) })} placeholder={form.discountType !== "percent" ? "Yüzde indirimde geçerli" : "Limit yok"} /></label>
              </div>
            </fieldset>

            <fieldset className="coupon-form-section">
              <legend>Limitler & Geçerlilik</legend>
              <div className="coupon-form-grid">
                <label className="cat-field"><span className="cat-field-label">Toplam kullanım limiti</span><input type="number" min={1} value={form.usageLimit} onChange={(event) => setForm({ ...form, usageLimit: event.target.value })} placeholder="Boşsa sınırsız" /></label>
                <label className="cat-field"><span className="cat-field-label">Müşteri başı limit</span><input type="number" min={1} value={form.perCustomerLimit} onChange={(event) => setForm({ ...form, perCustomerLimit: event.target.value })} placeholder="Boşsa sınırsız" /></label>
                <label className="cat-field"><span className="cat-field-label">Başlangıç tarihi</span><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
                <label className="cat-field"><span className="cat-field-label">Bitiş tarihi</span><input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
              </div>
            </fieldset>

            <div className="coupon-form-footer">
              <label className="admin-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Kupon aktif olarak kullanılabilsin</label>
              <div className="coupon-form-buttons">
                <button type="button" className="coupon-secondary-btn" onClick={cancelEdit}>Vazgeç</button>
                <button className="primary" type="submit">{editingCouponId ? "Kuponu Güncelle" : "Kupon Oluştur"}</button>
              </div>
            </div>
          </form>
        ) : selectedCoupon ? (
          <div className="admin-form coupon-view-workspace">
            <div className="admin-section-head">
              <div><span>Kupon detayı</span><h2>{selectedCoupon.code}</h2></div>
              <em className={`coupon-status coupon-status-${couponState(selectedCoupon)}`}>{couponStateLabel(selectedCoupon)}</em>
            </div>

            <div className={`coupon-ticket-container theme-${couponState(selectedCoupon)}`}>
              <div className="coupon-ticket">
                <div className="coupon-ticket-notch coupon-ticket-notch-left"></div>
                <div className="coupon-ticket-notch coupon-ticket-notch-right"></div>
                <div className="coupon-ticket-main">
                  <div className="coupon-ticket-icon-circle">🎟️</div>
                  <div className="coupon-ticket-content">
                    <span className="coupon-ticket-name">{selectedCoupon.name}</span>
                    <h3 className="coupon-ticket-discount">{couponDiscountLabel(selectedCoupon)} İNDİRİM</h3>
                    {selectedCoupon.description && <p className="coupon-ticket-desc">{selectedCoupon.description}</p>}
                  </div>
                </div>
                <div className="coupon-ticket-divider"></div>
                <div className="coupon-ticket-footer">
                  <div className="coupon-ticket-code-label">KAMPANYA KODU</div>
                  <div className="coupon-ticket-code-val">{selectedCoupon.code}</div>
                </div>
              </div>
            </div>

            <div className="coupon-detail-grid">
              <article><span>Min. sepet</span><strong>{selectedCoupon.minSubtotalCents > 0 ? formatTry(selectedCoupon.minSubtotalCents) : "Alt limitsiz"}</strong></article>
              <article><span>Maks. indirim</span><strong>{selectedCoupon.maxDiscountCents ? formatTry(selectedCoupon.maxDiscountCents) : "Sınırsız"}</strong></article>
              <article><span>Kullanım limiti</span><strong>{selectedCoupon.usageLimit ?? "Sınırsız"}</strong></article>
              <article><span>Müşteri limiti</span><strong>{selectedCoupon.perCustomerLimit ? `${selectedCoupon.perCustomerLimit} adet` : "Sınırsız"}</strong></article>
            </div>
            
            <div className="order-info-list coupon-info-list">
              <p><b>Başlangıç:</b> {selectedCoupon.startsAt ? new Date(selectedCoupon.startsAt).toLocaleString("tr-TR") : "Hemen"}</p>
              <p><b>Bitiş:</b> {selectedCoupon.endsAt ? new Date(selectedCoupon.endsAt).toLocaleString("tr-TR") : "Süresiz"}</p>
              <p><b>Son güncelleme:</b> {new Date(selectedCoupon.updatedAt).toLocaleString("tr-TR")}</p>
            </div>
            <div className="coupon-action-row">
              <button type="button" className="coupon-edit-action-btn" onClick={() => editCoupon(selectedCoupon)}>Düzenle</button>
              <button type="button" className="coupon-toggle-action-btn" onClick={() => void toggleCoupon(selectedCoupon)}>{selectedCoupon.isActive ? "Pasife al" : "Aktif et"}</button>
              <button type="button" className="danger-soft" onClick={() => void deleteCoupon(selectedCoupon)}>Sil / pasife çek</button>
            </div>
          </div>
        ) : (
          <div className="admin-empty">
            <b>Kupon seçin</b>
            <p>Listeden bir kupon seçerek koşullar ve kampanya detaylarını görüntüleyin veya düzenleyin.</p>
            <button type="button" className="primary" style={{ marginTop: "12px" }} onClick={handleNewCoupon}>Yeni Kupon Oluştur</button>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ title, value, text, tone }: { title: string; value: number; text: string; tone?: "blue" | "gold" | "red" | "green" }) {
  return <article className={`admin-metric ${tone ? `admin-metric-${tone}` : ""}`}><span>{title}</span><strong>{value}</strong><small>{text}</small></article>;
}

function flattenCategories(items: Category[], depth = 0): AdminCategory[] {
  return items
    .slice()
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
    .flatMap((item) => [{ ...item, depth }, ...flattenCategories(item.children ?? [], depth + 1)]);
}
