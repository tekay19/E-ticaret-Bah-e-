export type CartItem = {
  itemId: string;
  variantId: string;
  reservationRef: string;
  qty: number;
  unitPriceCents: number;
  productName: string;
  productSlug: string;
  variantSku: string;
  addedAt: string;
};

export type Cart = {
  cartId: string;
  userId: string | null;
  sessionId: string | null;
  items: CartItem[];
  appliedCouponCode: string | null;
  couponDiscountCents?: number;
  shippingChoice: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CartWarning = {
  type: "price_changed" | "out_of_stock" | "product_unavailable" | "quantity_reduced";
  variantId: string;
  message: string;
};
