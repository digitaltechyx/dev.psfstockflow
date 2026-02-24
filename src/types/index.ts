import type { User as FirebaseUser } from "firebase/auth";

export type UserRole = "admin" | "user" | "commission_agent" | "sub_admin";
export type UserStatus = "pending" | "approved" | "deleted";

export type UserFeature =
  | "buy_labels"
  | "upload_labels"
  | "track_shipment"
  | "view_invoices"
  | "restock_summary"
  | "delete_logs"
  | "modification_logs"
  | "disposed_inventory"
  | "affiliate_dashboard"
  | "admin_dashboard"
  | "manage_users"
  | "manage_invoices"
  | "manage_labels";

export interface UserProfile {
  uid: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  password?: string | null;
  companyName?: string | null;
  ein?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zipCode?: string | null;
  profilePictureUrl?: string | null;
  role: UserRole; // Legacy single role (for backward compatibility)
  roles?: UserRole[]; // New array format for multiple roles
  features?: UserFeature[]; // Granted features
  status?: UserStatus; // Optional for backward compatibility
  createdAt?: Date;
  approvedAt?: Date;
  deletedAt?: Date;
  referredByAgentId?: string; // ID of the commission agent who referred this user
  referralCode?: string; // Unique referral code for commission agents
  socialProfile?: string; // Social media profile URL
  salesExperience?: string[]; // Array of sales experience types
  referralSource?: string; // How they heard about the program
}

export interface InventoryItem {
  id: string;
  productName: string;
  quantity: number;
  dateAdded: {
    seconds: number;
    nanoseconds: number;
  } | string;
  status: 'In Stock' | 'Out of Stock';
  /** Set when item is synced from an external integration (read-only in inventory list). */
  source?: 'shopify' | 'ebay';
  shopifyVariantId?: string;
  shopifyProductId?: string;
  /** Shopify inventory_item_id (for inventory_levels API and webhooks). */
  shopifyInventoryItemId?: string;
  shop?: string;
  sku?: string;
}

export interface ShipmentProductItem {
  productId?: string;
  productName: string;
  boxesShipped: number;
  shippedQty: number;
  packOf: number;
  unitPrice?: number;
  remainingQty?: number;
}

export interface LabelProductDetail {
  name: string;
  productId?: string;
  shippedUnits?: number;
  packOf?: number;
  quantity?: number; // total units (shippedUnits * packOf)
}

export interface ShippedItem {
  id: string;
  productName?: string;
  date: {
    seconds: number;
    nanoseconds: number;
  } | string;
  createdAt?: {
    seconds: number;
    nanoseconds: number;
  } | string;
  shippedQty?: number;
  boxesShipped?: number;
  unitsForPricing?: number;
  remainingQty?: number;
  packOf?: number;
  unitPrice?: number;
  packOfPrice?: number;
  shipTo: string;
  remarks?: string;
  items?: ShipmentProductItem[];
  totalBoxes?: number;
  totalUnits?: number;
  totalSkus?: number;

  // Optional fields stored by newer shipment flows (admin side can show richer detail)
  service?: string;
  shipmentType?: string;
  palletSubType?: string;
  productType?: string;
  customDimensions?: string;
  customProductPricing?: any;
  additionalServices?: {
    bubbleWrapFeet?: number;
    stickerRemovalItems?: number;
    warningLabels?: number;
    pricePerFoot?: number;
    pricePerItem?: number;
    pricePerLabel?: number;
    total?: number;
  };
}

export interface RestockHistory {
  id: string;
  productName: string;
  previousQuantity: number;
  restockedQuantity: number;
  newQuantity: number;
  restockedBy: string; // Admin name who restocked
  restockedAt: {
    seconds: number;
    nanoseconds: number;
  } | string;
}

export interface RecycledShippedItem {
  id: string;
  productName?: string;
  date: {
    seconds: number;
    nanoseconds: number;
  } | string;
  shippedQty?: number;
  remainingQty?: number;
  packOf?: number;
  shipTo: string;
  remarks?: string;
  recycledAt: {
    seconds: number;
    nanoseconds: number;
  } | string;
  recycledBy: string; // Admin name who recycled
  items?: ShipmentProductItem[];
  totalBoxes?: number;
  totalUnits?: number;
  totalSkus?: number;
}

/** Shopify order synced via webhook; stored in users/{uid}/shopifyOrders/{orderId}. */
export interface ShopifyOrder {
  id: string; // Shopify order id
  order_number: number;
  name?: string; // e.g. "#1001"
  shop: string;
  email?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  created_at?: string;
  updated_at?: string;
  line_items?: Array<{
    title?: string;
    quantity?: number;
    sku?: string;
    variant_id?: number;
    id?: number;
  }>;
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address1?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    phone?: string;
  };
  billing_address?: Record<string, unknown>;
  customer?: { email?: string; first_name?: string; last_name?: string };
  note?: string;
}

export interface RecycledRestockHistory {
  id: string;
  productName: string;
  previousQuantity: number;
  restockedQuantity: number;
  newQuantity: number;
  restockedBy: string;
  restockedAt: {
    seconds: number;
    nanoseconds: number;
  } | string;
  recycledAt: {
    seconds: number;
    nanoseconds: number;
  } | string;
  recycledBy: string; // Admin name who recycled
}

export interface RecycledInventoryItem {
  id: string;
  productName: string;
  quantity: number;
  dateAdded: {
    seconds: number;
    nanoseconds: number;
  } | string;
  status: 'In Stock' | 'Out of Stock';
  recycledAt: {
    seconds: number;
    nanoseconds: number;
  } | string;
  recycledBy: string; // Admin name who recycled
  remarks?: string; // Reason for recycling
}

/** User-initiated dispose request (user selects product, quantity, reason; admin approves or rejects). */
export interface DisposeRequest {
  id?: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedAt?: { seconds: number; nanoseconds: number } | string;
  approvedBy?: string;
  approvedAt?: { seconds: number; nanoseconds: number } | string;
  rejectedBy?: string;
  rejectedAt?: { seconds: number; nanoseconds: number } | string;
  adminFeedback?: string;
}

/** One selected variant – PSF will only fulfill orders containing these. */
export interface ShopifySelectedVariant {
  variantId: string;
  productId: string;
  title: string;
  sku?: string;
}

/** One connected Shopify store for a user (multiple allowed per user). */
export interface ShopifyConnection {
  id?: string;
  shop: string; // e.g. mystore.myshopify.com
  shopName?: string; // Display name
  accessToken: string;
  connectedAt: { seconds: number; nanoseconds: number } | string;
  /** Variants the user selected for PSF to fulfill (orders with these only). */
  selectedVariants?: ShopifySelectedVariant[];
}

export interface DeleteLog {
  id: string;
  productName: string;
  quantity: number;
  dateAdded: {
    seconds: number;
    nanoseconds: number;
  } | string;
  status: 'In Stock' | 'Out of Stock';
  deletedAt: {
    seconds: number;
    nanoseconds: number;
  } | string;
  deletedBy: string; // Admin name who deleted
  reason: string; // Reason for deletion
}

export interface EditLog {
  id: string;
  productName: string;
  previousProductName?: string; // In case product name was changed
  previousQuantity: number;
  newQuantity: number;
  previousStatus: 'In Stock' | 'Out of Stock';
  newStatus: 'In Stock' | 'Out of Stock';
  dateAdded: {
    seconds: number;
    nanoseconds: number;
  } | string;
  editedAt: {
    seconds: number;
    nanoseconds: number;
  } | string;
  editedBy: string; // Admin name who edited
  reason: string; // Reason for editing
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  orderNumber: string;
  soldTo: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
  };
  fbm: string;
  items: Array<{
    quantity: number;
    productName: string;
    shipDate?: string;
    packaging: string;
    shipTo: string;
    unitPrice: number;
    amount: number;
    shipmentId?: string; // Track which shipment this item came from
  }>;
  subtotal: number;
  grandTotal: number;
  status: 'pending' | 'paid';
  createdAt: {
    seconds: number;
    nanoseconds: number;
  } | string;
  userId: string;
  autoGenerated?: boolean;
  autoGeneratedForDate?: string;
  autoGeneratedAt?: {
    seconds: number;
    nanoseconds: number;
  } | string;
  range?: {
    from: {
      seconds: number;
      nanoseconds: number;
    } | string;
    to: {
      seconds: number;
      nanoseconds: number;
    } | string;
  };
  // Optional newer fields (auto-generated invoices, discounts, additional services, container handling, etc.)
  additionalServices?: {
    bubbleWrapFeet?: number;
    stickerRemovalItems?: number;
    warningLabels?: number;
    pricePerFoot?: number;
    pricePerItem?: number;
    pricePerLabel?: number;
    total?: number;
  };
  grossTotal?: number;
  discountType?: "amount" | "percent";
  discountValue?: number;
  discountAmount?: number;
  type?: string;
  isContainerHandling?: boolean;
}

export interface UploadedPDF {
  id: string;
  fileName: string;
  storagePath: string; // Full path in Firebase Storage
  downloadURL: string; // Download URL from Firebase Storage
  size: number; // File size in bytes
  uploadedAt: {
    seconds: number;
    nanoseconds: number;
  } | string;
  uploadedBy: string; // User ID
  uploadedByName: string; // User name (client name)
  year: string; // e.g., "2024"
  month: string; // e.g., "January" or "01"
  date: string; // e.g., "2024-01-15"
  labelProducts?: LabelProductDetail[];
  status?: "pending" | "complete"; // Label processing status
}

export interface Commission {
  id: string;
  agentId: string; // Commission agent's user ID
  agentName: string;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string; // Client's user ID
  clientName: string;
  invoiceAmount: number;
  commissionAmount: number; // 10% of invoice amount
  status: "pending" | "paid";
  createdAt: Date | {
    seconds: number;
    nanoseconds: number;
  } | string;
  paidAt?: Date | {
    seconds: number;
    nanoseconds: number;
  } | string;
  paidBy?: string; // Admin user ID who marked as paid
}

export interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// Stripe & Shippo Integration Types
export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface ParcelDetails {
  length: number;
  width: number;
  height: number;
  weight: number;
  weightUnit: 'lb' | 'oz' | 'kg' | 'g';
  distanceUnit: 'in' | 'ft' | 'cm' | 'm';
}

export interface ShippingRate {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel: {
    name: string;
    token: string;
  };
  estimated_days?: number;
  shipment?: string; // Shipment ID from Shippo
}

export interface LabelPurchase {
  id: string;
  userId: string;
  purchasedBy: string;
  fromAddress: ShippingAddress;
  toAddress: ShippingAddress;
  parcel: ParcelDetails;
  selectedRate: {
    objectId: string;
    amount: string;
    currency: string;
    provider: string;
    serviceLevel: string;
    shipmentId?: string;
  };
  stripePaymentIntentId: string;
  stripeChargeId?: string;
  paymentStatus: 'pending' | 'succeeded' | 'failed' | 'canceled';
  paymentAmount: number;
  paymentCurrency: string;
  status: 'payment_pending' | 'payment_succeeded' | 'label_purchased' | 'label_failed' | 'completed';
  shippoTransactionId?: string;
  trackingNumber?: string;
  labelUrl?: string;
  errorMessage?: string;
  createdAt: any;
  paymentCompletedAt?: Date;
  labelPurchasedAt?: Date;
  shippedItemId?: string;
}

  paidAt?: Date | {
    seconds: number;
    nanoseconds: number;
  } | string;
  paidBy?: string; // Admin user ID who marked as paid
}

export interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// Stripe & Shippo Integration Types
export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface ParcelDetails {
  length: number;
  width: number;
  height: number;
  weight: number;
  weightUnit: 'lb' | 'oz' | 'kg' | 'g';
  distanceUnit: 'in' | 'ft' | 'cm' | 'm';
}

export interface ShippingRate {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel: {
    name: string;
    token: string;
  };
  estimated_days?: number;
  shipment?: string; // Shipment ID from Shippo
}

export interface LabelPurchase {
  id: string;
  userId: string;
  purchasedBy: string;
  fromAddress: ShippingAddress;
  toAddress: ShippingAddress;
  parcel: ParcelDetails;
  selectedRate: {
    objectId: string;
    amount: string;
    currency: string;
    provider: string;
    serviceLevel: string;
    shipmentId?: string;
  };
  stripePaymentIntentId: string;
  stripeChargeId?: string;
  paymentStatus: 'pending' | 'succeeded' | 'failed' | 'canceled';
  paymentAmount: number;
  paymentCurrency: string;
  status: 'payment_pending' | 'payment_succeeded' | 'label_purchased' | 'label_failed' | 'completed';
  shippoTransactionId?: string;
  trackingNumber?: string;
  labelUrl?: string;
  errorMessage?: string;
  createdAt: any;
  paymentCompletedAt?: Date;
  labelPurchasedAt?: Date;
  shippedItemId?: string;
}

  paidAt?: Date | {
    seconds: number;
    nanoseconds: number;
  } | string;
  paidBy?: string; // Admin user ID who marked as paid
}

export interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// Stripe & Shippo Integration Types
export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface ParcelDetails {
  length: number;
  width: number;
  height: number;
  weight: number;
  weightUnit: 'lb' | 'oz' | 'kg' | 'g';
  distanceUnit: 'in' | 'ft' | 'cm' | 'm';
}

export interface ShippingRate {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel: {
    name: string;
    token: string;
  };
  estimated_days?: number;
  shipment?: string; // Shipment ID from Shippo
}

export interface LabelPurchase {
  id: string;
  userId: string;
  purchasedBy: string;
  fromAddress: ShippingAddress;
  toAddress: ShippingAddress;
  parcel: ParcelDetails;
  selectedRate: {
    objectId: string;
    amount: string;
    currency: string;
    provider: string;
    serviceLevel: string;
    shipmentId?: string;
  };
  stripePaymentIntentId: string;
  stripeChargeId?: string;
  paymentStatus: 'pending' | 'succeeded' | 'failed' | 'canceled';
  paymentAmount: number;
  paymentCurrency: string;
  status: 'payment_pending' | 'payment_succeeded' | 'label_purchased' | 'label_failed' | 'completed';
  shippoTransactionId?: string;
  trackingNumber?: string;
  labelUrl?: string;
  errorMessage?: string;
  createdAt: any;
  paymentCompletedAt?: Date;
  labelPurchasedAt?: Date;
  shippedItemId?: string;
}

  paidAt?: Date | {
    seconds: number;
    nanoseconds: number;
  } | string;
  paidBy?: string; // Admin user ID who marked as paid
}

export interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// Stripe & Shippo Integration Types
export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface ParcelDetails {
  length: number;
  width: number;
  height: number;
  weight: number;
  weightUnit: 'lb' | 'oz' | 'kg' | 'g';
  distanceUnit: 'in' | 'ft' | 'cm' | 'm';
}

export interface ShippingRate {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel: {
    name: string;
    token: string;
  };
  estimated_days?: number;
  shipment?: string; // Shipment ID from Shippo
}

export interface LabelPurchase {
  id: string;
  userId: string;
  purchasedBy: string;
  fromAddress: ShippingAddress;
  toAddress: ShippingAddress;
  parcel: ParcelDetails;
  selectedRate: {
    objectId: string;
    amount: string;
    currency: string;
    provider: string;
    serviceLevel: string;
    shipmentId?: string;
  };
  stripePaymentIntentId: string;
  stripeChargeId?: string;
  paymentStatus: 'pending' | 'succeeded' | 'failed' | 'canceled';
  paymentAmount: number;
  paymentCurrency: string;
  status: 'payment_pending' | 'payment_succeeded' | 'label_purchased' | 'label_failed' | 'completed';
  shippoTransactionId?: string;
  trackingNumber?: string;
  labelUrl?: string;
  errorMessage?: string;
  createdAt: any;
  paymentCompletedAt?: Date;
  labelPurchasedAt?: Date;
  shippedItemId?: string;
}
