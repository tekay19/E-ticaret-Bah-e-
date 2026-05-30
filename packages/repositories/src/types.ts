import type { UserRole } from "@bahce-shop/shared";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  emailVerifiedAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerRecord = {
  id: string;
  userId: string;
  fullName: string;
  phone: string | null;
  defaultAddressId: string | null;
  createdAt: string;
};

export type AddressRecord = {
  id: string;
  customerId: string;
  title: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  postalCode: string | null;
  addressLine: string;
  createdAt: string;
  updatedAt: string;
};

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type SingleUseTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
};

export type BrandRecord = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
};

export type CategoryRecord = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CategoryTreeNode = CategoryRecord & {
  children: CategoryTreeNode[];
};

export type ProductRecord = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  brandId: string | null;
  categoryId: string;
  weightKg: string | null;
  volumeDesi: string | null;
  dimensionsLwh: Record<string, unknown> | null;
  material: string | null;
  usageArea: string[] | null;
  seasonTags: string[] | null;
  isHazardous: boolean;
  msdsPdfUrl: string | null;
  warrantyMonths: number | null;
  isReturnable: boolean;
  returnRules: Record<string, unknown> | null;
  isActive: boolean;
  minStockAlert: number;
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductVariantRecord = {
  id: string;
  productId: string;
  sku: string;
  options: Record<string, unknown>;
  priceCents: number;
  compareAtPriceCents: number | null;
  costCents: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductImageRecord = {
  id: string;
  productId: string;
  url: string;
  thumbnailUrl: string | null;
  webpUrl: string | null;
  altText: string | null;
  sortOrder: number;
  createdAt: string;
};

export type ProductWithRelations = ProductRecord & {
  brand: BrandRecord | null;
  category: CategoryRecord | null;
  variants: ProductVariantRecord[];
  images: ProductImageRecord[];
};

export type ProductStockSummary = {
  variantId: string;
  available: number;
  onHand: number;
  reserved: number;
};

export type ProductReviewRecord = {
  id: string;
  productId: string;
  customerId: string;
  customerName: string;
  rating: number;
  title: string | null;
  comment: string;
  status: "published" | "hidden";
  createdAt: string;
  updatedAt: string;
};

export type ProductReviewSummary = {
  averageRating: number;
  total: number;
};

export type ContactMessageRecord = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: "new" | "read" | "archived";
  createdAt: string;
};

export type NewsletterSubscriptionRecord = {
  id: string;
  email: string;
  status: "subscribed" | "unsubscribed";
  subscribedAt: string;
  updatedAt: string;
};

export type CustomerProductListItemRecord = {
  id: string;
  customerId: string;
  productId: string;
  createdAt: string;
};

export type CartVariantRecord = ProductVariantRecord & {
  productName: string;
  productSlug: string;
  productIsActive: boolean;
  weightKg: string | null;
  volumeDesi: string | null;
  isHazardous: boolean;
};

export type InventoryRecord = {
  id: string;
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
  unitType: "piece" | "kg" | "liter" | "meter" | "bag" | "pack";
  updatedAt: string;
};

export type InventoryMovementRecord = {
  id: string;
  variantId: string;
  movementType: "purchase" | "sale" | "return" | "adjustment" | "waste" | "transfer_in" | "transfer_out";
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type InventoryReservationRecord = {
  id: string;
  variantId: string;
  quantity: number;
  reservationType: "cart" | "order";
  referenceId: string;
  expiresAt: string;
  releasedAt: string | null;
  createdAt: string;
};

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled";

export type OrderRecord = {
  id: string;
  orderNumber: string;
  cartId: string | null;
  customerId: string;
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  shippingAddress: Record<string, unknown>;
  billingAddress: Record<string, unknown> | null;
  carrierCode: string;
  couponCode: string | null;
  customerNote: string | null;
  internalNote: string | null;
  returnWindowExpiresAt: string | null;
  invoicePdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderItemRecord = {
  id: string;
  orderId: string;
  variantId: string;
  reservationRef: string;
  productSnapshot: Record<string, unknown>;
  variantSnapshot: Record<string, unknown>;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type OrderStatusHistoryRecord = {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  reason: string | null;
  changedBy: string | null;
  changedAt: string;
};

export type PaymentStatus =
  | "initialized"
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type PaymentRecord = {
  id: string;
  orderId: string;
  provider: string;
  providerTransactionId: string | null;
  token: string | null;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  cardLast4: string | null;
  cardFamily: string | null;
  installmentCount: number | null;
  rawResponse: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type CarrierCode = "aras" | "mng" | "yurtici";

export type ShipmentStatus =
  | "created"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned";

export type ShipmentRecord = {
  id: string;
  orderId: string;
  carrierCode: CarrierCode;
  trackingNumber: string | null;
  labelUrl: string | null;
  status: ShipmentStatus;
  estimatedDeliveryDate: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShipmentEventRecord = {
  id: string;
  shipmentId: string;
  eventType: ShipmentStatus | string;
  description: string | null;
  location: string | null;
  occurredAt: string;
  rawPayload: Record<string, unknown> | null;
  eventDedupeKey: string | null;
  createdAt: string;
};

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "in_transit"
  | "received"
  | "refunded"
  | "cancelled";

export type ReturnReason =
  | "cayma_hakki"
  | "hasarli_kargo"
  | "yanlis_urun"
  | "defolu_urun"
  | "aciklamayla_uyumsuz";

export type ReturnShippingPaidBy = "customer" | "seller";

export type ReturnRecord = {
  id: string;
  returnNumber: string;
  orderId: string;
  customerId: string;
  status: ReturnStatus;
  reason: ReturnReason;
  customerNote: string | null;
  adminNote: string | null;
  photos: string[] | null;
  returnShippingPaidBy: ReturnShippingPaidBy;
  returnTrackingNumber: string | null;
  refundAmountCents: number | null;
  rejectedReason: string | null;
  requestedAt: string;
  approvedAt: string | null;
  receivedAt: string | null;
  refundedAt: string | null;
};

export type ReturnItemCondition = "unopened" | "opened" | "damaged" | "missing";

export type ReturnItemRecord = {
  id: string;
  returnId: string;
  orderItemId: string;
  quantity: number;
  unitRefundCents: number;
  itemCondition: ReturnItemCondition | null;
  restockEligible: boolean;
};

export type ReturnStatusHistoryRecord = {
  id: string;
  returnId: string;
  fromStatus: ReturnStatus | null;
  toStatus: ReturnStatus;
  reason: string | null;
  changedBy: string | null;
  changedAt: string;
};

export type RefundStatus = "pending" | "processing" | "succeeded" | "failed";

export type RefundRecord = {
  id: string;
  returnId: string | null;
  orderId: string;
  paymentId: string;
  amountCents: number;
  status: RefundStatus;
  providerRefundId: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type DiscountType = "percent" | "fixed";

export type CouponRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: DiscountType;
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

export type CouponRedemptionRecord = {
  id: string;
  couponId: string;
  orderId: string;
  customerId: string;
  discountCents: number;
  redeemedAt: string;
};

export type AuditLogRecord = {
  id: string;
  userId: string | null;
  userRole: string | null;
  method: string;
  path: string;
  statusCode: number;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
