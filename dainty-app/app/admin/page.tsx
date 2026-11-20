'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, LogOut, Plus, Save, Trash2 } from 'lucide-react';

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

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [airRate, setAirRate] = useState('0');
  const [seaRate, setSeaRate] = useState('0');

  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [wholesaleMoq, setWholesaleMoq] = useState('1');
  const [mixAndMatch, setMixAndMatch] = useState(true);
  const [allowAir, setAllowAir] = useState(true);
  const [allowSea, setAllowSea] = useState(true);

  const [prodName, setProdName] = useState('');
  const [prodCategoryId, setProdCategoryId] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [estWeightKg, setEstWeightKg] = useState('0.5');

  async function refreshData() {
    setErrorMsg(null);
    const [settingsRes, catsRes, prodsRes] = await Promise.all([
      supabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('categories').select('*').order('name', { ascending: true }),
      supabase.from('products').select('*').order('created_at', { ascending: false }),
    ]);

    if (settingsRes.error || catsRes.error || prodsRes.error) {
      setErrorMsg(
        settingsRes.error?.message ||
          catsRes.error?.message ||
          prodsRes.error?.message ||
          'Failed to load admin data.'
      );
      return;
    }

    if (settingsRes.data) {
      setWhatsappNumber(settingsRes.data.whatsapp_number || '');
      setAirRate(String(settingsRes.data.air_rate_per_kg ?? 0));
      setSeaRate(String(settingsRes.data.sea_rate_per_kg ?? 0));
    }

    const loadedCats = catsRes.data || [];
    setCategories(loadedCats);
    if (!prodCategoryId && loadedCats.length > 0) {
      setProdCategoryId(loadedCats[0].id);
    }
    setProducts(prodsRes.data || []);
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAuthLoading(false);
      if (data.session) {
        refreshData();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession) {
        refreshData();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setSigningIn(true);
    setErrorMsg(null);
    setStatusMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setSigningIn(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setPassword('');
    }
  }

  async function handleLogout() {
    setErrorMsg(null);
    setStatusMsg(null);
    await supabase.auth.signOut();
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);

    const { error } = await supabase.from('store_settings').upsert({
      id: 1,
      whatsapp_number: whatsappNumber.trim() || null,
      air_rate_per_kg: Number(airRate) || 0,
      sea_rate_per_kg: Number(seaRate) || 0,
    });

    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setStatusMsg('Store settings saved.');
    }
  }

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);

    const computedSlug =
      catSlug.trim() ||
      catName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: catName.trim(),
        slug: computedSlug,
        wholesale_moq: Math.max(1, Number(wholesaleMoq) || 1),
        allow_mix_and_match: mixAndMatch,
        allow_air_shipping: allowAir,
        allow_sea_shipping: allowSea,
      })
      .select()
      .single();

    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setCatName('');
      setCatSlug('');
      setWholesaleMoq('1');
      if (data?.id) setProdCategoryId(data.id);
      setStatusMsg(`Category "${data.name}" added.`);
      await refreshData();
    }
  }

  async function handleAddProduct(e: FormEvent) {
    e.preventDefault();
    if (!prodName.trim()) return;
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);

    const { error } = await supabase.from('products').insert({
      name: prodName.trim(),
      category_id: prodCategoryId || null,
      description: prodDesc.trim() || null,
      image_url: prodImageUrl.trim() || null,
      retail_price: Number(retailPrice) || 0,
      wholesale_price: Number(wholesalePrice) || 0,
      est_weight_kg: Number(estWeightKg) || 0,
    });

    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setProdName('');
      setProdDesc('');
      setProdImageUrl('');
      setRetailPrice('');
      setWholesalePrice('');
      setEstWeightKg('0.5');
      setStatusMsg('Product added to storefront.');
      await refreshData();
    }
  }

  async function handleDeleteProduct(id: string) {
    setErrorMsg(null);
    setStatusMsg(null);
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setStatusMsg('Product deleted.');
      await refreshData();
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-sm text-stone-600">
        Checking session...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 text-stone-900">
        <div className="w-full max-w-sm space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-xs">
          <div>
            <h1 className="text-lg font-bold">Admin Sign In</h1>
            <p className="mt-1 text-xs text-stone-500">
              Sign in with your Supabase admin account to manage the store.
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-700">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={signingIn}
              className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {signingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="pt-1 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">Store Admin</h1>
            <p className="text-xs text-stone-500">Signed in as {session.user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
            >
              <ArrowLeft className="h-4 w-4" />
              View Storefront
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {statusMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <form
            onSubmit={handleAddProduct}
            className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
          >
            <h2 className="text-base font-semibold">Add Product</h2>

            <div>
              <label className="block text-xs font-medium text-stone-700">Product Name *</label>
              <input
                type="text"
                required
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="e.g., Mini Leather Tote"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700">Category</label>
              <select
                value={prodCategoryId}
                onChange={(e) => setProdCategoryId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-stone-700">Retail Price</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(e.target.value)}
                  placeholder="25000"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700">Wholesale Price</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(e.target.value)}
                  placeholder="18000"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700">Est. Weight (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={estWeightKg}
                  onChange={(e) => setEstWeightKg(e.target.value)}
                  placeholder="0.5"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700">Image URL</label>
              <input
                type="url"
                value={prodImageUrl}
                onChange={(e) => setProdImageUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700">Description</label>
              <textarea
                rows={2}
                value={prodDesc}
                onChange={(e) => setProdDesc(e.target.value)}
                placeholder="Short details about size, material, or colors"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </button>
          </form>

          <div className="space-y-6">
            <form
              onSubmit={handleAddCategory}
              className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
            >
              <h2 className="text-base font-semibold">Add Category</h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-stone-700">Category Name *</label>
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="e.g., Bags"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700">Wholesale MOQ</label>
                  <input
                    type="number"
                    min="1"
                    value={wholesaleMoq}
                    onChange={(e) => setWholesaleMoq(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-stone-700">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={mixAndMatch}
                    onChange={(e) => setMixAndMatch(e.target.checked)}
                  />
                  Mix & match wholesale
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={allowAir}
                    onChange={(e) => setAllowAir(e.target.checked)}
                  />
                  Allow Air shipping
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={allowSea}
                    onChange={(e) => setAllowSea(e.target.checked)}
                  />
                  Allow Sea shipping
                </label>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add Category
              </button>
            </form>

            <form
              onSubmit={handleSaveSettings}
              className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
            >
              <h2 className="text-base font-semibold">WhatsApp & Shipping Rates</h2>

              <div>
                <label className="block text-xs font-medium text-stone-700">
                  WhatsApp Number (with country code, e.g., 2348012345678)
                </label>
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="2348012345678"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-stone-700">
                    Air Rate per kg
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={airRate}
                    onChange={(e) => setAirRate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700">
                    Sea Rate per kg
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={seaRate}
                    onChange={(e) => setSeaRate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save Settings
              </button>
            </form>
          </div>
        </div>

        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
          <h2 className="mb-4 text-base font-semibold">Current Products ({products.length})</h2>
          {products.length === 0 ? (
            <p className="text-sm text-stone-500">No products added yet.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-stone-500">
                      Retail: {Number(p.retail_price).toLocaleString()} • Wholesale:{' '}
                      {Number(p.wholesale_price).toLocaleString()} • {p.est_weight_kg} kg
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(p.id)}
                    className="rounded-lg border border-stone-200 p-2 text-stone-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
