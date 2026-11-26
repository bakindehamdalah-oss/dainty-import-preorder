'use client';

import Link from 'next/link';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  PackagePlus,
  AlertCircle,
  ArrowRight,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Grid,
  Home,
  ImageIcon,
  Info,
  Layers,
  Maximize2,
  MessageCircle,
  Minus,
  Plane,
  Plus,
  Search,
  ShieldCheck,
  Ship,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';

type StoreSettings = {
  id: number;
  whatsapp_number: string | null;
  air_rate_per_kg?: number;
  sea_rate_per_kg?: number;
};

type Category = {
  id: string;
  name: string;
  description?: string;
  slug: string;
  wholesale_moq?: number;
  moq_scope?: 'category' | 'item';
  allow_mix_and_match?: boolean;
  allow_air_shipping?: boolean;
  allow_sea_shipping?: boolean;
};

type Product = {
  id: string;
  category_id: string | null;
  name?: string | null;
  title?: string | null;
  size?: string | null;
  sizes?: string[] | null;
  size_options?: string | null;
  wholesale_moq?: number | null;
  min_order_qty?: number | null;
  moq_scope?: 'category' | 'item' | null;
  description: string | null;
  image_url: string | null;
  images?: string[] | null;
  colors?: string[] | null;
  color_options?: string | null;
  variants?: { color?: string; size?: string; image_url?: string }[] | null;
  retail_price: number;
  wholesale_price: number;
  est_shipping_fee?: number | null;
  est_shipping_fee_air?: number | null;
  est_shipping_fee_sea?: number | null;
};

type CartItem = {
  product: Product;
  quantity: number;
  selectedColor?: string | null;
  selectedSize?: string | null;
  selectedImage?: string | null;
};

// Check strictly if this category or product belongs to the iPhone Cases category
function isStrictIphoneCaseCategory(category?: Category | null, product?: Product | null): boolean {
  const catName = (category?.name || category?.slug || '').toLowerCase();
  const prodName = (product?.name || product?.title || '').toLowerCase();
  const isCat = catName.includes('iphone') || (catName.includes('case') && !catName.includes('briefcase') && !catName.includes('suitcase'));
  const isProd = (prodName.includes('iphone') && (prodName.includes('case') || prodName.includes('cover') || prodName.includes('casing') || prodName.includes('clear') || prodName.includes('silicone') || prodName.includes('leather'))) ||
                 (prodName.includes('case') && (prodName.includes('11') || prodName.includes('12') || prodName.includes('13') || prodName.includes('14') || prodName.includes('15') || prodName.includes('16') || prodName.includes('pro') || prodName.includes('promax') || prodName.includes('max') || prodName.includes('plus')));
  return Boolean(isCat || isProd);
}

// Extract wholesale MOQ: strictly per item by default unless category MOQ is explicitly stated
function getProductWholesaleMOQ(product: Product, category?: Category | null): number {
  // 1. Strictly for iPhone Cases: always 50 pieces across the category for mix & match
  if (isStrictIphoneCaseCategory(category, product)) {
    return 50;
  }

  // 2. A whole-category rule is authoritative over item-level values
  if (getProductMOQScope(product, category) === 'category' && Number(category?.wholesale_moq) > 0) {
    return Number(category?.wholesale_moq);
  }

  // 3. If product specifies its own wholesale MOQ, that takes priority for item scope
  if (product.wholesale_moq !== undefined && product.wholesale_moq !== null && Number(product.wholesale_moq) > 0) {
    return Number(product.wholesale_moq);
  }
  if (product.min_order_qty !== undefined && product.min_order_qty !== null && Number(product.min_order_qty) > 0) {
    return Number(product.min_order_qty);
  }

  // 4. Read embedded metadata tag from description (survives any DB schema gaps)
  if (product.description) {
    const match = product.description.match(/<!--dainty_moq:(\d+)-->/);
    if (match && Number(match[1]) > 0) {
      return Number(match[1]);
    }
  }

  // 5. Per-item default: 1 piece
  return 1;
}

// Extract wholesale MOQ scope: strictly per-item by default unless category MOQ is explicitly chosen
function getProductMOQScope(product: Product, category?: Category | null): 'category' | 'item' {
  // iPhone cases are ALWAYS category-wide mix and match
  if (isStrictIphoneCaseCategory(category, product)) {
    return 'category';
  }

  // 1. If product explicitly specifies its own scope
  if (product.moq_scope === 'item') return 'item';
  if (product.moq_scope === 'category') return 'category';

  // 2. Read embedded metadata tag from description
  if (product.description) {
    const match = product.description.match(/<!--dainty_moq_scope:(category|item)-->/);
    if (match) {
      return match[1] as 'category' | 'item';
    }
  }

  // 3. If category is explicitly set to whole category scope
  if (category?.moq_scope === 'category') {
    return 'category';
  }

  // 4. Default is strictly per-item
  return 'item';
}

// Wholesale Specification Matrix Modal
function MatrixOrderModal({
  product,
  category,
  categoryQtyInCart = 0,
  onClose,
  onAddBatchToCart,
  onZoomImage,
}: {
  product: Product;
  category?: Category | null;
  categoryQtyInCart?: number;
  onClose: () => void;
  onAddBatchToCart: (
    items: { color: string | null; size: string | null; quantity: number }[]
  ) => void;
  onZoomImage: (url: string) => void;
}) {
  const productTitle = product.name || product.title || 'Product';
  const moq = getProductWholesaleMOQ(product, category);
  const moqScope = getProductMOQScope(product, category);

  // Extract all sizes and colors
  const sizes = useMemo(() => {
    const list: string[] = [];
    const addSize = (val: unknown) => {
      if (!val) return;
      const str = String(val).trim();
      if (!str) return;
      const parts = str.split(/[,/|;\n]+/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed && !list.includes(trimmed)) {
          list.push(trimmed);
        }
      }
    };

    if (Array.isArray(product.sizes)) {
      for (const s of product.sizes) addSize(s);
    }
    if (product.size_options) {
      addSize(product.size_options);
    }
    if (product.size) {
      addSize(product.size);
    }
    if (Array.isArray(product.variants)) {
      for (const v of product.variants) {
        if (v?.size) addSize(v.size);
      }
    }
    if (list.length === 0) {
      for (const size of getDescriptionList(product.description, 'sizes')) addSize(size);
    }
    return list;
  }, [product]);

  const colors = useMemo(() => {
    const list: string[] = [];
    const addColor = (val: unknown) => {
      if (!val) return;
      const str = String(val).trim();
      if (!str) return;
      const parts = str.split(/[,/|;\n]+/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed && !list.includes(trimmed)) {
          list.push(trimmed);
        }
      }
    };

    if (Array.isArray(product.colors)) {
      for (const c of product.colors) addColor(c);
    }
    if (product.color_options) {
      addColor(product.color_options);
    }
    if (Array.isArray(product.variants)) {
      for (const v of product.variants) {
        if (v?.color) addColor(v.color);
      }
    }
    if (list.length === 0) {
      for (const color of getDescriptionList(product.description, 'colors')) addColor(color);
    }
    return list;
  }, [product]);

  // Active filter tab if multiple colors exist
  const [activeColorTab, setActiveColorTab] = useState<string>(colors[0] || 'All');

  // Matrix quantities state: key is `color:::size`
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  function getKey(color: string | null, size: string | null) {
    return `${color || ''}:::${size || ''}`;
  }

  function getQty(color: string | null, size: string | null) {
    return quantities[getKey(color, size)] || 0;
  }

  function setQty(color: string | null, size: string | null, qty: number) {
    const key = getKey(color, size);
    setQuantities((prev) => ({
      ...prev,
      [key]: Math.max(0, qty),
    }));
  }

  function adjustQty(color: string | null, size: string | null, delta: number) {
    const current = getQty(color, size);
    setQty(color, size, current + delta);
  }

  // Quick fill buttons
  function quickFillActive(delta: number) {
    setQuantities((prev) => {
      const next = { ...prev };
      const targetColors = colors.length > 0 ? (activeColorTab === 'All' ? colors : [activeColorTab]) : [null];
      const targetSizes = sizes.length > 0 ? sizes : [null];

      for (const c of targetColors) {
        for (const s of targetSizes) {
          const k = getKey(c, s);
          next[k] = Math.max(0, (next[k] || 0) + delta);
        }
      }
      return next;
    });
  }

  const totalSelected = useMemo(() => {
    return Object.values(quantities).reduce((sum, q) => sum + (q || 0), 0);
  }, [quantities]);

  const totalTowardsCategory = categoryQtyInCart + totalSelected;
  const progressPercent = moqScope === 'category'
    ? Math.min(100, Math.round((totalTowardsCategory / moq) * 100))
    : Math.min(100, Math.round((totalSelected / moq) * 100));

  function handleConfirm() {
    if (totalSelected === 0) return;
    const items: { color: string | null; size: string | null; quantity: number }[] = [];
    for (const [key, qty] of Object.entries(quantities)) {
      if (qty > 0) {
        const [c, s] = key.split(':::');
        items.push({
          color: c || null,
          size: s || null,
          quantity: qty,
        });
      }
    }
    onAddBatchToCart(items);
    onClose();
  }

  // Determine list of displayed variants
  const displayedColors = colors.length > 0 ? (activeColorTab === 'All' ? colors : [activeColorTab]) : [null];
  const displayedSizes = sizes.length > 0 ? sizes : [null];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-5 backdrop-blur-xs">
      <div
        className="relative flex flex-col max-h-[92vh] w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={productTitle}
                onClick={() => onZoomImage(product.image_url!)}
                className="h-11 w-11 shrink-0 rounded-lg border border-stone-200 bg-white object-contain cursor-pointer"
              />
            ) : null}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-[#fa9d26] px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Wholesale Variant Order Sheet
                </span>
                <span className="text-xs text-stone-500 font-medium">
                  ₦{Number(product.wholesale_price).toLocaleString()} / pc
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-stone-900 truncate mt-0.5">
                {productTitle}
              </h2>
              <div className="text-[11px] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                {getProductShippingFees(product).air > 0 ? (
                  <span className="text-stone-600">Air: ₦{getProductShippingFees(product).air.toLocaleString()}</span>
                ) : (
                  <span className="text-red-600 font-medium">Can&apos;t be shipped by air</span>
                )}
                <span className="text-stone-300">•</span>
                {getProductShippingFees(product).sea > 0 ? (
                  <span className="text-stone-600">Sea: ₦{getProductShippingFees(product).sea.toLocaleString()}</span>
                ) : (
                  <span className="text-red-600 font-medium">Can&apos;t be shipped by sea</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scope Notice Banner */}
        <div className="border-b border-amber-200/80 bg-amber-50/70 px-4 py-2 text-xs text-amber-900">
          {moqScope === 'category' ? (
            <div className="flex items-start gap-1.5">
              <Sparkles className="h-4 w-4 text-[#fa9d26] shrink-0 mt-0.5" />
              <div>
                <strong>Category Bulk Purchase:</strong> Wholesale factory pricing applies once the combined order reaches <strong>{moq} pieces</strong> across this category.
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-1.5">
              <Box className="h-4 w-4 text-[#fa9d26] shrink-0 mt-0.5" />
              <div>
                <strong>Item Minimum Order:</strong> Wholesale factory pricing for this item starts at <strong>{moq} pieces</strong>. Choose the available sizes and colors below.
              </div>
            </div>
          )}
        </div>

        {/* Color Tabs if colors exist */}
        {colors.length > 1 && (
          <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-100/60 px-4 py-2 overflow-x-auto">
            <span className="text-[11px] font-semibold text-stone-500 shrink-0">Filter Color:</span>
            <button
              type="button"
              onClick={() => setActiveColorTab('All')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition shrink-0 ${
                activeColorTab === 'All'
                  ? 'bg-stone-900 text-white font-bold shadow-2xs'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              All Colors ({colors.length})
            </button>
            {colors.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => setActiveColorTab(col)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition shrink-0 ${
                  activeColorTab === col
                    ? 'bg-[#fa9d26] text-white font-bold shadow-2xs'
                    : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {col}
              </button>
            ))}
          </div>
        )}

        {/* Quick Batch Buttons Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-stone-50/70 px-4 py-2 text-xs">
          <span className="text-stone-600 text-[11px] font-medium">
            Quick fill ({displayedColors.length * displayedSizes.length} variant{displayedColors.length * displayedSizes.length > 1 ? 's' : ''}):
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => quickFillActive(1)}
              className="rounded-md bg-white border border-stone-200 px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 shadow-2xs active:bg-stone-200 transition"
            >
              +1 each
            </button>
            <button
              type="button"
              onClick={() => quickFillActive(5)}
              className="rounded-md bg-white border border-stone-200 px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 shadow-2xs active:bg-stone-200 transition"
            >
              +5 each
            </button>
            <button
              type="button"
              onClick={() => quickFillActive(10)}
              className="rounded-md bg-white border border-stone-200 px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 shadow-2xs active:bg-stone-200 transition"
            >
              +10 each
            </button>
            {totalSelected > 0 && (
              <button
                type="button"
                onClick={() => setQuantities({})}
                className="text-[11px] font-semibold text-red-600 hover:underline ml-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Variant Quantity Selection Table */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2.5 sm:space-y-3">
          <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white overflow-hidden shadow-2xs">
            {displayedColors.map((color) => {
              return displayedSizes.map((size) => {
                const qty = getQty(color, size);
                const unitPrice = Number(product.wholesale_price) || 0;
                const rowTotal = qty * unitPrice;

                return (
                  <div
                    key={getKey(color, size)}
                    className={`p-3 sm:p-3.5 transition ${
                      qty > 0 ? 'bg-amber-50/60' : 'hover:bg-stone-50/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                      {/* Left: Size & Color Info - clearly visible and wrapping without truncation */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          {/* Prominent Size Tag */}
                          {size ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-stone-900 px-2.5 py-1 text-xs font-bold text-white shadow-2xs">
                              <span className="text-stone-300 font-normal text-[11px]">Size:</span>
                              <span className="break-words">{size}</span>
                            </span>
                          ) : (
                            !color && (
                              <span className="inline-flex items-center rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700 border border-stone-200">
                                Standard Spec
                              </span>
                            )
                          )}

                          {/* Color Badge if present */}
                          {color && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-800 border border-stone-200">
                              <span className="text-stone-500 font-normal text-[11px]">Color:</span>
                              <span>{color}</span>
                            </span>
                          )}

                          {/* Price Tag */}
                          <span className="text-xs text-stone-500 font-medium">
                            ₦{unitPrice.toLocaleString()}/pc
                          </span>
                        </div>
                      </div>

                      {/* Right: Quantity Stepper & Total */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1.5 sm:pt-0 border-t border-stone-100 sm:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-stone-500 sm:hidden">
                            Quantity:
                          </span>
                          <div className="flex items-center rounded-lg border border-stone-300 bg-white shadow-2xs">
                            <button
                              type="button"
                              onClick={() => adjustQty(color, size, -1)}
                              disabled={qty <= 0}
                              className="h-8 w-8 sm:h-7 sm:w-7 flex items-center justify-center rounded-l text-stone-600 hover:bg-stone-100 active:bg-stone-200 disabled:opacity-30 transition"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={qty === 0 ? '' : qty}
                              placeholder="0"
                              onChange={(e) => setQty(color, size, parseInt(e.target.value, 10) || 0)}
                              className="h-8 w-14 sm:h-7 sm:w-12 text-center text-xs font-bold text-stone-900 border-x border-stone-200 focus:outline-hidden"
                            />
                            <button
                              type="button"
                              onClick={() => adjustQty(color, size, 1)}
                              className="h-8 w-8 sm:h-7 sm:w-7 flex items-center justify-center rounded-r text-stone-600 hover:bg-stone-100 active:bg-stone-200 transition"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        </div>

                        {/* Row Total */}
                        <div className="min-w-[70px] sm:w-20 text-right text-xs font-bold text-stone-900">
                          {qty > 0 ? (
                            <span className="text-[#fa9d26]">₦{rowTotal.toLocaleString()}</span>
                          ) : (
                            <span className="text-stone-300 font-normal">₦0</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })}
          </div>
        </div>

        {/* Sticky Footer with Progress & Add Button */}
        <div className="border-t border-stone-200 bg-stone-50 p-4 space-y-3">
          {/* Progress bar towards MOQ */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-stone-700">
                Selected for this design: <strong className="text-stone-900">{totalSelected}</strong> pcs
              </span>
              {moqScope === 'category' ? (
                <span className="text-[11px] font-bold text-stone-700">
                  Category total across designs: <strong>{totalTowardsCategory}</strong> / {moq} pcs
                </span>
              ) : (
                <span className={`text-[11px] font-bold ${totalSelected >= moq ? 'text-emerald-700' : 'text-[#d97706]'}`}>
                  {totalSelected >= moq
                    ? 'Item MOQ Reached!'
                    : `Need ${moq - totalSelected} more pcs to reach ${moq} pcs MOQ`}
                </span>
              )}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
              <div
                className={`h-full transition-all duration-300 ${
                  progressPercent >= 100 ? 'bg-emerald-600' : 'bg-[#fa9d26]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center justify-between sm:block">
              <div className="text-[11px] text-stone-500">Subtotal for Selected:</div>
              <div className="text-base sm:text-lg font-extrabold text-stone-900">
                ₦{(totalSelected * Number(product.wholesale_price)).toLocaleString()}
              </div>
            </div>

            <button
              type="button"
              disabled={totalSelected === 0}
              onClick={handleConfirm}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-[#fa9d26] px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#e68c1d] disabled:opacity-40 active:scale-98"
            >
              <Check className="h-4 w-4" />
              Add {totalSelected} Pieces to Preorder Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// Resolve each shipping method independently; blank or zero never falls back to the other method.
function getProductShippingFees(product: Product): { air: number; sea: number } {
  if (product.description) {
    const airMatch = product.description.match(/<!--dainty_ship_air:([0-9]+(?:\.[0-9]+)?)-->/);
    const seaMatch = product.description.match(/<!--dainty_ship_sea:([0-9]+(?:\.[0-9]+)?)-->/);
    if (airMatch !== null || seaMatch !== null) {
      return {
        air: airMatch ? Number(airMatch[1]) : 0,
        sea: seaMatch ? Number(seaMatch[1]) : 0,
      };
    }
  }

  const hasAir = product.est_shipping_fee_air !== undefined && product.est_shipping_fee_air !== null;
  const hasSea = product.est_shipping_fee_sea !== undefined && product.est_shipping_fee_sea !== null;
  if (hasAir || hasSea) {
    return {
      air: hasAir && Number(product.est_shipping_fee_air) > 0 ? Number(product.est_shipping_fee_air) : 0,
      sea: hasSea && Number(product.est_shipping_fee_sea) > 0 ? Number(product.est_shipping_fee_sea) : 0,
    };
  }

  // A legacy generic fee does not identify Air vs Sea, so fail safe and show neither as available.
  return { air: 0, sea: 0 };
}

function cleanProductDescription(description?: string | null): string {
  return (description || '')
    .replace(/<!--dainty_[\s\S]*?-->/g, '')
    .replace(/(?:^|\s*[•|]\s*)(?:sizes?|models?):\s*[^•\n]*/gi, '')
    .replace(/(?:^|\s*[•|]\s*)colors?:\s*[^•\n]*/gi, '')
    .replace(/(?:^|\s*[•|]\s*)shipping:\s*(?:sea|air)\s+cargo\s+only/gi, '')
    .replace(/(?:^|\s*[•|]\s*)(?:wholesale\s+)?moq:\s*[^•\n]*/gi, '')
    .replace(/(?:^|\s*[•|]\s*)(?:moq\s+)?scope:\s*[^•\n]*/gi, '')
    .replace(/(?:^|\s*[•|]\s*)minimum\s+order(?:\s+quantity)?:\s*[^•\n]*/gi, '')
    .replace(/(?:^|\s*[•|]\s*)category\s+moq:\s*[^•\n]*/gi, '')
    .replace(/(?:\s*•\s*){2,}/g, ' • ')
    .replace(/^\s*•\s*|\s*•\s*$/g, '')
    .trim();
}

function getDescriptionList(description: string | null | undefined, field: 'sizes' | 'colors'): string[] {
  if (!description) return [];
  const match = description.match(new RegExp(`<!--dainty_${field}:(.*?)-->`));
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      // Continue to the human-readable legacy description fallback below.
    }
  }
  const label = field === 'sizes' ? '(?:sizes?|models?)' : 'colors?';
  const legacy = description.match(new RegExp(`${label}:\\s*([^•\\n]+)`, 'i'));
  return legacy?.[1]
    ? legacy[1].split(/[,/|;]+/).map((item) => item.trim()).filter(Boolean)
    : [];
}

function getProductAllImages(product: Product | null | undefined): string[] {
  if (!product) return [];
  const list: string[] = [];

  const add = (url: unknown) => {
    if (typeof url === 'string') {
      const clean = url.trim();
      if (clean && !list.includes(clean)) list.push(clean);
    }
  };

  add(product.image_url);

  // Check product.images array or string
  if (Array.isArray(product.images)) {
    for (const img of product.images) add(img);
  } else if (typeof product.images === 'string') {
    try {
      const parsed = JSON.parse(product.images);
      if (Array.isArray(parsed)) {
        for (const img of parsed) add(img);
      } else {
        add(product.images);
      }
    } catch {
      for (const part of (product.images as string).split(',')) {
        add(part);
      }
    }
  }

  // Check embedded fallback in description
  if (product.description && product.description.includes('<!--dainty_images:')) {
    try {
      const match = product.description.match(/<!--dainty_images:(.*?)-->/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          for (const img of parsed) add(img);
        }
      }
    } catch {}
  }

  // Check variants
  if (Array.isArray(product.variants)) {
    for (const v of product.variants) {
      if (v?.image_url) add(v.image_url);
    }
  }

  return list;
}

function ProductCard({
  product,
  mode,
  categoryMap,
  onAddToCart,
  onOpenMatrix,
  onZoomImage,
}: {
  product: Product;
  mode: 'retail' | 'wholesale';
  categoryMap: Map<string, Category>;
  onAddToCart: (
    product: Product,
    selectedColor: string | null,
    selectedSize: string | null,
    selectedImage: string | null,
    quantity: number
  ) => void;
  onOpenMatrix: (product: Product) => void;
  onZoomImage: (url: string) => void;
}) {
  const productTitle = product.name || product.title || 'Product';
  const displayPrice = mode === 'wholesale' ? product.wholesale_price : product.retail_price;
  const cat = product.category_id ? (categoryMap.get(String(product.category_id)) || categoryMap.get(product.category_id)) : null;
  const moq = getProductWholesaleMOQ(product, cat);
  const moqScope = getProductMOQScope(product, cat);

  // Gather all available images with deep array/fallback parsing
  const allImages = useMemo(() => getProductAllImages(product), [product]);

  const cleanDescription = useMemo(
    () => cleanProductDescription(product.description),
    [product.description]
  );

  // Gather all available color options (optional)
  const allColors = useMemo(() => {
    const list: string[] = [];
    const addColor = (val: unknown) => {
      if (!val) return;
      const str = String(val).trim();
      if (!str) return;
      const parts = str.split(/[,/|;\n]+/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed && !list.includes(trimmed)) list.push(trimmed);
      }
    };

    if (Array.isArray(product.colors)) {
      for (const c of product.colors) addColor(c);
    }
    if (product.color_options) {
      addColor(product.color_options);
    }
    if (Array.isArray(product.variants)) {
      for (const v of product.variants) {
        if (v?.color) addColor(v.color);
      }
    }
    if (list.length === 0) {
      for (const color of getDescriptionList(product.description, 'colors')) addColor(color);
    }
    return list;
  }, [product]);

  // Gather all available size/model options (optional)
  const allSizes = useMemo(() => {
    const list: string[] = [];
    const addSize = (val: unknown) => {
      if (!val) return;
      const str = String(val).trim();
      if (!str) return;
      const parts = str.split(/[,/|;\n]+/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed && !list.includes(trimmed)) list.push(trimmed);
      }
    };

    if (Array.isArray(product.sizes)) {
      for (const s of product.sizes) addSize(s);
    }
    if (product.size_options) {
      addSize(product.size_options);
    }
    if (product.size) {
      addSize(product.size);
    }
    if (Array.isArray(product.variants)) {
      for (const v of product.variants) {
        if (v?.size) addSize(v.size);
      }
    }
    if (list.length === 0) {
      for (const size of getDescriptionList(product.description, 'sizes')) addSize(size);
    }
    return list;
  }, [product]);

  const hasVariants = allSizes.length > 0 || allColors.length > 0;

  const [activeImage, setActiveImage] = useState<string>(allImages[0] || '');
  const [selectedColor, setSelectedColor] = useState<string | null>(allColors[0] || null);
  const [selectedSize, setSelectedSize] = useState<string | null>(allSizes[0] || product.size || null);

  // For category-level wholesale minimums, start at 1 piece so buyers can choose quantities per design
  // For wholesale per-item MOQ, start at 1 if matrix/variants exist, or moq if no variants
  const defaultQty = mode === 'wholesale' ? (moqScope === 'item' ? (hasVariants ? 1 : moq) : 1) : 1;
  const [orderQty, setOrderQty] = useState<number>(defaultQty);

  // Active image falls back safely to first photo if current active is invalid
  const displayActiveImage = (activeImage && allImages.includes(activeImage)) ? activeImage : (allImages[0] || '');

  function handleSelectColor(colorName: string, index?: number) {
    setSelectedColor(colorName);
    if (typeof index === 'number' && allImages[index]) {
      setActiveImage(allImages[index]);
    }
  }

  const { air: airFee, sea: seaFee } = getProductShippingFees(product);
  const hasAir = airFee > 0;
  const hasSea = seaFee > 0;

    return (
    <div className="group flex flex-col justify-between overflow-hidden rounded-xl sm:rounded-2xl border border-stone-200/90 bg-white shadow-2xs hover:shadow-md hover:border-[#fa9d26]/50 transition-all duration-200">
      <div>
        {/* Crisp product image container with Temu style badges and Zoom */}
        <div className="relative aspect-square w-full overflow-hidden bg-stone-50 flex items-center justify-center p-2 sm:p-3 group/img">
          {activeImage ? (
            <img
              src={activeImage}
              alt={productTitle}
              onClick={() => onZoomImage(activeImage)}
              className="max-h-full max-w-full object-contain cursor-pointer transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-stone-400">
              No image
            </div>
          )}

          {/* Carousel Arrows and Indicator for multiple photos */}
          {allImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const curIdx = allImages.indexOf(activeImage);
                  const nextIdx = curIdx <= 0 ? allImages.length - 1 : curIdx - 1;
                  setActiveImage(allImages[nextIdx]);
                  if (allColors[nextIdx]) setSelectedColor(allColors[nextIdx]);
                }}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-white/95 text-stone-800 shadow-md flex items-center justify-center hover:bg-white hover:scale-110 transition z-10 opacity-90 sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const curIdx = allImages.indexOf(activeImage);
                  const nextIdx = curIdx >= allImages.length - 1 ? 0 : curIdx + 1;
                  setActiveImage(allImages[nextIdx]);
                  if (allColors[nextIdx]) setSelectedColor(allColors[nextIdx]);
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-white/95 text-stone-800 shadow-md flex items-center justify-center hover:bg-white hover:scale-110 transition z-10 opacity-90 sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                aria-label="Next photo"
              >
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              <span className="absolute top-2 right-2 rounded-full bg-stone-900/80 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-white shadow-xs backdrop-blur-xs z-10">
                {Math.max(1, allImages.indexOf(displayActiveImage) + 1)} / {allImages.length}
              </span>
            </>
          )}

          {activeImage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onZoomImage(displayActiveImage);
              }}
              title="Click to view full photo clearly"
              className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-stone-900/80 px-1.5 py-0.5 sm:px-2 sm:py-1 text-[10px] sm:text-[11px] font-medium text-white opacity-0 backdrop-blur-xs transition group-hover:opacity-100 hover:bg-stone-900 z-10 cursor-pointer"
            >
              <Maximize2 className="h-3 w-3" />
              <span className="hidden sm:inline">Zoom</span>
            </button>
          )}

          {/* Product Badges (Temu style tag) */}
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-10">
            {mode === 'wholesale' ? (
              <span className="rounded-md bg-[#fa9d26] px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-extrabold text-white shadow-xs tracking-wide uppercase">
                {moqScope === 'category'
                  ? `Mix MOQ: ${moq}`
                  : `MOQ: ${moq} pcs`}
              </span>
            ) : (
              <span className="rounded-md bg-stone-900/90 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-white shadow-xs tracking-wide uppercase">
                Factory Direct
              </span>
            )}
            {!hasAir && (
              <span className="rounded-md bg-red-600/90 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium text-white shadow-xs">
                No Air
              </span>
            )}
            {!hasSea && (
              <span className="rounded-md bg-red-600/90 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium text-white shadow-xs">
                No Sea
              </span>
            )}
          </div>
        </div>

        {/* Thumbnail switcher if multiple images exist */}
        {allImages.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto border-t border-stone-100 bg-stone-50/60 p-1.5 sm:p-2">
            {allImages.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setActiveImage(img);
                  if (allColors[idx]) setSelectedColor(allColors[idx]);
                }}
                className={`relative h-8 w-8 sm:h-10 sm:w-10 shrink-0 overflow-hidden rounded-md border bg-white p-0.5 transition ${
                  activeImage === img ? 'border-[#fa9d26] ring-2 ring-[#fa9d26]/20' : 'border-stone-200 opacity-70 hover:opacity-100'
                }`}
              >
                <img src={img} alt={`Angle ${idx + 1}`} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}

        {/* Product Details (Temu High-Density Typography) */}
        <div className="p-2.5 sm:p-4">
          {cat && (
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#b86200] block">
              {cat.name}
            </span>
          )}
          <h2 className="mt-0.5 text-xs sm:text-sm font-semibold text-stone-900 line-clamp-2 leading-snug group-hover:text-[#fa9d26] transition-colors min-h-[2rem] sm:min-h-[2.5rem]">
            {productTitle}
          </h2>

          {/* Temu Style Price Highlight */}
          <div className="mt-1.5">
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-sm sm:text-lg font-black text-[#fa9d26] tracking-tight">
                ₦{Number(displayPrice).toLocaleString()}
              </span>
              {mode === 'wholesale' ? (
                <span className="text-[10px] sm:text-xs font-semibold text-stone-500">/ piece (bulk)</span>
              ) : (
                <span className="text-[10px] sm:text-xs font-medium text-stone-400">retail</span>
              )}
            </div>

            {/* Compact Shipping Estimates */}
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] sm:text-[11px]">
              {hasAir ? (
                <span className="text-stone-600 font-medium">Air: ₦{airFee.toLocaleString()}</span>
              ) : (
                <span className="text-red-500 font-medium">No Air shipping</span>
              )}
              <span className="text-stone-300">•</span>
              {hasSea ? (
                <span className="text-stone-600 font-medium">Sea: ₦{seaFee.toLocaleString()}</span>
              ) : (
                <span className="text-red-500 font-medium">No Sea shipping</span>
              )}
            </div>
          </div>

          {/* Size / Model chips only if sizes exist */}
          {allSizes.length > 1 ? (
            <div className="mt-2.5">
              <span className="text-[10px] sm:text-[11px] font-medium text-stone-600 block mb-1">
                Size: <span className="font-bold text-stone-900">{selectedSize || 'Select'}</span>
              </span>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-0.5">
                {allSizes.map((sz, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedSize(sz)}
                    className={`rounded-md px-2 py-0.5 text-[10px] sm:text-xs font-medium transition ${
                      selectedSize === sz
                        ? 'bg-[#fa9d26] text-white shadow-xs font-semibold'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          ) : allSizes.length === 1 ? (
            <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-stone-800 border border-stone-200">
              <span className="text-stone-500">Size:</span>
              <span className="font-bold text-stone-900">{allSizes[0]}</span>
            </div>
          ) : product.size ? (
            <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-stone-800 border border-stone-200">
              <span className="text-stone-500">Size:</span>
              <span className="font-bold text-stone-900">{product.size}</span>
            </div>
          ) : null}

          {/* Color chips only if colors exist */}
          {allColors.length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] sm:text-[11px] font-medium text-stone-600 block mb-1">
                Color: <span className="font-bold text-stone-900">{selectedColor || 'Select'}</span>
              </span>
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-0.5">
                {allColors.map((col, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectColor(col, idx)}
                    className={`rounded-md px-2 py-0.5 text-[10px] sm:text-xs font-medium transition ${
                      selectedColor === col
                        ? 'bg-stone-900 text-white shadow-xs font-semibold'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>
          )}

          {cleanDescription ? (
            <p className="mt-2 line-clamp-2 text-[10px] sm:text-xs text-stone-500">{cleanDescription}</p>
          ) : null}
        </div>
      </div>

      {/* Pricing & Actions */}
      <div className="border-t border-stone-100 p-2 sm:p-3 bg-stone-50/70 space-y-2">
        {/* Quantity Stepper */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] sm:text-xs font-bold text-stone-600">Qty</span>
          <div className="flex items-center rounded-lg border border-stone-200 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setOrderQty((q) => Math.max(1, q - 1))}
              className="h-5 w-5 sm:h-6 sm:w-6 flex items-center justify-center rounded text-stone-600 hover:bg-stone-100 active:scale-95"
              title="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-[11px] sm:text-xs font-bold text-stone-900 px-1.5 sm:px-2 min-w-[22px] sm:min-w-[28px] text-center">
              {orderQty}
            </span>
            <button
              type="button"
              onClick={() => setOrderQty((q) => q + 1)}
              className="h-5 w-5 sm:h-6 sm:w-6 flex items-center justify-center rounded text-stone-600 hover:bg-stone-100 active:scale-95"
              title="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Multi-Variant Batch Order button if item has variants in wholesale */}
        {mode === 'wholesale' && hasVariants && (
          <button
            type="button"
            onClick={() => onOpenMatrix(product)}
            className="w-full flex items-center justify-center gap-1 rounded-lg sm:rounded-xl bg-stone-900 hover:bg-stone-800 text-white py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition shadow-xs active:scale-98"
          >
            <Layers className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-[#fa9d26]" />
            <span>Batch Order</span>
          </button>
        )}

        {/* Temu Style Orange Add to Preorder Cart Button */}
        <button
          type="button"
          onClick={() => onAddToCart(product, selectedColor, selectedSize, displayActiveImage, orderQty)}
          className="w-full flex items-center justify-center gap-1 rounded-lg sm:rounded-xl bg-[#fa9d26] hover:bg-[#e68a15] text-white py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold transition shadow-xs active:scale-98"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add {orderQty} to Cart</span>
        </button>
      </div>
    </div>
  );
}


const CART_STORAGE_KEY = 'dainty_preorder_cart_v1';


function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function getCleanWhatsAppPhone(raw?: string | null): string {
  const digits = (raw || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    return '234' + digits.slice(1);
  }
  return digits;
}

export default function StorefrontPage() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [mode, setMode] = useState<'retail' | 'wholesale'>('retail');
  const [shippingMethod, setShippingMethod] = useState<'air' | 'sea'>('air');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isCategoriesOnlyView, setIsCategoriesOnlyView] = useState<boolean>(false);

  const selectedCategoryName = useMemo(() => {
    if (selectedCategory === 'all') return 'All Products';
    const cat = categories.find((c) => c.id === selectedCategory);
    return cat?.name || 'Category';
  }, [selectedCategory, categories]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const totalCartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
    const [matrixProduct, setMatrixProduct] = useState<Product | null>(null);
  const [loadedOrderNotice, setLoadedOrderNotice] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [activeOrderId, setActiveOrderId] = useState<string>('');
  // Custom item sourcing request modal state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestItemName, setRequestItemName] = useState('');
  const [requestOrderType, setRequestOrderType] = useState<'retail' | 'wholesale'>('wholesale');
  const [requestQuantity, setRequestQuantity] = useState('');
  const [requestShipping, setRequestShipping] = useState<'air' | 'sea' | 'either'>('air');
  const [requestNotes, setRequestNotes] = useState('');

  function buildDirectWhatsAppChatUrl(customText?: string) {
    const cleanPhone = getCleanWhatsAppPhone(settings?.whatsapp_number);
    const text = encodeURIComponent(
      customText || 'Hello Dainty Import, I would like to make an inquiry about China preorders.'
    );
    return cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
  }

  function handleSendCustomRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requestItemName.trim()) return;

    const lines: string[] = [
      `*Custom Sourcing Request - Dainty Import*`,
      '',
      `*Item Description:* ${requestItemName.trim()}`,
      `*Order Type:* ${requestOrderType === 'wholesale' ? 'Wholesale (Bulk Purchase)' : 'Retail'}`,
      requestQuantity.trim() ? `*Quantity Needed:* ${requestQuantity.trim()}` : '',
      `*Preferred Shipping:* ${
        requestShipping === 'air'
          ? 'Air Cargo (Within 3 weeks)'
          : requestShipping === 'sea'
          ? 'Sea Cargo (Within 3 months)'
          : 'Air or Sea (Best rate)'
      }`,
      requestNotes.trim() ? `*Details / Specifications:* ${requestNotes.trim()}` : '',
      '',
      `Hello Dainty Import, please help me source this item from China suppliers and give me a price quotation.`,
    ].filter(Boolean);

    const cleanPhone = getCleanWhatsAppPhone(settings?.whatsapp_number);
    const encoded = encodeURIComponent(lines.join('\n'));
    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setIsRequestModalOpen(false);
    setRequestItemName('');
    setRequestNotes('');
    setRequestQuantity('');
  }


  const [orderPaymentConfirmed, setOrderPaymentConfirmed] = useState(false);

  // Sync real-time payment status for active preorder
  useEffect(() => {
    if (!activeOrderId) {
      setOrderPaymentConfirmed(false);
      return;
    }
    let active = true;
    async function checkPaymentStatus() {
      try {
        const { data } = await supabase
          .from('preorders')
          .select('status, payment_date')
          .eq('id', activeOrderId)
          .maybeSingle();
        if (active && data) {
          const s = String(data.status || '').toLowerCase().trim();
          const paid = ['paid', 'ordered', 'shipped', 'ready_for_delivery', 'delivered'].includes(s) || Boolean(data.payment_date);
          setOrderPaymentConfirmed(paid);
        }
      } catch (e) {
        console.warn('Check payment status error:', e);
      }
    }
    checkPaymentStatus();

    const channel = supabase
      .channel(`cart_status_${activeOrderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'preorders', filter: `id=eq.${activeOrderId}` },
        (payload) => {
          if (active && payload.new) {
            const s = String((payload.new as { status?: string }).status || '').toLowerCase().trim();
            const paid = ['paid', 'ordered', 'shipped', 'ready_for_delivery', 'delivered'].includes(s) || Boolean((payload.new as { payment_date?: string }).payment_date);
            setOrderPaymentConfirmed(paid);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [activeOrderId]);
  const isInitialCartLoadRef = useRef(false);

  useEffect(() => {
    async function loadStoreData() {
      setLoading(true);
      setErrorMsg(null);

      const [settingsRes, categoriesRes, productsRes] = await Promise.all([
        supabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('categories').select('*').order('name', { ascending: true }),
        supabase.from('products').select('*').order('created_at', { ascending: false }),
      ]);

      if (settingsRes.error || categoriesRes.error || productsRes.error) {
        setErrorMsg(
          settingsRes.error?.message ||
            categoriesRes.error?.message ||
            productsRes.error?.message ||
            'Could not load store data from Supabase.'
        );
      } else {
        setSettings(settingsRes.data);
        const fetchedCats: Category[] = categoriesRes.data || [];
        const normalizedCats = fetchedCats.map((cat) => {
          const n = (cat.name || cat.slug || '').toLowerCase();
          // Strictly for iPhone Cases category, always 50 pieces and category-wide MOQ
          if (n.includes('iphone') || (n.includes('case') && !n.includes('briefcase') && !n.includes('suitcase'))) {
            return { ...cat, wholesale_moq: 50, moq_scope: 'category' as const };
          }
          return cat;
        });

        // Proactively synchronize Supabase category record so it never reverts to 10
        const iphoneCatRecord = fetchedCats.find((c) => {
          const n = (c.name || c.slug || '').toLowerCase();
          return n.includes('iphone') || (n.includes('case') && !n.includes('briefcase') && !n.includes('suitcase'));
        });
        if (iphoneCatRecord && (Number(iphoneCatRecord.wholesale_moq) !== 50 || iphoneCatRecord.moq_scope !== 'category')) {
          supabase
            .from('categories')
            .update({ wholesale_moq: 50, moq_scope: 'category' })
            .eq('id', iphoneCatRecord.id)
            .then(() => {
              supabase
                .from('products')
                .update({ wholesale_moq: 50, min_order_qty: 50, moq_scope: 'category' })
                .eq('category_id', iphoneCatRecord.id);
            });
        }
        setCategories(normalizedCats);
        setProducts(productsRes.data || []);
      }
      setLoading(false);
    }

    loadStoreData();
  }, []);


  // Restore cart from URL (?order=...) or local phone storage so cart persists across page reloads
  useEffect(() => {
    if (products.length === 0 || typeof window === 'undefined') return;

    // 1. Check if there is a shared order in the URL (?order=... or ?cart=...)
    const urlParams = new URLSearchParams(window.location.search);
    const orderParam = urlParams.get('order') || urlParams.get('cart');

    if (orderParam) {
      try {
        const decoded = decodeURIComponent(orderParam);
        const json = decodeURIComponent(atob(decoded));
        const data = JSON.parse(json);

        if (data && Array.isArray(data.c)) {
          const restoredCart: CartItem[] = [];
          for (const item of data.c) {
            const prod = products.find((p) => p.id === item.p);
            if (prod) {
              restoredCart.push({
                product: prod,
                quantity: Number(item.q) || 1,
                selectedSize: item.s || null,
                selectedColor: item.c || null,
                selectedImage: item.img || null,
              });
            }
          }

          if (restoredCart.length > 0) {
            setTimeout(() => {
              setCart(restoredCart);
              if (data.m === 'wholesale' || data.m === 'retail') {
                setMode(data.m);
              }
              if (data.sm === 'air' || data.sm === 'sea') {
                setShippingMethod(data.sm);
              }
              setIsCartOpen(true);
              setLoadedOrderNotice(`Viewing shared order (${restoredCart.length} item${restoredCart.length > 1 ? 's' : ''})`);
            }, 0);
            isInitialCartLoadRef.current = true;
            return;
          }
        }
      } catch (err) {
        console.error('Failed to parse shared cart parameter:', err);
      }
    }

    // 2. If no shared URL parameter, restore saved cart from phone / browser localStorage
    if (!isInitialCartLoadRef.current) {
      try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved && Array.isArray(saved.items)) {
            const restoredCart: CartItem[] = [];
            for (const item of saved.items) {
              const prod = products.find((p) => p.id === item.productId);
              if (prod) {
                restoredCart.push({
                  product: prod,
                  quantity: Number(item.quantity) || 1,
                  selectedSize: item.selectedSize || null,
                  selectedColor: item.selectedColor || null,
                  selectedImage: item.selectedImage || null,
                });
              }
            }
            if (restoredCart.length > 0) {
              const rCart = restoredCart;
              const rMode = saved.mode;
              const rShip = saved.shippingMethod;
              setTimeout(() => {
                setCart(rCart);
                if (rMode === 'wholesale' || rMode === 'retail') {
                  setMode(rMode);
                }
                if (rShip === 'air' || rShip === 'sea') {
                  setShippingMethod(rShip);
                }
              }, 0);
            }
          }
        }
      } catch (err) {
        console.warn('Could not restore cart from localStorage:', err);
      } finally {
        isInitialCartLoadRef.current = true;
      }
    }
  }, [products]);

  // Save cart, pricing mode, and shipping method to phone/browser localStorage whenever updated
  useEffect(() => {
    if (!isInitialCartLoadRef.current || typeof window === 'undefined') return;
    try {
      const payload = {
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          selectedSize: i.selectedSize || null,
          selectedColor: i.selectedColor || null,
          selectedImage: i.selectedImage || null,
        })),
        mode,
        shippingMethod,
        updatedAt: Date.now(),
      };
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save cart to localStorage:', e);
    }
  }, [cart, mode, shippingMethod]);



  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory;
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const title = (p.name || p.title || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const sizeStr = (p.size || '').toLowerCase();
      const colorStr = (p.color_options || (p.colors || []).join(' ')).toLowerCase();

      return title.includes(q) || desc.includes(q) || sizeStr.includes(q) || colorStr.includes(q);
    });
  }, [products, selectedCategory, searchQuery]);

  // Group quantities by category to support category-level wholesale MOQ
  const categoryQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      const cId = item.product.category_id || 'uncategorized';
      map.set(cId, (map.get(cId) || 0) + item.quantity);
    }
    return map;
  }, [cart]);

  // A method is unavailable if any item in the cart has a blank or zero estimate for it.
  // Keep the customer's selected method unchanged; never silently switch to the other method.
  const cartHasSeaOnlyItems = useMemo(() => {
    return cart.some((item) => getProductShippingFees(item.product).air <= 0);
  }, [cart]);

  const cartHasAirOnlyItems = useMemo(() => {
    return cart.some((item) => getProductShippingFees(item.product).sea <= 0);
  }, [cart]);

  const cartHasUnavailableSelectedMethod =
    shippingMethod === 'air' ? cartHasSeaOnlyItems : cartHasAirOnlyItems;

  function addToCart(
    product: Product,
    selectedColor: string | null,
    selectedSize: string | null,
    selectedImage: string | null,
    quantityToAdd: number
  ) {
    setIsCartOpen(true);
    setCart((prev) => {
      const matchItem = (item: CartItem) =>
        item.product.id === product.id &&
        (item.selectedColor || '') === (selectedColor || '') &&
        (item.selectedSize || '') === (selectedSize || '');

      const existing = prev.find(matchItem);
      if (existing) {
        return prev.map((item) =>
          matchItem(item) ? { ...item, quantity: item.quantity + quantityToAdd } : item
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: quantityToAdd,
          selectedColor: selectedColor || null,
          selectedSize: selectedSize || product.size || null,
          selectedImage: selectedImage || product.image_url || null,
        },
      ];
    });
  }

  function handleAddBatchToCart(
    product: Product,
    variants: { color: string | null; size: string | null; quantity: number }[]
  ) {
    for (const v of variants) {
      if (v.quantity > 0) {
        addToCart(product, v.color, v.size, product.image_url, v.quantity);
      }
    }
  }

  function updateQuantity(
    productId: string,
    selectedColor: string | null | undefined,
    selectedSize: string | null | undefined,
    delta: number
  ) {
    setCart((prev) =>
      prev
        .map((item) => {
          const isMatch =
            item.product.id === productId &&
            (item.selectedColor || '') === (selectedColor || '') &&
            (item.selectedSize || '') === (selectedSize || '');
          return isMatch ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item;
        })
        .filter((item) => item.quantity > 0)
    );
  }

  function removeItem(
    productId: string,
    selectedColor: string | null | undefined,
    selectedSize: string | null | undefined
  ) {
    setCart((prev) =>
      prev.filter(
        (item) =>
          !(
            item.product.id === productId &&
            (item.selectedColor || '') === (selectedColor || '') &&
            (item.selectedSize || '') === (selectedSize || '')
          )
      )
    );
  }

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const price =
        mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price;
      return sum + Number(price || 0) * item.quantity;
    }, 0);
  }, [cart, mode]);

  // Shipping fees purely based on per-item estimate, NO weight calculation
  const estimatedShipping = useMemo(() => {
    return cart.reduce((sum, item) => {
      const { air: airFee, sea: seaFee } = getProductShippingFees(item.product);
      const perItemFee = shippingMethod === 'air' ? airFee : seaFee;
      return sum + perItemFee * item.quantity;
    }, 0);
  }, [cart, shippingMethod]);

  // Shipping timelines: Air within 3 weeks, Sea within 3 months
  const shippingTimeline = shippingMethod === 'air' ? 'Within 3 weeks' : 'Within 3 months';

  // Generate unique short order reference ID for active cart
  useEffect(() => {
    if (cart.length > 0 && !activeOrderId) {
      const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      let id = 'ORD-';
      for (let i = 0; i < 5; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const timer = setTimeout(() => setActiveOrderId(id), 0);
      return () => clearTimeout(timer);
    } else if (cart.length === 0 && activeOrderId) {
      const timer = setTimeout(() => setActiveOrderId(''), 0);
      return () => clearTimeout(timer);
    }
  }, [cart, activeOrderId]);

  // Sync active preorder to Supabase preorders table and localStorage for short catalog link
    // Save order to Supabase ONLY when customer explicitly clicks Checkout
  async function saveCheckoutOrderToSupabase(orderId: string) {
    if (!orderId || cart.length === 0) return;

    const orderRecord = {
      id: orderId,
      items: cart.map((i) => ({
        productId: i.product.id,
        title: i.product.name || i.product.title || 'Product',
        price: mode === 'wholesale' ? i.product.wholesale_price : i.product.retail_price,
        quantity: i.quantity,
        selectedSize: i.selectedSize || null,
        selectedColor: i.selectedColor || null,
        selectedImage: i.selectedImage || i.product.image_url || (i.product.images && i.product.images[0]) || null,
        estShippingAir: getProductShippingFees(i.product).air,
        estShippingSea: getProductShippingFees(i.product).sea,
      })),
      total_pieces: totalCartCount,
      total_amount: subtotal,
      mode,
      shipping_method: shippingMethod,
      est_shipping_fee: estimatedShipping,
      shipping_timeline: shippingTimeline,
      status: 'unpaid',
      created_at: new Date().toISOString(),
    };

    try {
      localStorage.setItem(`dainty_order_${orderId}`, JSON.stringify(orderRecord));
    } catch (e) {
      console.warn('LocalStorage order save error:', e);
    }

    try {
      await supabase.from('preorders').upsert([orderRecord]);
    } catch (err) {
      console.warn('Supabase preorders notice:', err);
    }
  }

  // Check Wholesale MOQ requirements for Item-Level (default) and Category-Level scopes
  const wholesaleMoqWarnings = useMemo(() => {
    if (mode !== 'wholesale') return [];
    const warnings: { name: string; required: number; current: number; scope: 'item' | 'category' }[] = [];

    // Group 1: Product-level quantities
    const productQtyMap = new Map<string, number>();
    for (const item of cart) {
      productQtyMap.set(item.product.id, (productQtyMap.get(item.product.id) || 0) + item.quantity);
    }

    // Group 2: Category-level quantities
    const categoryQtyMap = new Map<string, number>();
    for (const item of cart) {
      const cId = item.product.category_id || 'uncategorized';
      categoryQtyMap.set(cId, (categoryQtyMap.get(cId) || 0) + item.quantity);
    }

    // Track checked categories to avoid duplicate warnings
    const checkedCategories = new Set<string>();

    for (const [prodId, totalQty] of productQtyMap.entries()) {
      const item = cart.find((c) => c.product.id === prodId);
      if (!item) continue;

      const cat = item.product.category_id ? categoryMap.get(item.product.category_id) : null;
      const moq = getProductWholesaleMOQ(item.product, cat);
      const scope = getProductMOQScope(item.product, cat);

      if (scope === 'category') {
        const catId = item.product.category_id || 'uncategorized';
        if (!checkedCategories.has(catId)) {
          checkedCategories.add(catId);
          const catTotal = categoryQtyMap.get(catId) || 0;
          if (catTotal < moq) {
            warnings.push({
              name: `${cat?.name || 'Category'} Bulk Purchase`,
              required: moq,
              current: catTotal,
              scope: 'category',
            });
          }
        }
      } else {
        // Per-item MOQ by default
        if (totalQty < moq) {
          warnings.push({
            name: item.product.name || item.product.title || 'Product',
            required: moq,
            current: totalQty,
            scope: 'item',
          });
        }
      }
    }

    return warnings;
  }, [cart, mode, categoryMap]);


  function buildShareableCartUrl(): string {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const id = activeOrderId || 'ORD-NEW';
    return `${origin}/order?id=${id}`;
  }

  function handleCopyCartLink() {
    const url = buildShareableCartUrl();
    if (url && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  }

  function buildWhatsAppLink() {
    const cleanPhone = getCleanWhatsAppPhone(settings?.whatsapp_number);
    const shareableLink = buildShareableCartUrl();

    const lines: string[] = [
      `*Dainty Preorder*`,
      activeOrderId ? `*Order Ref:* #${activeOrderId}` : '',
      '',
      `*Total Items Ordered:* ${cart.length} item${cart.length === 1 ? '' : 's'}`,
      `*Total Pieces:* ${totalCartCount} pcs`,
      `*Total Product Price:* ₦${subtotal.toLocaleString()}`,
      `*Shipping Method:* ${shippingMethod.toUpperCase()} (Shipping Time Frame: ${shippingTimeline})`,
      `*Est. Shipping Fee:* ${estimatedShipping > 0 ? `₦${estimatedShipping.toLocaleString()}` : 'To be confirmed upon arrival in Nigeria'}`,
      '',
      `*View Order:*`,
      shareableLink,
    ].filter(Boolean);

    const encoded = encodeURIComponent(lines.join('\n'));
    return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }


  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-stone-50 text-stone-900 flex flex-col">
      {/* Lightbox / Zoom modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs transition"
          onClick={() => setZoomedImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-white p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute top-3 right-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black transition"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={zoomedImage}
              alt="High resolution product view"
              className="max-h-[82vh] max-w-[85vw] object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      {/* Wholesale Variant Order Sheet Modal */}
      {matrixProduct && (
        <MatrixOrderModal
          product={matrixProduct}
          category={matrixProduct.category_id ? categoryMap.get(matrixProduct.category_id) : null}
          categoryQtyInCart={matrixProduct.category_id ? (categoryQtyMap.get(matrixProduct.category_id) || 0) : 0}
          onClose={() => setMatrixProduct(null)}
          onAddBatchToCart={(items) => handleAddBatchToCart(matrixProduct, items)}
          onZoomImage={(url) => setZoomedImage(url)}
        />
      )}

      {/* China Sourcing Announcement Strip */}
      <div className="bg-[#fa9d26] text-white text-[10px] sm:text-[11px] font-semibold py-1.5 px-3 sm:px-4 text-center tracking-wide leading-tight w-full">
        China Factory Direct Sourcing • Direct Factory Prices • Air Cargo ~3 Weeks • Sea Cargo ~3 Months • WhatsApp Order Confirmation
      </div>

      {/* Main Sticky Header */}
      <header className="sticky top-0 z-40 w-full border-b border-stone-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3.5 py-2.5 sm:px-6 sm:py-3 gap-2">
          {/* Logo & Brand Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <img
              src="/logo.png"
              alt="Dainty Import"
              className="h-8 w-auto sm:h-9 rounded-md object-contain shadow-xs border border-[#fa9d26]/20"
            />
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-stone-900 leading-tight">Dainty Import</h1>
              <p className="text-[9px] sm:text-[11px] font-semibold text-[#fa9d26] uppercase tracking-wider">
                China Direct Preorders
              </p>
            </div>
          </div>

          {/* Categories directory button */}
          <button
            type="button"
            onClick={() => {
              setIsCategoriesOnlyView((prev) => !prev);
              if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`shrink-0 inline-flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold transition shadow-2xs ${
              isCategoriesOnlyView
                ? 'bg-[#fa9d26] text-white shadow-xs'
                : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
            }`}
            title="Browse all product categories"
          >
            <Grid className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
            <span>Categories</span>
          </button>

          {/* Track order link */}
          <a
            href="/track"
            className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-bold text-stone-600 hover:bg-amber-50 hover:text-amber-800 transition"
          >
            Track
          </a>

          {/* Request Item Button */}
          <button
            type="button"
            onClick={() => {
              setRequestOrderType(mode);
              setRequestShipping(shippingMethod);
              setIsRequestModalOpen(true);
            }}
            className="shrink-0 inline-flex items-center gap-1 sm:gap-1.5 rounded-lg border border-amber-300 bg-amber-50/80 px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-amber-950 hover:bg-amber-100 hover:border-amber-400 transition shadow-2xs"
            title="Request any item to be sourced from China"
          >
            <span>Request Item</span>
          </button>

          {/* Direct WhatsApp Chat Header Link */}
          <a
            href={buildDirectWhatsAppChatUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1 sm:gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition shadow-2xs"
            title="Chat directly on WhatsApp"
            aria-label="WhatsApp Chat"
          >
            <WhatsAppIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-emerald-600 shrink-0" />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>

          {/* Mobile Cart Trigger on Top Header */}
          <button
            type="button"
            onClick={() => setIsCartOpen((prev) => !prev)}
            className="sm:hidden relative inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-800 shadow-2xs hover:border-[#fa9d26] transition active:scale-95 ml-auto"
            aria-label="Open Cart"
          >
            <ShoppingBag className="h-4 w-4 text-[#fa9d26]" />
            <span>Cart</span>
            {totalCartCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#fa9d26] px-1 text-[9px] font-bold text-white shadow-xs">
                {totalCartCount}
              </span>
            )}
          </button>

          {/* Desktop Search Bar */}
          <div className="relative flex-1 max-w-md hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); if (isCategoriesOnlyView) setIsCategoriesOnlyView(false); }}
              placeholder="Search China products, models, categories (e.g. cases, bags, accessories)..."
              className="w-full rounded-full border border-stone-200 bg-stone-50 pl-9 pr-4 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:border-[#fa9d26] focus:bg-white focus:outline-hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Desktop Mode & Shipping Switch */}
          <div className="hidden sm:flex items-center gap-2 text-xs">
            {/* Mode switch */}
            <div className="flex rounded-lg border border-stone-200 bg-stone-100 p-0.5">
              <button
                type="button"
                onClick={() => setMode('retail')}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  mode === 'retail' ? 'bg-white text-stone-900 shadow-xs font-semibold' : 'text-stone-600'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => setMode('wholesale')}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  mode === 'wholesale' ? 'bg-[#fa9d26] text-white font-bold shadow-xs' : 'text-stone-600'
                }`}
              >
                Wholesale (MOQ)
              </button>
            </div>

            {/* Shipping method switch */}
            <div className="flex rounded-lg border border-stone-200 bg-stone-100 p-0.5">
              <button
                type="button"
                disabled={cartHasSeaOnlyItems}
                onClick={() => setShippingMethod('air')}
                title={cartHasSeaOnlyItems ? 'At least one item has no Air shipping rate and cannot be shipped by air' : 'Air cargo delivery within 3 weeks'}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  cartHasSeaOnlyItems
                    ? 'opacity-40 cursor-not-allowed text-stone-400'
                    : shippingMethod === 'air'
                    ? 'bg-white text-stone-900 shadow-xs font-semibold'
                    : 'text-stone-600'
                }`}
              >
                <Plane className="h-4 w-4 text-emerald-600" />
                Air (3 wks)
              </button>
              <button
                type="button"
                disabled={cartHasAirOnlyItems}
                onClick={() => setShippingMethod('sea')}
                title={cartHasAirOnlyItems ? 'At least one item has no Sea shipping rate and cannot be shipped by sea' : 'Sea cargo delivery within 3 months'}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  cartHasAirOnlyItems
                    ? 'opacity-40 cursor-not-allowed text-stone-400'
                    : shippingMethod === 'sea'
                    ? 'bg-white text-stone-900 shadow-xs font-semibold'
                    : 'text-stone-600'
                }`}
              >
                <Ship className="h-4 w-4 text-blue-600" />
                Sea (3 mos)
              </button>
            </div>

            <a href="/track" className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:border-[#fa9d26] hover:text-amber-800">Track Order</a>

            {/* Desktop Cart Button */}
            <button
              type="button"
              onClick={() => setIsCartOpen((prev) => !prev)}
              className="relative inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 font-semibold text-stone-800 shadow-2xs hover:border-[#fa9d26] hover:bg-amber-50/40 transition active:scale-95"
              aria-label="View Cart"
            >
              <ShoppingBag className="h-4 w-4 text-[#fa9d26]" />
              <span>Cart</span>
              {totalCartCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#fa9d26] px-1 text-[10px] font-bold text-white shadow-xs">
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Header Sub-Bar: Responsive Controls on Mobile */}
        <div className="sm:hidden border-t border-stone-100 px-3 py-2 bg-stone-50/90 flex flex-col gap-2">
          {/* Mobile Mode & Shipping Switches */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex rounded-lg border border-stone-200 bg-stone-100 p-0.5">
              <button
                type="button"
                onClick={() => setMode('retail')}
                className={`flex-1 rounded-md py-1 text-center font-medium text-[11px] transition ${
                  mode === 'retail' ? 'bg-white text-stone-900 shadow-xs font-semibold' : 'text-stone-600'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => setMode('wholesale')}
                className={`flex-1 rounded-md py-1 text-center font-bold text-[11px] transition ${
                  mode === 'wholesale' ? 'bg-[#fa9d26] text-white shadow-xs' : 'text-stone-600'
                }`}
              >
                Wholesale (MOQ)
              </button>
            </div>

            <div className="flex rounded-lg border border-stone-200 bg-stone-100 p-0.5">
              <button
                type="button"
                disabled={cartHasSeaOnlyItems}
                onClick={() => setShippingMethod('air')}
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md py-1 text-center text-[11px] font-medium transition ${
                  cartHasSeaOnlyItems
                    ? 'opacity-40 cursor-not-allowed text-stone-400'
                    : shippingMethod === 'air'
                    ? 'bg-white text-stone-900 shadow-xs font-semibold'
                    : 'text-stone-600'
                }`}
              >
                <Plane className="h-3 w-3 text-emerald-600" />
                Air (3 wks)
              </button>
              <button
                type="button"
                disabled={cartHasAirOnlyItems}
                onClick={() => setShippingMethod('sea')}
                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md py-1 text-center text-[11px] font-medium transition ${
                  cartHasAirOnlyItems
                    ? 'opacity-40 cursor-not-allowed text-stone-400'
                    : shippingMethod === 'sea'
                    ? 'bg-white text-stone-900 shadow-xs font-semibold'
                    : 'text-stone-600'
                }`}
              >
                <Ship className="h-3 w-3 text-blue-600" />
                Sea (3 mos)
              </button>
            </div>
          </div>

          {/* Mobile Search Input */}
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); if (isCategoriesOnlyView) setIsCategoriesOnlyView(false); }}
              placeholder="Search products, models, categories..."
              className="w-full rounded-full border border-stone-200 bg-white pl-8 pr-4 py-1 text-xs text-stone-800 placeholder:text-stone-400 focus:border-[#fa9d26] focus:outline-hidden shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1.5 text-stone-400 hover:text-stone-600 p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-6xl px-3 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8 flex-1">
        {/* Dedicated Categories Only View */}
        {isCategoriesOnlyView ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-200 pb-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fa9d26]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#b86200] uppercase tracking-wider">
                  <Grid className="h-3 w-3" />
                  Categories
                </span>
                <h2 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
                  Select a Product Category
                </h2>
                <p className="mt-0.5 text-xs sm:text-sm text-stone-600">
                  Tap any category below to view only the direct China factory items in that category.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setIsCategoriesOnlyView(false);
                  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 shadow-2xs hover:bg-stone-50 transition active:scale-95"
              >
                <span>View All Products ({products.length})</span>
                <ChevronRight className="h-3.5 w-3.5 text-[#fa9d26]" />
              </button>
            </div>

            {/* Categories Grid */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4">
              {/* All Products Card */}
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setIsCategoriesOnlyView(false);
                  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`group flex flex-col items-center justify-center rounded-2xl border p-4 text-center transition hover:shadow-md active:scale-98 ${
                  selectedCategory === 'all'
                    ? 'border-[#fa9d26] bg-[#fa9d26]/5 ring-2 ring-[#fa9d26]/20'
                    : 'border-stone-200 bg-white hover:border-amber-300'
                }`}
              >
                <div className="mb-3 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-amber-50 text-[#fa9d26] group-hover:scale-105 transition">
                  <Grid className="h-7 w-7" />
                </div>
                <h3 className="text-sm font-bold text-stone-900 group-hover:text-[#fa9d26] transition">
                  All Products
                </h3>
                <p className="mt-1 text-[11px] font-semibold text-stone-500">
                  {products.length} total items
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-extrabold text-[#fa9d26]">
                  Browse All <ChevronRight className="h-3 w-3" />
                </span>
              </button>

              {/* Individual Categories Cards */}
              {categories.map((c) => {
                const categoryProducts = products.filter((p) => p.category_id === c.id);
                const count = categoryProducts.length;
                const previewImg = categoryProducts.find(
                  (p) => p.image_url || (p.images && p.images.length > 0)
                );
                const imgUrl = previewImg?.image_url || previewImg?.images?.[0] || null;

                const isIphoneCases = c.name.toLowerCase().includes('case') || c.name.toLowerCase().includes('iphone');
                const isSelected = selectedCategory === c.id;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(c.id);
                      setIsCategoriesOnlyView(false);
                      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`group relative flex flex-col overflow-hidden rounded-2xl border text-left transition hover:shadow-md active:scale-98 ${
                      isSelected
                        ? 'border-[#fa9d26] bg-[#fa9d26]/5 ring-2 ring-[#fa9d26]/20'
                        : 'border-stone-200 bg-white hover:border-amber-300'
                    }`}
                  >
                    <div className="relative aspect-4/3 w-full overflow-hidden bg-stone-100">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={c.name}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-stone-300">
                          <Layers className="h-8 w-8" />
                        </div>
                      )}

                      {isIphoneCases && (
                        <div className="absolute top-2 left-2 rounded-md bg-[#fa9d26] px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-xs">
                          50 pcs MOQ
                        </div>
                      )}

                      <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                        {count} item{count === 1 ? '' : 's'}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-3 sm:p-3.5">
                      <div>
                        <h3 className="text-sm font-bold text-stone-900 group-hover:text-[#fa9d26] transition line-clamp-1">
                          {c.name}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-stone-500">
                          {count} direct China item{count === 1 ? '' : 's'}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-stone-100">
                        <span className="text-[11px] font-bold text-[#b86200] group-hover:text-[#fa9d26] flex items-center gap-0.5">
                          View Items <ChevronRight className="h-3 w-3" />
                        </span>
                        {isIphoneCases && mode === 'wholesale' && (
                          <span className="text-[9px] text-stone-400">Mix & match</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Sourcing Request Callout */}
            <div className="rounded-2xl border border-dashed border-[#fa9d26]/40 bg-amber-50/50 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div>
                <h4 className="text-sm font-bold text-stone-900">Looking for a category or item not listed here?</h4>
                <p className="text-xs text-stone-600 mt-0.5">We source any custom products directly from verified China factories.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRequestOrderType(mode);
                  setRequestShipping(shippingMethod);
                  setIsRequestModalOpen(true);
                }}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 transition active:scale-95"
              >
                <span>Request Custom Item</span>
              </button>
            </div>
          </div>
        ) : (
          <div>

        {/* How Dainty Preorder Works Banner */}
        <section className="mb-6 overflow-hidden rounded-2xl border border-[#fa9d26]/30 bg-gradient-to-br from-[#fce7cc]/90 via-[#fff8f0] to-white p-4 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fa9d26] px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider shadow-2xs">
                CHINA FACTORY PRICES
              </span>
              <h2 className="mt-1 text-lg sm:text-2xl font-bold tracking-tight text-stone-900">
                How Dainty Preorder Works
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-stone-600 max-w-xl leading-relaxed">
                Shop China factory products. Select <strong>Wholesale</strong> for discounted bulk orders or <strong>Retail</strong> for single items, pick your sizes and colors, and choose <strong>Air Cargo</strong> (shipping time frame: within 3 weeks) or <strong>Sea Cargo</strong> (shipping time frame: within 3 months). Checkout takes you to WhatsApp to complete your order. The initial payment covers the buying price of the item, and shipping fee is confirmed and paid separately when your goods arrive in Nigeria. Estimated shipping fee is shown, but the exact shipping cost will be given when the shipment arrives in Nigeria. Confirmed shipping fees must be settled within 7 days of notification.
              </p>
            </div>

            <div className="flex flex-col gap-1.5 shrink-0 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-[#b96b0c] uppercase tracking-wider">
                <Clock className="h-3.5 w-3.5 text-[#fa9d26]" />
                <span>Shipping Time Frame</span>
              </div>
              <div className="flex flex-wrap sm:flex-col gap-2 text-xs w-full sm:w-auto">
                <div className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-1.5 font-medium text-stone-800 shadow-2xs border border-[#fa9d26]/25">
                  <Plane className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span><strong>Air Cargo:</strong> Within 3 weeks</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-1.5 font-medium text-stone-800 shadow-2xs border border-[#fa9d26]/25">
                  <Ship className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                  <span><strong>Sea Cargo:</strong> Within 3 months</span>
                </div>
              </div>
            </div>
          </div>

          {/* Custom Item Sourcing CTA Banner */}
          <div className="mt-4 pt-3.5 border-t border-amber-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="text-xs text-stone-700">
              <span className="font-bold text-stone-900">Can&apos;t find what you are looking for?</span> We source any item directly from China manufacturers at direct factory prices.
            </div>
            <button
              type="button"
              onClick={() => {
                setRequestOrderType(mode);
                setRequestShipping(shippingMethod);
                setIsRequestModalOpen(true);
              }}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-stone-800 transition active:scale-95"
            >
              <span>Request Any Item</span>
            </button>
          </div>
        </section>

        {/* Retail vs Wholesale Option & Shipping Selector at the top of All Products */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs sm:p-4 space-y-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Pricing Mode
                </span>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold text-[#b86200]">
                  {mode === 'wholesale' ? 'Wholesale (Bulk MOQ Pricing)' : 'Retail (Single Item Pricing)'}
                </span>
              </div>
              {mode === 'wholesale' && (
                <p className="mt-1 text-xs text-stone-600">
                  Direct Factory prices for bulk purchases, minimum order applies
                </p>
              )}
            </div>

            <div className="inline-flex shrink-0 rounded-xl border border-stone-200 bg-stone-100 p-1">
              <button
                type="button"
                onClick={() => setMode('retail')}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                  mode === 'retail'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => setMode('wholesale')}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                  mode === 'wholesale'
                    ? 'bg-[#fa9d26] text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Wholesale
              </button>
            </div>
          </div>

          {/* Shipping Method Option below Wholesale/Retail */}
          <div className="pt-3 border-t border-stone-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Shipping Option
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-bold text-stone-700">
                  Shipping Time Frame: {shippingTimeline}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-stone-500">
                Choose Air Cargo (within 3 weeks) or Sea Cargo (within 3 months)
              </p>
            </div>

            <div className="inline-flex shrink-0 rounded-xl border border-stone-200 bg-stone-100 p-1">
              <button
                type="button"
                disabled={cartHasSeaOnlyItems}
                onClick={() => setShippingMethod('air')}
                title={cartHasSeaOnlyItems ? 'At least one item in cart cannot be shipped by air' : 'Air Cargo delivery within 3 weeks'}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition ${
                  cartHasSeaOnlyItems
                    ? 'opacity-40 cursor-not-allowed text-stone-400'
                    : shippingMethod === 'air'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Plane className="h-3.5 w-3.5 text-emerald-600" />
                <span>Air Cargo (3 wks)</span>
              </button>
              <button
                type="button"
                disabled={cartHasAirOnlyItems}
                onClick={() => setShippingMethod('sea')}
                title={cartHasAirOnlyItems ? 'At least one item in cart cannot be shipped by sea' : 'Sea Cargo delivery within 3 months'}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition ${
                  cartHasAirOnlyItems
                    ? 'opacity-40 cursor-not-allowed text-stone-400'
                    : shippingMethod === 'sea'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Ship className="h-3.5 w-3.5 text-sky-600" />
                <span>Sea Cargo (3 mos)</span>
              </button>
            </div>
          </div>
        </div>

        
        {/* Active Category Header (when filtered to a specific category) */}
        {selectedCategory !== 'all' && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[#fa9d26]/40 bg-gradient-to-r from-amber-50 to-white p-3.5 sm:p-4 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsCategoriesOnlyView(true);
                  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 shadow-2xs hover:bg-stone-50 hover:border-[#fa9d26] transition active:scale-95"
              >
                <ChevronLeft className="h-3.5 w-3.5 text-[#fa9d26]" />
                <span>All Categories</span>
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#b86200]">
                    Active Category
                  </span>
                  {selectedCategoryName.toLowerCase().includes('case') && (
                    <span className="rounded-full bg-[#fa9d26] px-2 py-0.2 text-[9px] font-black text-white">
                      50 pcs MOQ
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-lg font-bold text-stone-900 leading-tight">
                  {selectedCategoryName}
                </h2>
                <p className="text-[11px] text-stone-500">
                  Showing only items in this category ({filteredProducts.length} product{filteredProducts.length === 1 ? '' : 's'})
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className="rounded-lg px-2.5 py-1 text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition"
            >
              Clear filter (Show all products)
            </button>
          </div>
        )}
{/* Categories Bar (Temu Style Horizontal Strip) */}
        <div id="categories-bar" className="mb-6 flex gap-2 overflow-x-auto pb-2 text-xs scrollbar-none">
          <button
            type="button"
            onClick={() => {
              setIsCategoriesOnlyView(true);
              if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="rounded-full px-3.5 py-1.5 font-bold transition whitespace-nowrap inline-flex items-center gap-1.5 bg-amber-500/10 text-[#b86200] border border-[#fa9d26]/40 hover:bg-[#fa9d26]/20 active:scale-95"
            title="Browse only categories"
          >
            <Grid className="h-3.5 w-3.5 text-[#fa9d26]" />
            <span>Categories</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`rounded-full px-4 py-1.5 font-medium transition whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-stone-900 text-white shadow-xs font-semibold'
                : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
            }`}
          >
            All Products ({products.length})
          </button>
          {categories.map((c) => {
            const count = products.filter((p) => p.category_id === c.id).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={`rounded-full px-4 py-1.5 font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                  selectedCategory === c.id
                    ? 'bg-stone-900 text-white shadow-xs font-semibold'
                    : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                <span>{c.name}</span>
                <span className="rounded-full bg-stone-200/60 px-1.5 py-0.2 text-[10px] text-stone-600">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-stone-500">
            Connecting to China catalog...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm font-medium text-stone-600">
              {searchQuery
                ? `No products found matching "${searchQuery}".`
                : 'No products found in this category.'}
            </p>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Looking for this or another item? We source any product directly from China suppliers. Click below to request it!
            </p>
            <button
              type="button"
              onClick={() => {
                if (searchQuery) setRequestItemName(searchQuery);
                setRequestOrderType(mode);
                setRequestShipping(shippingMethod);
                setIsRequestModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#fa9d26] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#e68a15] transition active:scale-95"
            >
              <Sparkles className="h-4 w-4" />
              <span>Request {searchQuery ? `"${searchQuery}"` : 'Any Item'} from China</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                mode={mode}
                categoryMap={categoryMap}
                onAddToCart={addToCart}
                onOpenMatrix={(p) => setMatrixProduct(p)}
                onZoomImage={(url) => setZoomedImage(url)}
              />
            ))}
          </div>
        )}
      
          </div>
        )}
</main>



      {/* Backdrop for Collapsible Side Drawer */}
      {isCartOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs transition-opacity duration-300"
          onClick={() => setIsCartOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Collapsible Slide-Over Cart Drawer by the Side (Mobile & Desktop) */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex h-full w-[88vw] max-w-[400px] sm:w-[420px] sm:max-w-[420px] flex-col bg-white shadow-2xl border-l border-stone-200 transition-transform duration-300 ease-in-out ${
          isCartOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
        aria-label="Preorder Cart Drawer"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="relative">
              <ShoppingBag className="h-5 w-5 text-[#fa9d26]" />
              {totalCartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#fa9d26] px-0.5 text-[8px] font-bold text-white">
                  {totalCartCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900 leading-tight">Preorder Cart</h2>
              <span className="text-[11px] text-stone-500">{totalCartCount} item{totalCartCount === 1 ? '' : 's'} selected</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {cart.length > 0 && (
              <>
                <a
                  href={buildShareableCartUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition shadow-2xs"
                  title="Open direct order page"
                >
                  View Order
                </a>
                <button
                  type="button"
                  onClick={handleCopyCartLink}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100 hover:border-amber-300 shadow-2xs transition"
                  title="Copy shareable order link"
                >
                  <span>{copiedLink ? 'Copied' : 'Share Order'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCart([]);
                    setIsCartOpen(false);
                  }}
                  className="text-xs text-stone-500 hover:text-red-600 transition px-1.5 py-1"
                >
                  Clear
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setIsCartOpen(false)}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition shadow-2xs"
              title="Collapse Cart"
            >
              <span>Collapse</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Shared Order Notice Banner */}
        {loadedOrderNotice && (
          <div className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-950 font-medium">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#fa9d26] shrink-0" />
              {loadedOrderNotice}
            </span>
            <button
              type="button"
              onClick={() => setLoadedOrderNotice(null)}
              className="text-stone-400 hover:text-stone-700 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* Cargo Routing Notices */}
          {cartHasSeaOnlyItems && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-[11px] text-blue-900 flex items-start gap-2">
              <Ship className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
              <span>Some items in your cart can only be shipped via Sea Cargo. Shipping is set to <strong>Sea Cargo (within 3 months)</strong>.</span>
            </div>
          )}
          {cartHasAirOnlyItems && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-[11px] text-emerald-900 flex items-start gap-2">
              <Plane className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
              <span>Some items in your cart can only be shipped via Air Cargo. Shipping is set to <strong>Air Cargo (within 3 weeks)</strong>.</span>
            </div>
          )}

          {/* Wholesale Warnings */}
          {wholesaleMoqWarnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1 text-amber-800">
                <AlertCircle className="h-3.5 w-3.5" />
                Wholesale Minimum Notice:
              </div>
              {wholesaleMoqWarnings.map((w, idx) => (
                <div key={idx} className="text-[11px] leading-snug">
                  • <strong>{w.name}</strong> ({w.scope === 'item' ? 'Item MOQ' : 'Category Bulk'}): Minimum order is <strong>{w.required} pcs</strong> (Currently: {w.current} pcs. Need {w.required - w.current} more piece(s)).
                </div>
              ))}
            </div>
          )}

          {/* Cart Items List */}
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-stone-500 space-y-2">
              <ShoppingBag className="h-10 w-10 text-stone-300" />
              <p className="text-sm font-semibold text-stone-700">Your cart is empty</p>
              <p className="text-xs text-stone-400 max-w-[220px]">
                Browse our China factory products and add items to your preorder.
              </p>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="mt-2 rounded-lg bg-[#fa9d26] px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#e68c1d] transition"
              >
                Browse Products
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {cart.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/50 p-2.5 shadow-2xs hover:bg-stone-50 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {item.selectedImage ? (
                      <img
                        src={item.selectedImage}
                        alt={item.product.name || 'Item'}
                        className="h-12 w-12 shrink-0 rounded-lg border border-stone-200 object-contain bg-white p-0.5"
                      />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-stone-400">
                        <ShoppingBag className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate text-xs text-stone-900">
                        {item.product.name || item.product.title || 'Product'}
                      </div>
                      <div className="text-[11px] text-stone-600 flex flex-wrap gap-1.5 mt-0.5">
                        {item.selectedSize && (
                          <span className="inline-flex items-center rounded bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-800 border border-stone-200">
                            Size: {item.selectedSize}
                          </span>
                        )}
                        {item.selectedColor && (
                          <span className="inline-flex items-center rounded bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-700 border border-stone-200">
                            Color: {item.selectedColor}
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-xs text-stone-900 mt-0.5">
                        ₦{((mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price) * item.quantity).toLocaleString()}
                        <span className="text-[10px] font-normal text-stone-400 ml-1">
                          (₦{Number(mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price).toLocaleString()} ea)
                        </span>
                      </div>
                      <div className="text-[10px] text-stone-500 mt-0.5 flex flex-wrap gap-1.5">
                        {getProductShippingFees(item.product).air > 0 ? (
                          <span>Air: ₦{getProductShippingFees(item.product).air.toLocaleString()}</span>
                        ) : (
                          <span className="text-red-600 font-medium">Can&apos;t be shipped by air</span>
                        )}
                        <span>•</span>
                        {getProductShippingFees(item.product).sea > 0 ? (
                          <span>Sea: ₦{getProductShippingFees(item.product).sea.toLocaleString()}</span>
                        ) : (
                          <span className="text-red-600 font-medium">Can&apos;t be shipped by sea</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => removeItem(item.product.id, item.selectedColor, item.selectedSize)}
                      className="p-1 text-stone-400 hover:text-red-600 transition"
                      title="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                    <div className="flex items-center rounded-lg border border-stone-300 bg-white shadow-2xs">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, item.selectedColor, item.selectedSize, -1)}
                        className="p-1 hover:bg-stone-100 text-stone-700"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="px-2 font-bold text-xs text-stone-900">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, item.selectedColor, item.selectedSize, 1)}
                        className="p-1 hover:bg-stone-100 text-stone-700"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Sticky Footer Checkout */}
        {cart.length > 0 && (
          <div className="border-t border-stone-200 bg-stone-50 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-600">Product Total (To Pay Now):</span>
              <span className="font-extrabold text-base text-stone-900">₦{subtotal.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-stone-500">
              <span>Est. Shipping ({shippingMethod.toUpperCase()} Cargo):</span>
              <span className={`font-medium ${cartHasUnavailableSelectedMethod ? 'text-red-700' : 'text-stone-700'}`}>
                {cartHasUnavailableSelectedMethod
                  ? `Can't be shipped by ${shippingMethod}`
                  : estimatedShipping > 0
                  ? `₦${estimatedShipping.toLocaleString()}`
                  : 'Exact fee confirmed upon arrival'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-stone-500">
              <span>Shipping Time Frame:</span>
              <span className="font-semibold text-stone-800">{shippingTimeline}</span>
            </div>

            {orderPaymentConfirmed && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-left">
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Payment Confirmed
                  </span>
                  <span className="text-[10px] font-mono font-bold text-emerald-700">#{activeOrderId}</span>
                </div>
                <p className="text-[11px] text-emerald-800 mb-2">
                  Your purchase payment is confirmed! Click below to track your delivery.
                </p>
                <Link
                  href={`/track?id=${activeOrderId}`}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-900 py-2 text-xs font-bold text-white shadow-xs hover:bg-stone-800 transition"
                >
                  <Truck className="h-3.5 w-3.5 text-[#fa9d26]" />
                  <span>Track Order</span>
                </Link>
              </div>
            )}

            {cartHasUnavailableSelectedMethod ? (
              <div className="mt-1 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-center text-xs font-semibold text-red-700">
                Can&apos;t be shipped by {shippingMethod}. Remove the unavailable item or choose another available shipping method.
              </div>
            ) : (
              <a
                href={buildWhatsAppLink()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={async () => {
                  const ordId = activeOrderId || ('ORD-' + Math.floor(100000 + Math.random() * 900000));
                  if (!activeOrderId) setActiveOrderId(ordId);
                  await saveCheckoutOrderToSupabase(ordId);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] py-3 text-sm font-bold text-white shadow-md transition active:scale-98"
              >
                <MessageCircle className="h-4 w-4" />
                Checkout
              </a>
            )}

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] text-stone-600 space-y-1.5 text-left">
              <div className="font-bold text-stone-900 text-xs">China Sourcing & Preorder Terms</div>
              <div><strong className="text-stone-800">Initial Payment:</strong> The initial payment covers the buying price of the item. Your order will be shipped once the purchase payment has been completed.</div>
              <div><strong className="text-stone-800">Shipping Estimate:</strong> Estimated shipping fee is shown, but the exact shipping cost will be given when the shipment arrives in Nigeria.</div>
              <div><strong className="text-stone-800">Shipping Payment:</strong> Shipping fee is confirmed and paid separately when your goods arrive in Nigeria.</div>
              <div><strong className="text-stone-800">Payment Window:</strong> Confirmed shipping fees must be settled within 7 days of notification.</div>
            </div>
          </div>
        )}
      </aside>

      {/* Floating WhatsApp Action Button (Bottom Left) */}
      <a
        href={buildDirectWhatsAppChatUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-16 sm:bottom-6 left-3 sm:left-5 z-40 flex items-center gap-2 rounded-full bg-[#25D366] px-3 py-2 sm:px-4 sm:py-3 text-white shadow-2xl hover:bg-[#20ba59] transition transform hover:scale-105 active:scale-95 border-2 border-white/80"
        title="Chat with Dainty Import on WhatsApp"
        aria-label="Chat on WhatsApp"
      >
        <WhatsAppIcon className="h-5 w-5 fill-white shrink-0" />
        <span className="text-xs font-bold sm:inline hidden">Chat on WhatsApp</span>
      </a>

      {/* Custom Item Sourcing Request Modal */}
      {isRequestModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs transition animate-in fade-in"
          onClick={() => setIsRequestModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-[#b96b0c]">
                  <PackagePlus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Request Any Item from China</h3>
                  <p className="text-[11px] text-stone-500">We source directly from China factories and suppliers</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendCustomRequest} className="space-y-3.5 text-left text-xs">
              <div>
                <label className="block font-bold text-stone-800 mb-1">
                  What item do you want to source? <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={requestItemName}
                  onChange={(e) => setRequestItemName(e.target.value)}
                  placeholder="e.g. Leather Handbags, Acrylic Display Boxes, iPhone 16 Cases..."
                  className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-stone-900 placeholder:text-stone-400 focus:border-[#fa9d26] focus:bg-white focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-800 mb-1">Order Type</label>
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-stone-200 bg-stone-100 p-1">
                    <button
                      type="button"
                      onClick={() => setRequestOrderType('retail')}
                      className={`rounded-lg py-1.5 text-center font-bold transition ${
                        requestOrderType === 'retail'
                          ? 'bg-white text-stone-900 shadow-xs'
                          : 'text-stone-600'
                      }`}
                    >
                      Retail
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestOrderType('wholesale')}
                      className={`rounded-lg py-1.5 text-center font-bold transition ${
                        requestOrderType === 'wholesale'
                          ? 'bg-[#fa9d26] text-white shadow-xs'
                          : 'text-stone-600'
                      }`}
                    >
                      Wholesale (MOQ)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-stone-800 mb-1">Estimated Quantity</label>
                  <input
                    type="text"
                    value={requestQuantity}
                    onChange={(e) => setRequestQuantity(e.target.value)}
                    placeholder="e.g. 50 pcs, 20 pairs, 1 sample..."
                    className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-stone-900 placeholder:text-stone-400 focus:border-[#fa9d26] focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-800 mb-1">Preferred Shipping Method</label>
                <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-stone-200 bg-stone-100 p-1">
                  <button
                    type="button"
                    onClick={() => setRequestShipping('air')}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-center font-bold transition ${
                      requestShipping === 'air'
                        ? 'bg-white text-stone-900 shadow-xs'
                        : 'text-stone-600'
                    }`}
                  >
                    <Plane className="h-3 w-3 text-emerald-600" />
                    <span>Air (~3 wks)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestShipping('sea')}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-center font-bold transition ${
                      requestShipping === 'sea'
                        ? 'bg-white text-stone-900 shadow-xs'
                        : 'text-stone-600'
                    }`}
                  >
                    <Ship className="h-3 w-3 text-sky-600" />
                    <span>Sea (~3 mos)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequestShipping('either')}
                    className={`rounded-lg py-1.5 text-center font-bold transition ${
                      requestShipping === 'either'
                        ? 'bg-white text-stone-900 shadow-xs'
                        : 'text-stone-600'
                    }`}
                  >
                    Best Rate
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-800 mb-1">
                  More Information / Description <span className="font-normal text-stone-500">(tell us more about what you want)</span>
                </label>
                <textarea
                  rows={3}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="Describe the product details, specifications, preferred colors, sizes, materials, brand or style..."
                  className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-stone-900 placeholder:text-stone-400 focus:border-[#fa9d26] focus:bg-white focus:outline-hidden"
                />
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-900 flex items-start gap-2">
                <Info className="h-4 w-4 text-[#fa9d26] shrink-0 mt-0.5" />
                <span>
                  After clicking below, you can also attach sample pictures or videos of the item directly in our WhatsApp chat!
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] py-3 text-sm font-bold text-white shadow-md transition active:scale-98"
                >
                  <WhatsAppIcon className="h-4 w-4 fill-white" />
                  <span>Send Request to WhatsApp</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

          {/* Temu Mobile Bottom Navigation Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 px-3 py-1.5 flex items-center justify-around shadow-lg">
        {/* 1. Request (Switched with Shop, star removed) */}
        <button
          type="button"
          onClick={() => {
            setRequestOrderType(mode);
            setRequestShipping(shippingMethod);
            setIsRequestModalOpen(true);
          }}
          className="flex flex-col items-center gap-0.5 text-stone-600 hover:text-[#fa9d26] transition active:scale-95"
        >
          <PackagePlus className="h-4 w-4 text-[#fa9d26]" />
          <span className="text-[10px] font-bold">Request</span>
        </button>

        {/* 2. Categories (Opens categories-only view) */}
        <button
          type="button"
          onClick={() => {
            setIsCategoriesOnlyView(true);
            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center gap-0.5 transition active:scale-95 ${
            isCategoriesOnlyView ? 'text-[#fa9d26]' : 'text-stone-600 hover:text-[#fa9d26]'
          }`}
        >
          <Grid className="h-4 w-4" />
          <span className="text-[10px] font-bold">Categories</span>
        </button>

        {/* 3. Shop (Switched with Request) */}
        <button
          type="button"
          onClick={() => {
            setIsCategoriesOnlyView(false);
            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center gap-0.5 transition active:scale-95 ${
            !isCategoriesOnlyView ? 'text-[#fa9d26]' : 'text-stone-600 hover:text-[#fa9d26]'
          }`}
        >
          <Home className="h-4 w-4" />
          <span className="text-[10px] font-bold">Shop</span>
        </button>

        {/* 4. Track */}
        <a
          href="/track"
          className="flex flex-col items-center gap-0.5 text-stone-600 hover:text-[#fa9d26] transition active:scale-95"
        >
          <Truck className="h-4 w-4" />
          <span className="text-[10px] font-bold">Track</span>
        </a>

        {/* 5. Cart */}
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="relative flex flex-col items-center gap-0.5 text-stone-900 hover:text-[#fa9d26] transition active:scale-95"
        >
          <div className="relative">
            <ShoppingBag className="h-4 w-4 text-[#fa9d26]" />
            {totalCartCount > 0 && (
              <span className="absolute -top-1 -right-2 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#fa9d26] px-0.5 text-[8px] font-black text-white">
                {totalCartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold">Cart</span>
        </button>
      </nav>

    </div>
  );
}