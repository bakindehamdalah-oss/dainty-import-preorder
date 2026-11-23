'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  ShoppingBag,
  Plane,
  Ship,
  MessageCircle,
  Plus,
  Minus,
  Trash2,
  Maximize2,
  X,
  Check,
  AlertCircle,
  Info,
  Search,
  Layers,
  Box,
  Tag,
  Sparkles,
  ShieldCheck,
  Clock,
  ArrowRight
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
  slug: string;
  wholesale_moq?: number;
  moq_scope?: 'item' | 'category';
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
  moq_scope?: 'item' | 'category' | null;
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

// Extract wholesale MOQ
function getProductWholesaleMOQ(product: Product, category?: Category | null): number {
  if (product.wholesale_moq && Number(product.wholesale_moq) > 0) {
    return Number(product.wholesale_moq);
  }
  if (product.min_order_qty && Number(product.min_order_qty) > 0) {
    return Number(product.min_order_qty);
  }
  if (product.description) {
    const moqMatch = product.description.match(/(?:moq|minimum\s*(?:order)?(?:\s*qty)?):\s*(\d+)/i);
    if (moqMatch && moqMatch[1]) {
      return parseInt(moqMatch[1], 10);
    }
  }
  const prodName = (product.name || product.title || '').toLowerCase();
  const catName = (category?.name || '').toLowerCase();

  // For iPhone cases & phone cases, wholesale minimum is 50 pieces
  if (
    catName.includes('case') ||
    catName.includes('iphone') ||
    prodName.includes('iphone case') ||
    prodName.includes('phone case') ||
    prodName.includes('case')
  ) {
    return 50;
  }

  if (category?.wholesale_moq && Number(category.wholesale_moq) > 0) {
    return Number(category.wholesale_moq);
  }

  return 5;
}

// Extract whether wholesale MOQ is per-item or whole category
function getProductMOQScope(product: Product, category?: Category | null): 'item' | 'category' {
  if (product.moq_scope === 'category' || product.moq_scope === 'item') {
    return product.moq_scope;
  }
  if (product.description) {
    const scopeMatch = product.description.match(/moq\s*scope:\s*(category|item)/i);
    if (scopeMatch && scopeMatch[1]) {
      return scopeMatch[1].toLowerCase() === 'category' ? 'category' : 'item';
    }
  }
  const prodName = (product.name || product.title || '').toLowerCase();
  const catName = (category?.name || '').toLowerCase();

  // iPhone cases strictly require 50 pcs per item model
  if (
    catName.includes('case') ||
    catName.includes('iphone') ||
    prodName.includes('iphone case') ||
    prodName.includes('phone case')
  ) {
    return 'item';
  }

  if (category?.moq_scope) {
    return category.moq_scope;
  }

  return 'item';
}

// 1688 Specification Matrix Modal (1688 规格批量选款)
function MatrixOrderModal({
  product,
  category,
  onClose,
  onAddBatchToCart,
  onZoomImage,
}: {
  product: Product;
  category?: Category | null;
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
    if (Array.isArray(product.sizes)) {
      for (const s of product.sizes) {
        if (s && !list.includes(String(s).trim())) list.push(String(s).trim());
      }
    }
    if (product.size_options) {
      for (const s of String(product.size_options).split(',')) {
        const trimmed = s.trim();
        if (trimmed && !list.includes(trimmed)) list.push(trimmed);
      }
    }
    if (product.size) {
      for (const s of product.size.split(',')) {
        const trimmed = s.trim();
        if (trimmed && !list.includes(trimmed)) list.push(trimmed);
      }
    }
    if (list.length === 0 && product.description) {
      const match = product.description.match(/(?:sizes?|models?):\s*([^•\n]+)/i);
      if (match && match[1]) {
        for (const s of match[1].split(',')) {
          const trimmed = s.trim();
          if (trimmed && !list.includes(trimmed)) list.push(trimmed);
        }
      }
    }
    return list;
  }, [product]);

  const colors = useMemo(() => {
    const list: string[] = [];
    if (Array.isArray(product.colors)) {
      for (const c of product.colors) {
        if (c && !list.includes(c.trim())) list.push(c.trim());
      }
    }
    if (product.color_options) {
      for (const c of product.color_options.split(',')) {
        const trimmed = c.trim();
        if (trimmed && !list.includes(trimmed)) list.push(trimmed);
      }
    }
    if (list.length === 0 && product.description) {
      const match = product.description.match(/colors?:\s*([^•\n]+)/i);
      if (match && match[1]) {
        for (const c of match[1].split(',')) {
          const trimmed = c.trim();
          if (trimmed && !list.includes(trimmed)) list.push(trimmed);
        }
      }
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
          next[k] = (next[k] || 0) + delta;
        }
      }
      return next;
    });
  }

  const totalSelected = useMemo(() => {
    return Object.values(quantities).reduce((sum, q) => sum + (q || 0), 0);
  }, [quantities]);

  const progressPercent = Math.min(100, Math.round((totalSelected / moq) * 100));
  const isMoqMet = totalSelected >= moq;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-xs">
      <div
        className="relative flex flex-col max-h-[92vh] w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden"
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
                className="h-12 w-12 shrink-0 rounded-lg border border-stone-200 bg-white object-contain p-1 cursor-pointer hover:scale-105 transition"
              />
            ) : null}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#fa9d26] px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  1688 Wholesale Spec Matrix
                </span>
                <span className="text-[11px] font-semibold text-stone-500">
                  {moqScope === 'item' ? `MOQ: ${moq} pcs (Per Item)` : `MOQ: ${moq} pcs (Category Mix)`}
                </span>
              </div>
              <h3 className="text-sm font-bold text-stone-900 truncate mt-0.5">{productTitle}</h3>
              <div className="text-xs text-[#d97706] font-bold">
                ₦{Number(product.wholesale_price).toLocaleString()} <span className="font-normal text-stone-500">/ piece</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Color Tabs if colors exist */}
        {colors.length > 1 && (
          <div className="flex items-center gap-1.5 border-b border-stone-100 bg-white px-4 py-2 overflow-x-auto text-xs">
            <span className="text-[11px] font-medium text-stone-500 mr-1 shrink-0">Filter Color:</span>
            <button
              type="button"
              onClick={() => setActiveColorTab('All')}
              className={`rounded-lg px-2.5 py-1 font-medium transition shrink-0 ${
                activeColorTab === 'All'
                  ? 'bg-stone-900 text-white shadow-xs font-semibold'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              All Colors
            </button>
            {colors.map((c) => {
              // Count selected pieces for this color
              let colorCount = 0;
              for (const [k, q] of Object.entries(quantities)) {
                if (k.startsWith(`${c}:::`)) colorCount += q;
              }
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveColorTab(c)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition shrink-0 flex items-center gap-1.5 ${
                    activeColorTab === c
                      ? 'bg-[#fa9d26] text-white shadow-xs font-semibold'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  <span>{c}</span>
                  {colorCount > 0 && (
                    <span className="rounded-full bg-white/30 px-1.5 py-0.2 text-[10px] font-bold">
                      {colorCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Quick Batch Increment Bar */}
        <div className="flex items-center justify-between bg-stone-50/80 px-4 py-2 border-b border-stone-100 text-xs">
          <span className="text-[11px] text-stone-500">
            Quick fill displayed variants:
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => quickFillActive(5)}
              className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100 shadow-2xs"
            >
              +5 to all
            </button>
            <button
              type="button"
              onClick={() => quickFillActive(10)}
              className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100 shadow-2xs"
            >
              +10 to all
            </button>
            <button
              type="button"
              onClick={() => setQuantities({})}
              className="text-[11px] text-stone-400 hover:text-red-600 ml-1"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Matrix Variant Table / Rows */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2">
          {displayedColors.map((color) => (
            <div key={color || 'no-color'} className="space-y-1.5">
              {color && (
                <div className="flex items-center gap-2 pt-2 pb-1">
                  <span className="h-2 w-2 rounded-full bg-[#fa9d26]" />
                  <span className="text-xs font-bold text-stone-800">Color: {color}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {displayedSizes.map((size) => {
                  const qty = getQty(color, size);
                  const label = size || (color ? 'Standard Spec' : 'Standard Item');

                  return (
                    <div
                      key={size || 'no-size'}
                      className={`flex items-center justify-between rounded-xl border p-2.5 transition ${
                        qty > 0
                          ? 'border-[#fa9d26] bg-[#fffaf5] ring-1 ring-[#fa9d26]/20'
                          : 'border-stone-200 bg-white hover:border-stone-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="text-xs font-semibold text-stone-900 block truncate">
                          {label}
                        </span>
                        <span className="text-[11px] text-stone-500">
                          ₦{Number(product.wholesale_price).toLocaleString()}
                        </span>
                      </div>

                      {/* Stepper with direct quantity input */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => adjustQty(color, size, -1)}
                          disabled={qty <= 0}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={qty === 0 ? '' : qty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setQty(color, size, isNaN(val) ? 0 : val);
                          }}
                          placeholder="0"
                          className="h-7 w-12 rounded-lg border border-stone-200 bg-white text-center text-xs font-bold text-stone-900 focus:border-[#fa9d26] focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => adjustQty(color, size, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustQty(color, size, 5)}
                          className="rounded-lg bg-stone-100 px-1.5 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-200"
                          title="Add 5"
                        >
                          +5
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sticky 1688 Footer with Progress Bar */}
        <div className="border-t border-stone-200 bg-stone-50 p-4 space-y-3">
          {/* Progress bar towards MOQ */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-stone-700">
                Selected: <strong className="text-stone-900">{totalSelected}</strong> / {moq} pcs
              </span>
              <span className={`text-[11px] font-bold ${isMoqMet ? 'text-emerald-700' : 'text-[#d97706]'}`}>
                {isMoqMet
                  ? '✅ Wholesale MOQ Reached!'
                  : `Need ${moq - totalSelected} more pieces to reach ${moq} pcs MOQ`}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
              <div
                className={`h-full transition-all duration-300 ${
                  isMoqMet ? 'bg-emerald-600' : 'bg-[#fa9d26]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <div className="text-[11px] text-stone-500">Subtotal for Selected:</div>
              <div className="text-base font-bold text-stone-900">
                ₦{(totalSelected * Number(product.wholesale_price)).toLocaleString()}
              </div>
            </div>

            <button
              type="button"
              disabled={totalSelected === 0}
              onClick={handleConfirm}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md transition disabled:opacity-40 ${
                isMoqMet ? 'bg-[#fa9d26] hover:bg-[#e68c1d]' : 'bg-stone-900 hover:bg-stone-800'
              }`}
            >
              <Check className="h-4 w-4" />
              Add All {totalSelected} Pieces to Preorder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 1688 Product Card Component
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
  const cat = product.category_id ? categoryMap.get(product.category_id) : null;
  const moq = getProductWholesaleMOQ(product, cat);
  const moqScope = getProductMOQScope(product, cat);

  // Gather all available images
  const allImages = useMemo(() => {
    const list: string[] = [];
    if (product.image_url) list.push(product.image_url);
    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        if (img && !list.includes(img)) list.push(img);
      }
    }
    if (Array.isArray(product.variants)) {
      for (const v of product.variants) {
        if (v?.image_url && !list.includes(v.image_url)) list.push(v.image_url);
      }
    }
    return list;
  }, [product]);

  // Gather all available color options (optional)
  const allColors = useMemo(() => {
    const list: string[] = [];
    if (Array.isArray(product.colors)) {
      for (const c of product.colors) {
        if (c && !list.includes(c.trim())) list.push(c.trim());
      }
    }
    if (product.color_options) {
      for (const c of product.color_options.split(',')) {
        const trimmed = c.trim();
        if (trimmed && !list.includes(trimmed)) list.push(trimmed);
      }
    }
    if (Array.isArray(product.variants)) {
      for (const v of product.variants) {
        if (v?.color && !list.includes(v.color.trim())) list.push(v.color.trim());
      }
    }
    if (list.length === 0 && product.description) {
      const match = product.description.match(/colors?:\s*([^•\n]+)/i);
      if (match && match[1]) {
        for (const c of match[1].split(',')) {
          const trimmed = c.trim();
          if (trimmed && !list.includes(trimmed)) list.push(trimmed);
        }
      }
    }
    return list;
  }, [product]);

  // Gather all available size/model options (optional)
  const allSizes = useMemo(() => {
    const list: string[] = [];
    if (Array.isArray(product.sizes)) {
      for (const s of product.sizes) {
        if (s && !list.includes(String(s).trim())) list.push(String(s).trim());
      }
    }
    if (product.size_options) {
      for (const s of String(product.size_options).split(',')) {
        const trimmed = s.trim();
        if (trimmed && !list.includes(trimmed)) list.push(trimmed);
      }
    }
    if (product.size) {
      for (const s of product.size.split(',')) {
        const trimmed = s.trim();
        if (trimmed && !list.includes(trimmed)) list.push(trimmed);
      }
    }
    if (Array.isArray(product.variants)) {
      for (const v of product.variants) {
        if (v?.size && !list.includes(v.size.trim())) list.push(v.size.trim());
      }
    }
    if (list.length === 0 && product.description) {
      const match = product.description.match(/(?:sizes?|models?):\s*([^•\n]+)/i);
      if (match && match[1]) {
        for (const s of match[1].split(',')) {
          const trimmed = s.trim();
          if (trimmed && !list.includes(trimmed)) list.push(trimmed);
        }
      }
    }
    return list;
  }, [product]);

  const hasVariants = allSizes.length > 0 || allColors.length > 0;

  const [activeImage, setActiveImage] = useState<string>(allImages[0] || '');
  const [selectedColor, setSelectedColor] = useState<string | null>(allColors[0] || null);
  const [selectedSize, setSelectedSize] = useState<string | null>(allSizes[0] || product.size || null);
  const [orderQty, setOrderQty] = useState<number>(mode === 'wholesale' ? moq : 1);

  useEffect(() => {
    if (allImages.length > 0 && !allImages.includes(activeImage)) {
      setActiveImage(allImages[0]);
    }
  }, [allImages, activeImage]);

  useEffect(() => {
    setOrderQty(mode === 'wholesale' ? moq : 1);
  }, [mode, moq]);

  function handleSelectColor(colorName: string, index?: number) {
    setSelectedColor(colorName);
    if (typeof index === 'number' && allImages[index]) {
      setActiveImage(allImages[index]);
    }
  }

  const airFee = Number(product.est_shipping_fee_air ?? product.est_shipping_fee ?? 0);
  const seaFee = Number(product.est_shipping_fee_sea ?? product.est_shipping_fee ?? 0);
  const hasAir = airFee > 0;
  const hasSea = seaFee > 0;

  return (
    <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xs transition hover:shadow-md">
      <div>
        {/* Crisp product image container with 1688 Zoom */}
        <div className="relative aspect-square w-full overflow-hidden bg-stone-50 flex items-center justify-center p-3 group">
          {activeImage ? (
            <img
              src={activeImage}
              alt={productTitle}
              onClick={() => onZoomImage(activeImage)}
              className="max-h-full max-w-full object-contain cursor-pointer transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-stone-400">
              No image
            </div>
          )}

          {activeImage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onZoomImage(activeImage);
              }}
              title="Click to view full photo clearly"
              className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-stone-900/80 px-2 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur-xs transition group-hover:opacity-100 hover:bg-stone-900"
            >
              <Maximize2 className="h-3 w-3" />
              Zoom
            </button>
          )}

          {/* 1688 Badges */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start">
            {mode === 'wholesale' && (
              <span className="rounded-md bg-[#fa9d26] px-2 py-0.5 text-[10px] font-bold text-white shadow-xs tracking-wide">
                MOQ: {moq} pcs ({moqScope === 'item' ? 'Item' : 'Category'})
              </span>
            )}
            {!hasAir && hasSea && (
              <span className="rounded-md bg-blue-600/95 px-2 py-0.5 text-[10px] font-semibold text-white shadow-xs">
                Sea Cargo Only
              </span>
            )}
          </div>
        </div>

        {/* Thumbnail switcher if multiple images exist */}
        {allImages.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto border-t border-stone-100 bg-stone-50/50 p-2">
            {allImages.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setActiveImage(img);
                  if (allColors[idx]) setSelectedColor(allColors[idx]);
                }}
                className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-white p-0.5 transition ${
                  activeImage === img ? 'border-[#fa9d26] ring-2 ring-[#fa9d26]/20' : 'border-stone-200 opacity-70 hover:opacity-100'
                }`}
              >
                <img src={img} alt={`Angle ${idx + 1}`} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}

        {/* Product Details */}
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            {cat && <span className="text-xs font-medium text-stone-500">{cat.name}</span>}
            {mode === 'wholesale' && (
              <span className="text-[10px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                {moqScope === 'item' ? `Per-Item MOQ: ${moq} pcs` : `Category MOQ: ${moq} pcs`}
              </span>
            )}
          </div>
          <h2 className="mt-1 text-base font-semibold text-stone-900">{productTitle}</h2>

          {/* Size / Model chips only if sizes exist */}
          {allSizes.length > 1 ? (
            <div className="mt-3">
              <span className="text-[11px] font-medium text-stone-600 block mb-1.5">
                Size / Model: <span className="font-bold text-stone-900">{selectedSize || 'Select'}</span>
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {allSizes.map((sz, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedSize(sz)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
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
          ) : product.size ? (
            <div className="mt-2 inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
              <span className="font-medium">Size/Model:</span> {product.size}
            </div>
          ) : null}

          {/* Color chips only if colors exist */}
          {allColors.length > 0 && (
            <div className="mt-3">
              <span className="text-[11px] font-medium text-stone-600 block mb-1.5">
                Color: <span className="font-bold text-stone-900">{selectedColor || 'Select'}</span>
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {allColors.map((col, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectColor(col, idx)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
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

          {product.description && (
            <p className="mt-2.5 line-clamp-2 text-xs text-stone-600">{product.description}</p>
          )}
        </div>
      </div>

      {/* Pricing & Actions */}
      <div className="border-t border-stone-100 px-4 py-3 bg-stone-50/50 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold text-stone-900">
              ₦{Number(displayPrice).toLocaleString()}
              {mode === 'wholesale' && <span className="text-xs font-normal text-stone-500 ml-1">/ piece</span>}
            </div>
            <div className="text-[11px]">
              {hasAir && hasSea ? (
                <span className="text-stone-500">
                  Air: ₦{airFee.toLocaleString()} • Sea: ₦{seaFee.toLocaleString()}
                </span>
              ) : hasSea && !hasAir ? (
                <span className="text-blue-700 font-medium">Sea Cargo: ₦{seaFee.toLocaleString()} (Sea Only)</span>
              ) : hasAir && !hasSea ? (
                <span className="text-emerald-700 font-medium">Air Cargo: ₦{airFee.toLocaleString()}</span>
              ) : (
                <span className="text-stone-400">Shipping billed upon arrival</span>
              )}
            </div>
          </div>

          {/* Quantity Stepper for Single Add */}
          <div className="flex items-center rounded-lg border border-stone-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setOrderQty((q) => Math.max(1, q - (mode === 'wholesale' ? 5 : 1)))}
              className="h-6 w-6 flex items-center justify-center rounded text-stone-600 hover:bg-stone-100"
              title="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-xs font-bold text-stone-900 px-1.5 min-w-[28px] text-center">
              {orderQty}
            </span>
            <button
              type="button"
              onClick={() => setOrderQty((q) => q + (mode === 'wholesale' ? 5 : 1))}
              className="h-6 w-6 flex items-center justify-center rounded text-stone-600 hover:bg-stone-100"
              title="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* 1688 Multi-Variant Batch Order button if item has variants in wholesale */}
        {mode === 'wholesale' && hasVariants && (
          <button
            type="button"
            onClick={() => onOpenMatrix(product)}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#fa9d26] py-2 text-xs font-bold text-white hover:bg-[#e68c1d] transition shadow-xs active:scale-98"
          >
            <Layers className="h-3.5 w-3.5" />
            1688 Batch Order (Pick Sizes, Colors & Qty)
          </button>
        )}

        {/* Standard Add to Cart button */}
        <button
          type="button"
          onClick={() => onAddToCart(product, selectedColor, selectedSize, activeImage, orderQty)}
          className={`w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition shadow-xs active:scale-98 ${
            mode === 'wholesale' && hasVariants
              ? 'bg-stone-100 text-stone-800 hover:bg-stone-200'
              : 'bg-stone-900 text-white hover:bg-[#fa9d26]'
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          Add {orderQty} to Preorder Cart
        </button>
      </div>
    </div>
  );
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
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [matrixProduct, setMatrixProduct] = useState<Product | null>(null);

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
        setCategories(categoriesRes.data || []);
        setProducts(productsRes.data || []);
      }
      setLoading(false);
    }

    loadStoreData();
  }, []);

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

  // Check if cart contains any item that cannot be shipped by Air (Sea Only)
  const cartHasSeaOnlyItems = useMemo(() => {
    return cart.some((item) => {
      const airFee = Number(item.product.est_shipping_fee_air ?? 0);
      const seaFee = Number(item.product.est_shipping_fee_sea ?? 0);
      return airFee <= 0 && seaFee > 0;
    });
  }, [cart]);

  // If cart contains sea-only items, automatically switch shipping to Sea
  useEffect(() => {
    if (cartHasSeaOnlyItems && shippingMethod === 'air') {
      setShippingMethod('sea');
    }
  }, [cartHasSeaOnlyItems, shippingMethod]);

  function addToCart(
    product: Product,
    selectedColor: string | null,
    selectedSize: string | null,
    selectedImage: string | null,
    quantityToAdd: number
  ) {
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
      const airFee = Number(item.product.est_shipping_fee_air ?? 0);
      const seaFee = Number(item.product.est_shipping_fee_sea ?? 0);
      const perItemFee = shippingMethod === 'air' ? airFee : seaFee;
      return sum + perItemFee * item.quantity;
    }, 0);
  }, [cart, shippingMethod]);

  // Shipping timelines: Air within 3 weeks, Sea within 3 months
  const shippingTimeline = shippingMethod === 'air' ? 'Within 3 weeks' : 'Within 3 months';

  // Check Wholesale MOQ requirements for both Item-Level and Category-Level scopes
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

      if (scope === 'item') {
        if (totalQty < moq) {
          warnings.push({
            name: item.product.name || item.product.title || 'Product',
            required: moq,
            current: totalQty,
            scope: 'item',
          });
        }
      } else {
        // Category scope: check if category total meets category MOQ
        const catId = item.product.category_id || 'uncategorized';
        if (!checkedCategories.has(catId)) {
          checkedCategories.add(catId);
          const catTotal = categoryQtyMap.get(catId) || 0;
          if (catTotal < moq) {
            warnings.push({
              name: cat?.name || 'Category',
              required: moq,
              current: catTotal,
              scope: 'category',
            });
          }
        }
      }
    }

    return warnings;
  }, [cart, mode, categoryMap]);

  function buildWhatsAppLink() {
    const cleanPhone = (settings?.whatsapp_number || '').replace(/[^0-9]/g, '');
    const lines = [
      `*1688 Factory Preorder Sourcing Sheet (${mode.toUpperCase()})*`,
      `*Origin:* China Direct Factory`,
      `*Shipping Cargo:* ${shippingMethod.toUpperCase()} (${shippingTimeline})`,
      '',
      '*Items Ordered (Specifications & Quantities):*'
    ];

    cart.forEach((item, idx) => {
      const price =
        mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price;
      const airFee = Number(item.product.est_shipping_fee_air ?? 0);
      const seaFee = Number(item.product.est_shipping_fee_sea ?? 0);
      const fee = (shippingMethod === 'air' ? airFee : seaFee) * item.quantity;
      const colorInfo = item.selectedColor ? ` [Color: ${item.selectedColor}]` : '';
      const sizeInfo = item.selectedSize ? ` [Size/Model: ${item.selectedSize}]` : '';
      const shipNote = fee > 0 ? ` | Est. Ship: ₦${fee.toLocaleString()}` : '';
      const title = item.product.name || item.product.title || 'Product';
      lines.push(`${idx + 1}. ${title}${colorInfo}${sizeInfo} x${item.quantity} - ₦${(price * item.quantity).toLocaleString()}${shipNote}`);
    });

    lines.push(
      '',
      `*Total Product Cost (Payable Now):* ₦${subtotal.toLocaleString()}`,
      `*Est. Shipping (${shippingMethod.toUpperCase()} Cargo):* ${estimatedShipping > 0 ? `₦${estimatedShipping.toLocaleString()}` : 'Billed upon arrival in Nigeria'}`,
      `*Est. Delivery Timeline:* ${shippingTimeline}`,
      '',
      '📌 *1688 Sourcing Pre-order Terms:* ',
      '1. Initial payment covers product cost only to lock factory prices and production in China.',
      '2. Shipping fee is an estimate and is payable when your package arrives safely in Nigeria.',
      '3. Inspection, photos, and delivery updates provided via WhatsApp.'
    );

    const encoded = encodeURIComponent(lines.join('\n'));
    return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
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

      {/* 1688 Specification Order Matrix Modal */}
      {matrixProduct && (
        <MatrixOrderModal
          product={matrixProduct}
          category={matrixProduct.category_id ? categoryMap.get(matrixProduct.category_id) : null}
          onClose={() => setMatrixProduct(null)}
          onAddBatchToCart={(items) => handleAddBatchToCart(matrixProduct, items)}
          onZoomImage={(url) => setZoomedImage(url)}
        />
      )}

      {/* 1688 Announcement Strip */}
      <div className="bg-[#fa9d26] text-white text-[11px] font-semibold py-1.5 px-4 text-center tracking-wide">
        🇨🇳 China Factory Direct Sourcing (1688) • Direct Factory Prices in Naira • Air Cargo ~3 Weeks • Sea Cargo ~3 Months • WhatsApp Order Confirmation
      </div>

      {/* Main Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <img
              src="/logo.png"
              alt="Dainty Import"
              className="h-9 w-auto rounded-md object-contain shadow-xs border border-[#fa9d26]/20"
            />
            <div>
              <h1 className="text-base font-bold tracking-tight text-stone-900 leading-tight">Dainty Import</h1>
              <p className="text-[10px] sm:text-[11px] font-semibold text-[#fa9d26] uppercase tracking-wider">
                1688 China Pre-orders
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 max-w-md hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 1688 products, models (e.g. iPhone 15, case, bag)..."
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

          <div className="flex items-center gap-2 text-xs">
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
                1688 Wholesale
              </button>
            </div>

            {/* Shipping method switch */}
            <div className="flex rounded-lg border border-stone-200 bg-stone-100 p-0.5">
              <button
                type="button"
                disabled={cartHasSeaOnlyItems}
                onClick={() => setShippingMethod('air')}
                title={cartHasSeaOnlyItems ? 'Cart contains Sea Cargo only items' : 'Air cargo delivery within 3 weeks'}
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
                onClick={() => setShippingMethod('sea')}
                title="Sea cargo delivery within 3 months"
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  shippingMethod === 'sea' ? 'bg-white text-stone-900 shadow-xs font-semibold' : 'text-stone-600'
                }`}
              >
                <Ship className="h-4 w-4 text-blue-600" />
                Sea (3 mos)
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Search Input */}
        <div className="p-2 border-t border-stone-100 md:hidden px-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products, models, colors..."
              className="w-full rounded-full border border-stone-200 bg-stone-50 pl-8 pr-4 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:border-[#fa9d26] focus:bg-white focus:outline-hidden"
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8 sm:px-6">
        {/* 1688 How Pre-orders Work Banner */}
        <section className="mb-8 overflow-hidden rounded-2xl border border-[#fa9d26]/30 bg-gradient-to-br from-[#fce7cc]/90 via-[#fff8f0] to-white p-5 sm:p-7 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#fa9d26]/20 pb-5">
            <div className="flex items-center gap-3.5">
              <img
                src="/logo.png"
                alt="Dainty Import"
                className="h-12 w-auto sm:h-14 rounded-xl object-contain shadow-xs border border-[#fa9d26]/30 bg-white p-1"
              />
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fa9d26] px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider shadow-2xs">
                  1688 Factory Direct Portal
                </span>
                <h2 className="mt-1 text-lg sm:text-2xl font-bold tracking-tight text-stone-900">
                  How 1688 China Pre-Orders Work
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 max-w-xl">
                  Source direct from 1688 China suppliers in Naira. Mix sizes & colors with our wholesale specification matrix, and send directly to WhatsApp.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-col gap-2 shrink-0 text-xs w-full sm:w-auto">
              <div className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-1.5 font-medium text-stone-800 shadow-2xs border border-[#fa9d26]/25">
                <span>✈️</span> <span><strong>Air Cargo:</strong> Within 3 weeks</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-1.5 font-medium text-stone-800 shadow-2xs border border-[#fa9d26]/25">
                <span>🚢</span> <span><strong>Sea Cargo:</strong> Within 3 months</span>
              </div>
            </div>
          </div>

          {/* 4 Step Process Cards */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-stone-200/80 bg-white/90 p-3.5 shadow-2xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#fa9d26] text-white text-[11px]">1</span>
                <span>Wholesale & Retail</span>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-600 leading-relaxed">
                Choose <strong>Wholesale</strong> for 1688 factory pricing or <strong>Retail</strong>. Minimum for iPhone cases is 50 pieces per item.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200/80 bg-white/90 p-3.5 shadow-2xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#fa9d26] text-white text-[11px]">2</span>
                <span>1688 Spec Matrix</span>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-600 leading-relaxed">
                Click <strong>1688 Batch Order</strong> to mix and match sizes, models, and colors in one table to hit the wholesale MOQ.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200/80 bg-white/90 p-3.5 shadow-2xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#fa9d26] text-white text-[11px]">3</span>
                <span>Select Shipping Cargo</span>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-600 leading-relaxed">
                Pick <strong>Air Cargo (3 weeks)</strong> or <strong>Sea Cargo (3 months)</strong>. Heavy/restricted goods automatically use Sea.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200/80 bg-white/90 p-3.5 shadow-2xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#fa9d26] text-white text-[11px]">4</span>
                <span>Two-Step Payment</span>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-600 leading-relaxed">
                <strong>Pay product cost upfront</strong> to lock in China factory order. <strong>Shipping fee is paid upon arrival</strong> in Nigeria.
              </p>
            </div>
          </div>
        </section>

        {/* Categories Bar */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2 text-xs">
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
          <div className="py-20 text-center text-sm text-stone-500">
            {searchQuery
              ? `No products found matching "${searchQuery}".`
              : 'No products found in this category.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
      </main>

      {/* Cart Drawer / Bottom Sheet */}
      {cart.length > 0 && (
        <aside className="fixed bottom-0 right-0 z-40 w-full border-t border-stone-200 bg-white p-4 shadow-xl sm:bottom-6 sm:right-6 sm:w-96 sm:rounded-2xl sm:border">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2 font-bold text-sm">
              <ShoppingBag className="h-4 w-4" />
              Preorder Cart ({cart.reduce((s, i) => s + i.quantity, 0)})
            </div>
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-stone-400 hover:text-stone-600"
            >
              Clear
            </button>
          </div>

          {/* Sea Only Cart Notice if applicable */}
          {cartHasSeaOnlyItems && (
            <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-2 text-[11px] text-blue-800 flex items-start gap-1.5">
              <Ship className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Some items in your cart can only be shipped by Sea Cargo. Shipping is set to Sea Cargo (within 3 months).</span>
            </div>
          )}

          {/* Wholesale Warnings for Item and Category Scopes */}
          {wholesaleMoqWarnings.length > 0 && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1 text-amber-800">
                <AlertCircle className="h-3.5 w-3.5" />
                Wholesale Minimum Notice:
              </div>
              {wholesaleMoqWarnings.map((w, idx) => (
                <div key={idx} className="text-[11px] leading-snug">
                  • <strong>{w.name}</strong> ({w.scope === 'item' ? 'Item MOQ' : 'Category MOQ'}): Minimum order is <strong>{w.required} pcs</strong> (Currently: {w.current} pcs. Need {w.required - w.current} more).
                </div>
              ))}
            </div>
          )}

          <div className="max-h-56 space-y-2.5 overflow-y-auto py-3 text-xs">
            {cart.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {item.selectedImage && (
                    <img
                      src={item.selectedImage}
                      alt={item.product.name || 'Item'}
                      className="h-10 w-10 shrink-0 rounded-md border border-stone-200 object-contain bg-stone-50"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate text-stone-900">
                      {item.product.name || item.product.title || 'Product'}
                    </div>
                    <div className="text-[11px] text-stone-500">
                      {item.selectedColor && <span>Color: {item.selectedColor} </span>}
                      {item.selectedSize && <span>Model: {item.selectedSize}</span>}
                    </div>
                    <div className="font-semibold text-stone-900">
                      ₦{((mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price) * item.quantity).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <div className="flex items-center rounded border border-stone-200 bg-stone-50">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product.id, item.selectedColor, item.selectedSize, -1)}
                      className="p-1 hover:bg-stone-200"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="px-1.5 font-bold text-xs">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product.id, item.selectedColor, item.selectedSize, 1)}
                      className="p-1 hover:bg-stone-200"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.product.id, item.selectedColor, item.selectedSize)}
                    className="p-1 text-stone-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pricing & Checkout */}
          <div className="border-t border-stone-100 pt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-600">Product Total (To Pay Now):</span>
              <span className="font-bold text-base text-stone-900">₦{subtotal.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-stone-500">
              <span>Est. Shipping ({shippingMethod.toUpperCase()} Cargo):</span>
              <span>{estimatedShipping > 0 ? `₦${estimatedShipping.toLocaleString()}` : 'Payable upon arrival'}</span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-stone-500">
              <span>Est. Timeline:</span>
              <span className="font-medium text-stone-800">{shippingTimeline}</span>
            </div>

            <a
              href={buildWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-700 transition active:scale-98"
            >
              <MessageCircle className="h-4 w-4" />
              Send Preorder on WhatsApp
            </a>

            <p className="text-[10px] text-center text-stone-400 leading-tight">
              Pre-order payment covers product sourcing upfront. Shipping fee is billed when your package arrives safely in Nigeria.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
