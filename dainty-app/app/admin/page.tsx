'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, LogOut, Plus, Trash2, Upload } from 'lucide-react';

type Category = {
  id: string;
  name: string;
  slug: string;
};

type Product = {
  id: string;
  category_id: string | null;
  name: string;
  size: string | null;
  description: string | null;
  image_url: string | null;
  retail_price: number;
  wholesale_price: number;
  est_shipping_fee: number | null;
};

type DraftPhotoItem = {
  tempId: string;
  name: string;
  size: string;
  retailPrice: string;
  wholesalePrice: string;
  estShippingFee: string;
  imageUrl: string;
  description: string;
};

function cleanFileTitle(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [draftItems, setDraftItems] = useState<DraftPhotoItem[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);

  // "Same specifications, prices and everything" batch mode
  const [sameForAll, setSameForAll] = useState(true);
  const [sharedBaseName, setSharedBaseName] = useState('');
  const [sharedSize, setSharedSize] = useState('');
  const [sharedRetail, setSharedRetail] = useState('');
  const [sharedWholesale, setSharedWholesale] = useState('');
  const [sharedShipping, setSharedShipping] = useState('');
  const [sharedDescription, setSharedDescription] = useState('');

  async function refreshData() {
    setErrorMsg(null);
    const [catsRes, prodsRes] = await Promise.all([
      supabase.from('categories').select('*').order('name', { ascending: true }),
      supabase.from('products').select('*').order('created_at', { ascending: false }),
    ]);

    if (catsRes.error || prodsRes.error) {
      setErrorMsg(
        catsRes.error?.message || prodsRes.error?.message || 'Failed to load store data.'
      );
      return;
    }

    const loadedCats = catsRes.data || [];
    setCategories(loadedCats);
    if (!selectedCategoryId && loadedCats.length > 0) {
      setSelectedCategoryId(loadedCats[0].id);
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

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    setSavingCat(true);
    setErrorMsg(null);
    setStatusMsg(null);

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
      })
      .select()
      .single();

    setSavingCat(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setCatName('');
      setCatSlug('');
      if (data?.id) setSelectedCategoryId(data.id);
      setStatusMsg(`Category "${data.name}" added.`);
      await refreshData();
    }
  }

  function applySharedSpecsToList(items: DraftPhotoItem[]): DraftPhotoItem[] {
    const base = sharedBaseName.trim();
    return items.map((item, idx) => ({
      ...item,
      name: base ? `${base} ${idx + 1}` : item.name,
      size: sharedSize !== '' ? sharedSize : item.size,
      retailPrice: sharedRetail !== '' ? sharedRetail : item.retailPrice,
      wholesalePrice: sharedWholesale !== '' ? sharedWholesale : item.wholesalePrice,
      estShippingFee: sharedShipping !== '' ? sharedShipping : item.estShippingFee,
      description: sharedDescription !== '' ? sharedDescription : item.description,
    }));
  }

  function handleApplySameSpecsNow() {
    setDraftItems((prev) => applySharedSpecsToList(prev));
    setStatusMsg('Applied the same specifications, prices, and details to all items in the queue.');
  }

  async function handleGalleryFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingPhotos(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setUploadProgress(`Uploading 0 of ${files.length}...`);

    const startingCount = draftItems.length;
    const uploadedDrafts: DraftPhotoItem[] = [];
    const failedNames: string[] = [];

    const batchSize = 6;
    let completed = 0;

    for (let i = 0; i < files.length; i += batchSize) {
      const chunk = files.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (file) => {
          const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          const path = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(path, file, { upsert: false });

          completed += 1;
          setUploadProgress(`Uploading ${completed} of ${files.length}...`);

          if (uploadError) {
            failedNames.push(file.name);
            return;
          }

          const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(path);

          const itemIndex = startingCount + uploadedDrafts.length;
          const autoName =
            sameForAll && sharedBaseName.trim()
              ? `${sharedBaseName.trim()} ${itemIndex + 1}`
              : cleanFileTitle(file.name) || `Item ${itemIndex + 1}`;

          uploadedDrafts.push({
            tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: autoName,
            size: sameForAll ? sharedSize : '',
            retailPrice: sameForAll ? sharedRetail : '',
            wholesalePrice: sameForAll ? sharedWholesale : '',
            estShippingFee: sameForAll ? sharedShipping : '',
            imageUrl: urlData.publicUrl,
            description: sameForAll ? sharedDescription : '',
          });
        })
      );
    }

    setDraftItems((prev) => [...prev, ...uploadedDrafts]);
    setUploadingPhotos(false);
    setUploadProgress('');
    e.target.value = '';

    if (uploadedDrafts.length > 0) {
      setStatusMsg(
        sameForAll
          ? `Uploaded ${uploadedDrafts.length} photo(s) with your shared specs and prices applied.`
          : `Uploaded ${uploadedDrafts.length} photo(s). Fill in details for each item below.`
      );
    }
    if (failedNames.length > 0) {
      setErrorMsg(`Could not upload ${failedNames.length} file(s): ${failedNames.join(', ')}`);
    }
  }

  function updateDraftItem(
    tempId: string,
    field: keyof Omit<DraftPhotoItem, 'tempId' | 'imageUrl'>,
    value: string
  ) {
    setDraftItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, [field]: value } : item))
    );
  }

  function removeDraftItem(tempId: string) {
    setDraftItems((prev) => prev.filter((item) => item.tempId !== tempId));
  }

  async function handleSaveAllDraftProducts(e: FormEvent) {
    e.preventDefault();
    if (draftItems.length === 0) return;

    setSavingBatch(true);
    setErrorMsg(null);
    setStatusMsg(null);

    const itemsToPublish = sameForAll ? applySharedSpecsToList(draftItems) : draftItems;

    const payload = itemsToPublish.map((item, idx) => {
      const cleanName = item.name.trim() || `Product ${idx + 1}`;
      const retail = Number(item.retailPrice) || 0;
      const wholesale = Number(item.wholesalePrice) || 0;
      const shipping = Number(item.estShippingFee) || 0;
      const sizeText = item.size.trim() || null;
      const descText =
        item.description.trim() || (sizeText ? `Size: ${sizeText}` : null);

      return {
        name: cleanName,
        category_id: selectedCategoryId || null,
        size: sizeText,
        retail_price: retail,
        wholesale_price: wholesale,
        est_shipping_fee: shipping,
        image_url: item.imageUrl || null,
        description: descText,
      };
    });

    const { error } = await supabase.from('products').insert(payload);

    setSavingBatch(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setDraftItems([]);
      setStatusMsg(`Published ${payload.length} product(s) to your storefront.`);
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
              Sign in with your Supabase admin account to upload photos and manage products.
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
            <h1 className="text-xl font-bold">Store Admin — Gallery & Pricing</h1>
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

        <form
          onSubmit={handleAddCategory}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs"
        >
          <div className="min-w-[180px] flex-1">
            <label className="block text-xs font-medium text-stone-700">New Category Name</label>
            <input
              type="text"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g., Dresses or Bags"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="w-40">
            <label className="block text-xs font-medium text-stone-700">Slug (optional)</label>
            <input
              type="text"
              value={catSlug}
              onChange={(e) => setCatSlug(e.target.value)}
              placeholder="dresses"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={savingCat}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        </form>

        <form
          onSubmit={handleSaveAllDraftProducts}
          className="space-y-5 rounded-xl border border-stone-200 bg-white p-5 shadow-xs"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">
                Bulk Gallery Upload ({draftItems.length} in queue)
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                Select multiple photos from your gallery. Shipping fees are{' '}
                <strong>estimates</strong> and may change when the shipment arrives.
              </p>
            </div>

            <div className="w-full sm:w-56">
              <label className="block text-xs font-medium text-stone-700">Category for Batch</label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
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
          </div>

          {/* Option for all uploaded pictures to have the same specs, prices, and everything */}
          <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-stone-900">
              <input
                type="checkbox"
                checked={sameForAll}
                onChange={(e) => setSameForAll(e.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-stone-900"
              />
              All uploaded pictures have the same specifications, prices, and details
            </label>

            {sameForAll && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600">
                      Base Name (optional)
                    </label>
                    <input
                      type="text"
                      value={sharedBaseName}
                      onChange={(e) => setSharedBaseName(e.target.value)}
                      placeholder="e.g. Satin Set"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600">Size</label>
                    <input
                      type="text"
                      value={sharedSize}
                      onChange={(e) => setSharedSize(e.target.value)}
                      placeholder="e.g. M / Free / 25cm"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600">
                      Retail Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={sharedRetail}
                      onChange={(e) => setSharedRetail(e.target.value)}
                      placeholder="0"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600">
                      Wholesale Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={sharedWholesale}
                      onChange={(e) => setSharedWholesale(e.target.value)}
                      placeholder="0"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600">
                      Est. Shipping (est.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={sharedShipping}
                      onChange={(e) => setSharedShipping(e.target.value)}
                      placeholder="0"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <label className="block text-[11px] font-medium text-stone-600">
                      Specifications / Notes (shared by all)
                    </label>
                    <input
                      type="text"
                      value={sharedDescription}
                      onChange={(e) => setSharedDescription(e.target.value)}
                      placeholder="e.g., Premium cotton, comes with pouch • Est. shipping may change on arrival"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  {draftItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleApplySameSpecsNow}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-100"
                    >
                      Apply to All {draftItems.length} in Queue
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 text-center">
              <Upload className="h-6 w-6 text-stone-600" />
              <span className="text-sm font-medium text-stone-800">
                {uploadingPhotos
                  ? uploadProgress || 'Uploading photos...'
                  : 'Tap or click to choose pictures from your gallery'}
              </span>
              <span className="text-xs text-stone-500">
                Select multiple images at once — JPG, PNG, WEBP
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploadingPhotos || savingBatch}
                onChange={handleGalleryFilesChange}
                className="sr-only"
              />
            </label>
          </div>

          {draftItems.length > 0 && (
            <>
              <div className="space-y-3">
                {draftItems.map((item, idx) => (
                  <div
                    key={item.tempId}
                    className="grid grid-cols-1 items-center gap-3 rounded-xl border border-stone-200 p-3 sm:grid-cols-12"
                  >
                    <div className="flex items-center gap-3 sm:col-span-3">
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-14 w-14 shrink-0 rounded-lg border border-stone-200 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block text-[11px] text-stone-400">#{idx + 1}</span>
                        <input
                          type="text"
                          required
                          value={item.name}
                          onChange={(e) => updateDraftItem(item.tempId, 'name', e.target.value)}
                          placeholder="Item name"
                          className="w-full rounded-md border border-stone-300 px-2 py-1 text-xs font-medium"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-
