'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingBag, Plane, Ship, MessageCircle, Plus, Minus, Trash2 } from 'lucide-react';

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
  name: string;
  description: string | null;
  image_url: string | null;
  retail_price: number;
  wholesale_price: number;
  est_weight_kg: number;
};

type CartItem = {
  product: Product;
  quantity: number;
};

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

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeItem(productId: string) {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  }

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const unitPrice =
        mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price;
      return sum + unitPrice * item.quantity;
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

  const estimatedShipping = totalWeightKg * ratePerKg;
  const estimatedTotal = subtotal + estimatedShipping;

  const wholesaleWarnings = useMemo(() => {
    if (mode !== 'wholesale' || cart.length === 0) return [];
    const warnings: string[] = [];

    const byCategory = new Map<string, { cat: Category | undefined; qty: number; items: CartItem[] }>();
    for (const item of cart) {
      const key = item.product.category_id || 'uncategorized';
      const cat = item.product.category_id ? categoryMap.get(item.product.category_id) : undefined;
      const entry = byCategory.get(key) || { cat, qty: 0, items: [] };
      entry.qty += item.quantity;
      entry.items.push(item);
      byCategory.set(key, entry);
    }

    for (const [, group] of byCategory) {
      if (!group.cat) continue;
      const moq = group.cat.wholesale_moq || 1;
      if (group.cat.allow_mix_and_match) {
        if (group.qty < moq) {
          warnings.push(
            `${group.cat.name}: requires at least ${moq} total items across the category (currently ${group.qty}).`
          );
        }
      } else {
        for (const item of group.items) {
          if (item.quantity < moq) {
            warnings.push(
              `${group.cat.name} ("${item.product.name}"): requires at least ${moq} of this item (currently ${item.quantity}).`
            );
          }
        }
      }

      if (shippingMethod === 'air' && !group.cat.allow_air_shipping) {
        warnings.push(`${group.cat.name} does not allow Air shipping.`);
      }
      if (shippingMethod === 'sea' && !group.cat.allow_sea_shipping) {
        warnings.push(`${group.cat.name} does not allow Sea shipping.`);
      }
    }

    return warnings;
  }, [mode, cart, categoryMap, shippingMethod]);

  function buildWhatsAppLink() {
    const cleanPhone = (settings?.whatsapp_number || '').replace(/[^0-9]/g, '');
    const lines = [
      `Hello Dainty Import! I'd like to place a ${mode.toUpperCase()} preorder (${shippingMethod.toUpperCase()} shipping):`,
      '',
      ...cart.map((item) => {
        const price =
          mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price;
        return `- ${item.product.name} x${item.quantity} (${price.toLocaleString()} each)`;
      }),
      '',
      `Subtotal: ${subtotal.toLocaleString()}`,
      `Est. Weight: ${totalWeightKg.toFixed(2)} kg`,
      `Est. Shipping (${shippingMethod.toUpperCase()}): ${estimatedShipping.toLocaleString()}`,
      `Est. Total: ${estimatedTotal.toLocaleString()}`,
    ];
    const encoded = encodeURIComponent(lines.join('\n'));
    return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Dainty Import Preorder</h1>
            <p className="text-xs text-stone-500">Retail & Wholesale Preorder Storefront</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode('retail')}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  mode === 'retail' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => setMode('wholesale')}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  mode === 'wholesale' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
                }`}
              >
                Wholesale
              </button>
            </div>

            <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-1 text-sm">
              <button
                type="button"
                onClick={() => setShippingMethod('air')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  shippingMethod === 'air' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
                }`}
              >
                <Plane className="h-4 w-4" />
                Air
              </button>
              <button
                type="button"
                onClick={() => setShippingMethod('sea')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                  shippingMethod === 'sea' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
                }`}
              >
                <Ship className="h-4 w-4" />
                Sea
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                selectedCategory === 'all'
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-300 bg-white text-stone-700'
              }`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  selectedCategory === cat.id
                    ? 'bg-stone-900 text-white'
                    : 'border border-stone-300 bg-white text-stone-700'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-stone-500">Loading products...</p>
          ) : errorMsg ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMsg}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
              No products found yet. Add categories and products in your database or admin page.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {filteredProducts.map((product) => {
                const displayPrice =
                  mode === 'wholesale' ? product.wholesale_price : product.retail_price;
                const cat = product.category_id ? categoryMap.get(product.category_id) : null;

                return (
                  <div
                    key={product.id}
                    className="flex flex-col justify-between overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs"
                  >
                    <div>
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-48 w-full object-cover bg-stone-100"
                        />
                      ) : (
                        <div className="flex h-48 w-full items-center justify-center bg-stone-100 text-xs text-stone-400">
                          No image
                        </div>
                      )}
                      <div className="p-4">
                        {cat && (
                          <span className="text-xs font-medium text-stone-500">{cat.name}</span>
                        )}
                        <h2 className="mt-1 text-base font-semibold">{product.name}</h2>
                        {product.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-stone-600">
                            {product.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3">
                      <div>
                        <div className="text-base font-bold">
                          {Number(displayPrice).toLocaleString()}
                        </div>
                        <div className="text-xs text-stone-500">
                          Est. wt: {product.est_weight_kg} kg ({mode})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-stone-800"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="h-fit rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
            <ShoppingBag className="h-5 w-5" />
            <h2 className="font-semibold">Preorder Summary</h2>
          </div>

          {cart.length === 0 ? (
            <p className="py-6 text-sm text-stone-500">Your preorder list is empty.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {cart.map((item) => {
                const price =
                  mode === 'wholesale' ? item.product.wholesale_price : item.product.retail_price;
                return (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between gap-2 border-b border-stone-100 pb-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.product.name}</p>
                      <p className="text-xs text-stone-500">
                        {Number(price).toLocaleString()} each • {item.product.est_weight_kg} kg
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="rounded border border-stone-200 p-1 hover:bg-stone-50"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="rounded border border-stone-200 p-1 hover:bg-stone-50"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        className="ml-1 rounded p-1 text-stone-400 hover:text-red-600"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {wholesaleWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                  <p className="font-semibold">Wholesale / Shipping Notes:</p>
                  {wholesaleWarnings.map((w, idx) => (
                    <p key={idx}>• {w}</p>
                  ))}
                </div>
              )}

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal ({mode})</span>
                  <span>{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>Total Est. Weight</span>
                  <span>{totalWeightKg.toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>
                    Est. {shippingMethod === 'air' ? 'Air' : 'Sea'} Shipping (@{' '}
                    {ratePerKg.toLocaleString()}/kg)
                  </span>
                  <span>{estimatedShipping.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold">
                  <span>Estimated Total</span>
                  <span>{estimatedTotal.toLocaleString()}</span>
                </div>
              </div>

              <a
                href={buildWhatsAppLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" />
                Send Preorder on WhatsApp
              </a>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
