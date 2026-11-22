'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingBag, Plane, Ship, MessageCircle, Plus, Minus, Trash2, Maximize2, X, Check } from 'lucide-react';

type StoreSettings = {
  id: number;
  whatsapp_number: string | null;
  air_rate_per_kg: number;
  sea_rate_per_kg: number;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  wholesale_moq: number;
  allow_mix_and_match: boolean;
  allow_air_shipping: boolean;
  allow_sea_shipping: boolean;
};

type Product = {
  id: string;
  category_id: string | null;
  name?: string | null;
  title?: string | null;
  size?: string | null;
  description: string | null;
  image_url: string | null;
  images?: string[] | null;
  colors?: string[] | null;
  color_options?: string | null;
  variants?: { color?: string; image_url?: string }[] | null;
  retail_price: number;
  wholesale_price: number;
  est_shipping_fee?: number | null;
  est_shipping_fee_air?: number | null;
  est_shipping_fee_sea?: number | null;
  est_weight_kg?: number;
};

type CartItem = {
  product: Product;
  quantity: number;
  selectedColor?: string | null;
  selectedImage?: string | null;
};

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
  onAddToCart: (product: Product, selectedColor?: string | null, selectedImage?: string | null) => void;
  onZoomImage: (url: string) => void;
}) {
  const productTitle = product.name || product.title || 'Product';
  const displayPrice = mode === 'wholesale' ? product.wholesale_price : product.retail_price;
  const cat = product.category_id ? categoryMap.get(product.category_id) : null;

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
    // Also parse from description if formatted as "Colors: red, blue"
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

  const [activeImage, setActiveImage] = useState<string>(allImages[0] || '');
  const [selectedColor, setSelectedColor] = useState<string | null>(allColors[0] || null);

  useEffect(() => {
    if (allImages.length > 0 && !allImages.includes(activeImage)) {
      setActiveImage(allImages[0]);
    }
  }, [allImages]);

  function handleSelectColor(colorName: string, index?: number) {
    setSelectedColor(colorName);
    // If there is an image matching this index or associated with this color, switch image
    if (typeof index === 'number' && allImages[index]) {
      setActiveImage(allImages[index]);
    }
  }

  return (
    <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs transition hover:shadow-md">
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
                  activeImage === img ? 'border-stone-900 ring-2 ring-stone-900/10' : 'border-stone-200 opacity-70 hover:opacity-100'
                }`}
              >
                <img src={img} alt={`Angle ${idx + 1}`} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}

        {/* Product Details */}
        <div className="p-4">
          {cat && <span className="text-xs font-medium text-stone-500">{cat.name}</span>}
          <h2 className="mt-1 text-base font-semibold text-stone-900">{productTitle}</h2>

          {product.size && (
            <span className="mt-1 inline-block rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
              Size: {product.size}
            </span>
          )}

          {/* Color selector chips */}
          {allColors.length > 0 && (
            <div className="mt-3">
              <span className="text-[11px] font-medium text-stone-500 block mb-1.5">
                Select Color: <span className="font-semibold text-stone-900">{selectedColor || 'Choose'}</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {allColors.map((col, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectColor(col, idx)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      selectedColor === col
                        ? 'bg-stone-900 text-white shadow-xs'
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
            <p className="mt-2 line-clamp-2 text-xs text-stone-600">{product.description}</p>
          )}
        </div>
      </div>

      {/* Pricing & Add to Cart button */}
      <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 bg-stone-50/30">
        <div>
          <div className="text-base font-bold text-stone-900">
            ₦{Number(displayPrice).toLocaleString()}
          </div>
          <div className="text-[11px] text-stone-500">
            Air: ₦{Number(product.est_shipping_fee_air ?? product.est_shipping_fee ?? 0).toLocaleString()} • Sea: ₦{Number(product.est_shipping_fee_sea ?? product.est_shipping_fee ?? 0).toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onAddToCart(product, selectedColor, activeImage)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-stone-800 transition shadow-xs active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Add
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

  function addToCart(product: Product, selectedColor?: string | null, selectedImage?: string | null) {
    setCart((prev) => {
      const matchItem = (item: CartItem) =>
        item.product.id === product.id && (item.selectedColor || '') === (selectedColor || '');
      const existing = prev.find(matchItem);
      if (existing) {
        return prev.map((item) =>
          matchItem(item) ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          selectedColor: selectedColor || null,
          selectedImage: selectedImage || product.image_url || null,
        },
      ];
    });
  }

  function updateQuantity(productId: string, selectedColor: string | null | undefined, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          const isMatch =
            item.product.id === productId && (item.selectedColor || '') === (selectedColor || '');
          return isMatch ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item;
        })
        .filter((item) => item.quantity > 0)
    );
  }

  function removeItem(productId: string, selectedColor?: string | null) {
    setCart((prev) =>
      prev.filter(
        (item) =>
          !(item.product.id === productId && (item.selectedColor || '') === (selectedColor || ''))
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

  const totalWeightKg = useMemo(() => {
    return cart.reduce(
      (sum, item) => sum + Number(item.product.est_weight_kg || 0) * item.quantity,
      0
    );
  }, [cart]);

  const ratePerKg =
    shippingMethod === 'air'
      ? Number(settings?.air_rate_per_kg || 0)
      : Number(settings?.sea_rate_per_kg || 0);

  const estimatedShipping = useMemo(() => {
    return cart.reduce((sum, item) => {
      const airFee = Number(item.product.est_shipping_fee_air ?? item.product.est_shipping_fee ?? 0);
      const seaFee = Number(item.product.est_shipping_fee_sea ?? item.product.est_shipping_fee ?? 0);
      const perItemFee = shippingMethod === 'air' ? airFee : seaFee;

      if (perItemFee > 0) {
        return sum + perItemFee * item.quantity;
      }
      const weight = Number(item.product.est_weight_kg || 0);
      const rate = shippingMethod === 'air' ? Number(settings?.air_rate_per_kg || 0) : Number(settings?.sea_rate_per_kg || 0);
      return sum + weight * rate * item.quantity;
    }, 0);
  }, [cart, shippingMethod, settings]);

  const estimatedTotal = subtotal + estimatedShipping;
  const shippingTimeline = shippingMethod === 'air' ? '7–14 days' : '45–60 days';

  function buildWhatsAppLink() {
    const cleanPhone = (settings?.whatsapp_number || '').replace(/[^0-9]/g, '');
    const lines = [
      `*Preorder Request (${mode.toUpperCase()})*`,
      `*Shipping Method:* ${shippingMethod.toUpperCase()} Cargo (${shippingTimeline})`,
      '',
      '*Items Ordered:*',
      ...cart.map((item, idx) => {
        const price =
          mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price;
        const airFee = Number(item.product.est_shipping_fee_air ?? item.product.est_shipping_fee ?? 0);
        const seaFee = Number(item.product.est_shipping_fee_sea ?? item.product.est_shipping_fee ?? 0);
        const fee = (shippingMethod === 'air' ? airFee : seaFee) * item.quantity;
        const colorInfo = item.selectedColor ? ` [Color: ${item.selectedColor}]` : '';
        const sizeInfo = item.product.size ? ` [Size: ${item.product.size}]` : '';
        const shipNote = fee > 0 ? ` | Est. Ship: ₦${fee.toLocaleString()}` : '';
        const title = item.product.name || item.product.title || 'Product';
        return `${idx + 1}. ${title}${colorInfo}${sizeInfo} x${item.quantity} - ₦${(price * item.quantity).toLocaleString()}${shipNote}`;
      }),
      '',
      `*Total to Pay Now (Items Only):* ₦${subtotal.toLocaleString()}`,
      `*Est. Shipping (${shippingMethod.toUpperCase()}):* ₦${estimatedShipping.toLocaleString()}`,
      `*Est. Delivery Timeline:* ${shippingTimeline}`,
      '',
      '📌 *Note on Shipping:*',
      'The initial payment covers the product cost only. The shipping fee shown is an estimate; exact shipping will be billed upon arrival once weighed and measured in Nigeria.'
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
              <p className="text-[10px] sm:text-[11px] font-semibold text-[#fa9d26] uppercase tracking-wider">Direct 1688 Pre-orders</p>
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
                  mode === 'wholesale' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
                }`}
              >
                Wholesale
              </button>
            </div>

            {/* Shipping method switch */}
            <div className="flex rounded-lg border border-stone-200 bg-stone-100 p-0.5">
              <button
                type="button"
                onClick={() => setShippingMethod('air')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  shippingMethod === 'air' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
                }`}
              >
                <Plane className="h-4 w-4 text-emerald-600" />
                Air (7–14d)
              </button>
              <button
                type="button"
                onClick={() => setShippingMethod('sea')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  shippingMethod === 'sea' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
                }`}
              >
                <Ship className="h-4 w-4 text-blue-600" />
                Sea (45–60d)
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8 sm:px-6">
        {/* Dainty Import Brand Banner */}
        <div className="mb-6 sm:mb-8 overflow-hidden rounded-2xl border border-[#fa9d26]/30 bg-gradient-to-r from-[#fce7cc] via-[#fff5eb] to-[#fce7cc] p-5 sm:p-7 shadow-xs">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <img
                src="/logo.png"
                alt="Dainty Import"
                className="h-16 w-auto rounded-xl object-contain shadow-xs border border-[#fa9d26]/30"
              />
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fa9d26] px-3 py-0.5 text-xs font-bold text-white uppercase tracking-wider shadow-xs">
                  Factory-Direct 1688 Pre-Orders
                </span>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
                  Curated 1688 Sourcing in Naira
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-stone-700 max-w-xl">
                  Shop transparently with upfront product prices in ₦. Choose Air or Sea shipping, pay for your items, and checkout directly via WhatsApp.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap sm:flex-col gap-2 shrink-0 text-xs">
              <div className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 font-medium text-stone-800 shadow-xs border border-[#fa9d26]/20">
                <span>✈️</span> <span><strong>Air Cargo:</strong> 7–14 days</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 font-medium text-stone-800 shadow-xs border border-[#fa9d26]/20">
                <span>🚢</span> <span><strong>Sea Cargo:</strong> 45–60 days</span>
              </div>
            </div>
          </div>
        </div>

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
          <div className="py-20 text-center text-sm text-stone-500">Loading catalog...</div>
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
                      {item.product.size && <span>Size: {item.product.size} • </span>}
                      ₦{(mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.product.id, item.selectedColor, -1)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-stone-300 hover:bg-stone-100"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-5 text-center font-semibold">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.product.id, item.selectedColor, 1)}
                    className="flex h-6 w-6 items-center justify-center rounded border border-stone-300 hover:bg-stone-100"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.product.id, item.selectedColor)}
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
                Est. {shippingMethod === 'air' ? 'Air Cargo (7–14 days)' : 'Sea Cargo (45–60 days)'}:
              </span>
              <span className="font-semibold">₦{estimatedShipping.toLocaleString()}</span>
            </div>
            <div className="border-t border-stone-200 pt-2">
              <div className="flex justify-between text-sm font-bold text-stone-900">
                <span>Total to Pay Now:</span>
                <span className="text-emerald-700">₦{subtotal.toLocaleString()}</span>
              </div>
              <p className="mt-1 text-[10px] text-stone-500">
                * Estimated shipping is payable upon arrival when weighed in Nigeria.
              </p>
            </div>
          </div>

          <a
            href={buildWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
          >
            <MessageCircle className="h-4 w-4" />
            Send Preorder on WhatsApp
          </a>
        </aside>
      )}
    </div>
  );
}
