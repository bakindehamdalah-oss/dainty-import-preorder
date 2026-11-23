'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingBag, Plane, Ship, MessageCircle, Plus, Minus, Trash2, Maximize2, X, Check, AlertCircle, Info } from 'lucide-react';

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

function ProductCard({
  product,
  mode,
  categoryMap,
  onAddToCart,
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
  onZoomImage: (url: string) => void;
}) {
  const productTitle = product.name || product.title || 'Product';
  const displayPrice = mode === 'wholesale' ? product.wholesale_price : product.retail_price;
  const cat = product.category_id ? categoryMap.get(product.category_id) : null;
  const moq = getProductWholesaleMOQ(product, cat);

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

  // Gather all available color options
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

  // Gather all available size/model options
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
        {/* Crisp product image container with zoom */}
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

          {/* Badges */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start">
            {mode === 'wholesale' && (
              <span className="rounded-md bg-amber-500/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs tracking-wide uppercase">
                MOQ: {moq} pcs
              </span>
            )}
            {!hasAir && hasSea && (
              <span className="rounded-md bg-blue-600/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-xs">
                Sea Only
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
              <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                Wholesale Min: {moq} pcs
              </span>
            )}
          </div>
          <h2 className="mt-1 text-base font-semibold text-stone-900">{productTitle}</h2>

          {/* Size / Model selector chips */}
          {allSizes.length > 1 ? (
            <div className="mt-3">
              <span className="text-[11px] font-medium text-stone-600 block mb-1.5">
                Select Size / Model: <span className="font-bold text-stone-900">{selectedSize || 'Choose'}</span>
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

          {/* Color selector chips */}
          {allColors.length > 0 && (
            <div className="mt-3">
              <span className="text-[11px] font-medium text-stone-600 block mb-1.5">
                Select Color: <span className="font-bold text-stone-900">{selectedColor || 'Choose'}</span>
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

      {/* Pricing & Add to Cart button */}
      <div className="border-t border-stone-100 px-4 py-3 bg-stone-50/50">
        <div className="flex items-center justify-between mb-2">
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
                <span className="text-blue-700 font-medium">
                  🚢 Sea Only: ₦{seaFee.toLocaleString()} <span className="text-stone-400 font-normal">(Air N/A)</span>
                </span>
              ) : hasAir && !hasSea ? (
                <span className="text-emerald-700 font-medium">
                  ✈️ Air Only: ₦{airFee.toLocaleString()}
                </span>
              ) : (
                <span className="text-stone-400 italic">Shipping billed on arrival</span>
              )}
            </div>
          </div>

          {/* Quantity Selector on Card */}
          <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setOrderQty((q) => Math.max(mode === 'wholesale' ? moq : 1, q - (mode === 'wholesale' ? 5 : 1)))}
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

        <button
          type="button"
          onClick={() => onAddToCart(product, selectedColor, selectedSize, activeImage, orderQty)}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2 text-xs font-semibold text-white hover:bg-[#fa9d26] transition shadow-xs active:scale-98"
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

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

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter((p) => p.category_id === selectedCategory);
  }, [products, selectedCategory]);

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

  // Updated shipping timelines: Air within 3 weeks, Sea within 3 months
  const shippingTimeline = shippingMethod === 'air' ? 'Within 3 weeks' : 'Within 3 months';

  // Check Wholesale MOQ requirements
  const wholesaleMoqWarnings = useMemo(() => {
    if (mode !== 'wholesale') return [];
    const warnings: { name: string; required: number; current: number }[] = [];
    const productQtyMap = new Map<string, number>();

    for (const item of cart) {
      productQtyMap.set(item.product.id, (productQtyMap.get(item.product.id) || 0) + item.quantity);
    }

    for (const [prodId, totalQty] of productQtyMap.entries()) {
      const item = cart.find((c) => c.product.id === prodId);
      if (item) {
        const cat = item.product.category_id ? categoryMap.get(item.product.category_id) : null;
        const moq = getProductWholesaleMOQ(item.product, cat);
        if (totalQty < moq) {
          warnings.push({
            name: item.product.name || item.product.title || 'Product',
            required: moq,
            current: totalQty,
          });
        }
      }
    }
    return warnings;
  }, [cart, mode, categoryMap]);

  function buildWhatsAppLink() {
    const cleanPhone = (settings?.whatsapp_number || '').replace(/[^0-9]/g, '');
    const lines = [
      `*Preorder Request (${mode.toUpperCase()})*`,
      `*Sourcing:* China Direct Factory`,
      `*Shipping Method:* ${shippingMethod.toUpperCase()} Cargo (${shippingTimeline})`,
      '',
      '*Items Ordered:*',
      ...cart.map((item, idx) => {
        const price =
          mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price;
        const airFee = Number(item.product.est_shipping_fee_air ?? 0);
        const seaFee = Number(item.product.est_shipping_fee_sea ?? 0);
        const fee = (shippingMethod === 'air' ? airFee : seaFee) * item.quantity;
        const colorInfo = item.selectedColor ? ` [Color: ${item.selectedColor}]` : '';
        const sizeInfo = item.selectedSize ? ` [Size/Model: ${item.selectedSize}]` : '';
        const shipNote = fee > 0 ? ` | Est. Ship: ₦${fee.toLocaleString()}` : '';
        const title = item.product.name || item.product.title || 'Product';
        return `${idx + 1}. ${title}${colorInfo}${sizeInfo} x${item.quantity} - ₦${(price * item.quantity).toLocaleString()}${shipNote}`;
      }),
      '',
      `*Total to Pay Now (Items Only):* ₦${subtotal.toLocaleString()}`,
      `*Est. Shipping (${shippingMethod.toUpperCase()} Cargo):* ${estimatedShipping > 0 ? `₦${estimatedShipping.toLocaleString()}` : 'Billed upon arrival'}`,
      `*Est. Delivery Timeline:* ${shippingTimeline}`,
      '',
      '📌 *Pre-order Terms:* ',
      '• Initial payment covers product cost only to lock in direct China factory sourcing.',
      '• Shipping fee is an estimate and is payable when your package arrives safely in Nigeria.'
    ];
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

      {/* Top Banner */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Dainty Import"
              className="h-9 w-auto rounded-md object-contain shadow-xs border border-[#fa9d26]/20"
            />
            <div>
              <h1 className="text-base font-bold tracking-tight text-stone-900 leading-tight">Dainty Import</h1>
              <p className="text-[10px] sm:text-[11px] font-semibold text-[#fa9d26] uppercase tracking-wider">
                China Direct Pre-orders
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {/* Mode switch */}
            <div className="flex rounded-lg border border-stone-200 bg-stone-100 p-0.5">
              <button
                type="button"
                onClick={() => setMode('retail')}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  mode === 'retail' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => setMode('wholesale')}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  mode === 'wholesale' ? 'bg-amber-500 text-white font-semibold shadow-xs' : 'text-stone-600'
                }`}
              >
                Wholesale
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
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600'
                }`}
              >
                <Plane className="h-4 w-4 text-emerald-600" />
                Air (Within 3 wks)
              </button>
              <button
                type="button"
                onClick={() => setShippingMethod('sea')}
                title="Sea cargo delivery within 3 months"
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  shippingMethod === 'sea' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
                }`}
              >
                <Ship className="h-4 w-4 text-blue-600" />
                Sea (Within 3 mos)
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8 sm:px-6">
        {/* How Pre-orders Work Banner */}
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
                  China Factory Direct
                </span>
                <h2 className="mt-1 text-lg sm:text-2xl font-bold tracking-tight text-stone-900">
                  How Pre-Orders Work at Dainty Import
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 max-w-xl">
                  Curated China factory sourcing in Nigerian Naira. Custom sizes, colors, transparent shipping, and WhatsApp checkout.
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
                <span>Browse & Select</span>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-600 leading-relaxed">
                Choose <strong>Retail</strong> or <strong>Wholesale</strong> mode. Pick your specific colors, sizes / phone models, and quantities.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200/80 bg-white/90 p-3.5 shadow-2xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#fa9d26] text-white text-[11px]">2</span>
                <span>Select Shipping</span>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-600 leading-relaxed">
                Choose <strong>Air Cargo (within 3 weeks)</strong> or <strong>Sea Cargo (within 3 months)</strong>. Restricted items ship via Sea only.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200/80 bg-white/90 p-3.5 shadow-2xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#fa9d26] text-white text-[11px]">3</span>
                <span>Order on WhatsApp</span>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-600 leading-relaxed">
                Click <strong>Send Preorder on WhatsApp</strong>. Your complete specifications are sent to us immediately to lock in stock.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200/80 bg-white/90 p-3.5 shadow-2xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#fa9d26] text-white text-[11px]">4</span>
                <span>Two-Step Payment</span>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-600 leading-relaxed">
                <strong>Pay product cost upfront</strong> for China sourcing. <strong>Shipping fee is paid on arrival</strong> in Nigeria.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#fa9d26]/15 px-3 py-2 text-[11px] text-[#a15400]">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              <strong>Note on wholesale & shipping:</strong> Wholesale minimum for iPhone cases is 50 pieces. Payment on preorder covers product cost only; shipping estimates are shown so you can budget accurately.
            </span>
          </div>
        </section>

        {/* Categories Bar */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2 text-xs">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`rounded-full px-4 py-1.5 font-medium transition whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
            }`}
          >
            All Products
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCategory(c.id)}
              className={`rounded-full px-4 py-1.5 font-medium transition whitespace-nowrap ${
                selectedCategory === c.id
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm text-stone-500">Loading China catalog...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-20 text-center text-sm text-stone-500">
            No products found in this category.
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

          {/* Wholesale Warnings */}
          {wholesaleMoqWarnings.length > 0 && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1 text-amber-800">
                <AlertCircle className="h-3.5 w-3.5" />
                Wholesale Minimum Notice:
              </div>
              {wholesaleMoqWarnings.map((w, idx) => (
                <div key={idx} className="text-[11px]">
                  • <strong>{w.name}</strong>: Minimum order is <strong>{w.required} pcs</strong> (Currently: {w.current} pcs).
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
                      {item.selectedColor && (
                        <span className="font-medium text-stone-700">Color: {item.selectedColor} • </span>
                      )}
                      {item.selectedSize && (
                        <span className="font-medium text-stone-700">Size: {item.selectedSize} • </span>
                      )}
                      ₦{(mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.product.id, item.selectedColor, item.selectedSize, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-stone-300 hover:bg-stone-100"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center font-semibold">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.product.id, item.selectedColor, item.selectedSize, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-stone-300 hover:bg-stone-100"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.product.id, item.selectedColor, item.selectedSize)}
                    className="ml-1 text-stone-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs mt-2">
            <div className="flex justify-between text-stone-700">
              <span>Product Subtotal ({mode}):</span>
              <span className="font-semibold">₦{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-stone-700">
              <span>
                Est. {shippingMethod === 'air' ? 'Air Cargo (within 3 wks)' : 'Sea Cargo (within 3 mos)'}:
              </span>
              <span className="font-semibold">
                {estimatedShipping > 0 ? `₦${estimatedShipping.toLocaleString()}` : 'Billed on arrival'}
              </span>
            </div>
            <div className="border-t border-stone-200 pt-2">
              <div className="flex justify-between text-sm font-bold text-stone-900">
                <span>Total to Pay Now:</span>
                <span className="text-emerald-700">₦{subtotal.toLocaleString()}</span>
              </div>
              <p className="mt-1 text-[10px] text-stone-500">
                * Payment on preorder covers product cost only. Shipping fee is an estimate and payable upon arrival in Nigeria.
              </p>
            </div>
          </div>

          <a
            href={buildWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition ${
              wholesaleMoqWarnings.length > 0
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            {wholesaleMoqWarnings.length > 0 ? 'Review & Send on WhatsApp' : 'Send Preorder on WhatsApp'}
          </a>
        </aside>
      )}
    </div>
  );
}
