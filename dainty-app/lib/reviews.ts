import { supabase } from './supabase';

export type ProductReview = {
  id: string;
  orderId?: string;
  productId: string;
  productTitle: string;
  selectedColor?: string | null;
  selectedSize?: string | null;
  selectedImage?: string | null;
  rating: number; // 1 to 5
  customerName: string;
  comment: string;
  tags?: string[];
  createdAt: string;
};

const REVIEWS_STORAGE_KEY = 'dainty_reviews_v1';
const CART_STORAGE_KEY = 'dainty_preorder_cart_v1';

export function getReviewKey(
  productId: string,
  orderId?: string,
  selectedColor?: string | null,
  selectedSize?: string | null
): string {
  const parts = [
    orderId || 'any',
    productId,
    (selectedColor || '').trim().toLowerCase(),
    (selectedSize || '').trim().toLowerCase(),
  ];
  return parts.join('__');
}

export function getAllSavedReviews(): Record<string, ProductReview> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Failed to load reviews from localStorage:', e);
    return {};
  }
}

export async function saveProductReview(review: ProductReview): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Save to localStorage
  try {
    const existing = getAllSavedReviews();
    const key = getReviewKey(
      review.productId,
      review.orderId,
      review.selectedColor,
      review.selectedSize
    );
    existing[key] = review;
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn('Failed to save review to localStorage:', e);
  }

  // 2. Try saving to Supabase if table exists
  try {
    await supabase.from('product_reviews').upsert([
      {
        id: review.id,
        order_id: review.orderId || null,
        product_id: review.productId,
        product_title: review.productTitle,
        selected_color: review.selectedColor || null,
        selected_size: review.selectedSize || null,
        rating: review.rating,
        customer_name: review.customerName,
        comment: review.comment,
        tags: review.tags || [],
        created_at: review.createdAt,
      },
    ]);
  } catch (err) {
    // Fail silently if table not present yet in user Supabase
    console.info('Supabase product_reviews notice:', err);
  }
}

export function buildReviewWhatsAppUrl(
  review: ProductReview,
  waPhone?: string | null
): string {
  const stars = '⭐️'.repeat(review.rating);
  const cleanPhone = waPhone ? waPhone.replace(/[^0-9]/g, '') : '';

  const lines = [
    `*Customer Review for Dainty Import* ${stars}`,
    '',
    `📦 *Product:* ${review.productTitle}`,
    review.selectedColor ? `🎨 *Color:* ${review.selectedColor}` : '',
    review.selectedSize ? `📏 *Size:* ${review.selectedSize}` : '',
    `⭐️ *Rating:* ${review.rating}/5 Stars (${stars})`,
    `💬 *Review:* "${review.comment}"`,
    review.customerName ? `👤 *Customer Name:* ${review.customerName}` : '',
    review.orderId ? `🔢 *Order Ref:* #${review.orderId}` : '',
  ].filter(Boolean);

  const text = encodeURIComponent(lines.join('\n'));
  return cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function addPastItemToCart(item: {
  productId: string;
  title: string;
  price: number;
  quantity?: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
  selectedImage?: string | null;
}): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    const existing = raw
      ? JSON.parse(raw)
      : { items: [], mode: 'retail', shippingMethod: 'air', updatedAt: Date.now() };

    const items: Array<{
      productId: string;
      quantity: number;
      selectedSize?: string | null;
      selectedColor?: string | null;
      selectedImage?: string | null;
    }> = Array.isArray(existing.items) ? existing.items : [];

    const qtyToAdd = item.quantity && item.quantity > 0 ? item.quantity : 1;
    const matchIndex = items.findIndex(
      (i) =>
        i.productId === item.productId &&
        (i.selectedSize || '') === (item.selectedSize || '') &&
        (i.selectedColor || '') === (item.selectedColor || '')
    );

    if (matchIndex > -1) {
      items[matchIndex].quantity += qtyToAdd;
    } else {
      items.push({
        productId: item.productId,
        quantity: qtyToAdd,
        selectedSize: item.selectedSize || null,
        selectedColor: item.selectedColor || null,
        selectedImage: item.selectedImage || null,
      });
    }

    existing.items = items;
    existing.updatedAt = Date.now();
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(existing));
    return true;
  } catch (e) {
    console.warn('Failed to add past item to cart:', e);
    return false;
  }
}
