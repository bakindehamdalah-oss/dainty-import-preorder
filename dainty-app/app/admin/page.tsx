'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, LogOut, Plus, Trash2, Upload, Images, X, Layers } from 'lucide-react';

type Category = {
  id: string;
  name: string;
  slug: string;
};

type Product = {
  id: string;
  category_id: string | null;
  name?: string | null;
  title?: string | null;
  size: string | null;
  description: string | null;
  image_url: string | null;
  images?: string[] | null;
  colors?: string[] | null;
  color_options?: string | null;
  retail_price: number;
  wholesale_price: number;
  est_shipping_fee: number | null;
  est_shipping_fee_air?: number | null;
  est_shipping_fee_sea?: number | null;
};

type DraftPhotoItem = {
  tempId: string;
  name: string;
  size: string;
  retailPrice: string;
  wholesalePrice: string;
  estAirShipping: string;
  estSeaShipping: string;
  imageUrl: string;
  additionalImages: string[];
  colors: string;
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

  // Upload mode: single product with multiple colors/photos OR separate products
  const [uploadMode, setUploadMode] = useState<'separate' | 'single_product'>('separate');

  // "Same specifications, prices and everything" batch mode
  const [sameForAll, setSameForAll] = useState(true);
  const [sharedBaseName, setSharedBaseName] = useState('');
  const [sharedSize, setSharedSize] = useState('');
  const [sharedColors, setSharedColors] = useState('');
  const [sharedRetail, setSharedRetail] = useState('');
  const [sharedWholesale, setSharedWholesale] = useState('');
  const [sharedAirShipping, setSharedAirShipping] = useState('');
  const [sharedSeaShipping, setSharedSeaShipping] = useState('');
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
      name: base ? (items.length > 1 && uploadMode === 'separate' ? `${base} ${idx + 1}` : base) : item.name,
      size: sharedSize !== '' ? sharedSize : item.size,
      colors: sharedColors !== '' ? sharedColors : item.colors,
      retailPrice: sharedRetail !== '' ? sharedRetail : item.retailPrice,
      wholesalePrice: sharedWholesale !== '' ? sharedWholesale : item.wholesalePrice,
      estAirShipping: sharedAirShipping !== '' ? sharedAirShipping : item.estAirShipping,
      estSeaShipping: sharedSeaShipping !== '' ? sharedSeaShipping : item.estSeaShipping,
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

    const uploadedUrls: string[] = [];

    for (let i = 0; i < files.length; i += batchSize) {
      const chunk = files.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (file) => {
          const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          const path = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

          const candidateBuckets = ['product images', 'productimages', 'product-images'];
          let uploadError: any = null;
          let publicUrl = '';

          for (const bName of candidateBuckets) {
            const { error: err } = await supabase.storage
              .from(bName)
              .upload(path, file, { upsert: false });
            if (!err) {
              const { data: uData } = supabase.storage.from(bName).getPublicUrl(path);
              publicUrl = uData.publicUrl;
              uploadError = null;
              break;
            }
            uploadError = err;
            if (!err.message?.toLowerCase().includes('not found')) {
              break;
            }
          }

          completed += 1;
          setUploadProgress(`Uploading ${completed} of ${files.length}...`);

          if (uploadError || !publicUrl) {
            failedNames.push(`${file.name} (${uploadError?.message || 'Upload failed'})`);
            return;
          }

          uploadedUrls.push(publicUrl);

          if (uploadMode === 'separate') {
            const itemIndex = startingCount + uploadedDrafts.length;
            const autoName =
              sameForAll && sharedBaseName.trim()
                ? `${sharedBaseName.trim()} ${itemIndex + 1}`
                : cleanFileTitle(file.name) || `Item ${itemIndex + 1}`;

            uploadedDrafts.push({
              tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              name: autoName,
              size: sameForAll ? sharedSize : '',
              colors: sameForAll ? sharedColors : '',
              retailPrice: sameForAll ? sharedRetail : '',
              wholesalePrice: sameForAll ? sharedWholesale : '',
              estAirShipping: sameForAll ? sharedAirShipping : '',
              estSeaShipping: sameForAll ? sharedSeaShipping : '',
              imageUrl: publicUrl,
              additionalImages: [],
              description: sameForAll ? sharedDescription : '',
            });
          }
        })
      );
    }

    if (uploadMode === 'single_product' && uploadedUrls.length > 0) {
      const autoName =
        sharedBaseName.trim() ||
        (files[0] ? cleanFileTitle(files[0].name) : 'Product');

      uploadedDrafts.push({
        tempId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: autoName,
        size: sharedSize || '',
        colors: sharedColors || '',
        retailPrice: sharedRetail || '',
        wholesalePrice: sharedWholesale || '',
        estAirShipping: sharedAirShipping || '',
        estSeaShipping: sharedSeaShipping || '',
        imageUrl: uploadedUrls[0],
        additionalImages: uploadedUrls.slice(1),
        description: sharedDescription || '',
      });
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
    field: keyof Omit<DraftPhotoItem, 'tempId' | 'imageUrl' | 'additionalImages'>,
    value: string
  ) {
    setDraftItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, [field]: value } : item))
    );
  }

  async function handleAddPhotoToDraftItem(tempId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    setUploadingPhotos(true);
    setUploadProgress(`Uploading ${fileList.length} extra photo(s)...`);

    for (const file of fileList) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
      const candidateBuckets = ['product images', 'productimages', 'product-images'];
      for (const bName of candidateBuckets) {
        const { error: err } = await supabase.storage.from(bName).upload(path, file, { upsert: false });
        if (!err) {
          const { data: uData } = supabase.storage.from(bName).getPublicUrl(path);
          if (uData.publicUrl) {
            setDraftItems((prev) =>
              prev.map((item) =>
                item.tempId === tempId
                  ? { ...item, additionalImages: [...(item.additionalImages || []), uData.publicUrl] }
                  : item
              )
            );
          }
          break;
        }
      }
    }
    setUploadingPhotos(false);
    setUploadProgress('');
  }

  function handleRemoveSubPhoto(tempId: string, imgUrl: string) {
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        if (item.imageUrl === imgUrl) {
          const nextMain = item.additionalImages[0] || '';
          return {
            ...item,
            imageUrl: nextMain,
            additionalImages: item.additionalImages.slice(1),
          };
        }
        return {
          ...item,
          additionalImages: (item.additionalImages || []).filter((u) => u !== imgUrl),
        };
      })
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
      const airFee = Number(item.estAirShipping) || 0;
      const seaFee = Number(item.estSeaShipping) || 0;
      const sizeText = item.size.trim() || null;

      const colorsList = item.colors
        ? item.colors.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
      const allImages = [item.imageUrl, ...(item.additionalImages || [])].filter(Boolean);

      let descText = item.description.trim();
      if (sizeText) descText = descText ? `${descText} • Size: ${sizeText}` : `Size: ${sizeText}`;
      if (colorsList.length > 0) {
        descText = descText ? `${descText} • Colors: ${colorsList.join(', ')}` : `Colors: ${colorsList.join(', ')}`;
      }

      return {
        name: cleanName,
        title: cleanName,
        category_id: selectedCategoryId || null,
        size: sizeText,
        retail_price: retail,
        wholesale_price: wholesale,
        est_shipping_fee: airFee || seaFee || 0,
        est_shipping_fee_air: airFee,
        est_shipping_fee_sea: seaFee,
        image_url: item.imageUrl || null,
        images: allImages.length > 0 ? allImages : (item.imageUrl ? [item.imageUrl] : []),
        colors: colorsList,
        color_options: colorsList.join(', '),
        description: descText || null,
      };
    });

    let { error } = await supabase.from('products').insert(payload);
    if (error && error.message?.toLowerCase().includes('schema cache')) {
      // Graceful fallback if images/colors columns haven't been added to Supabase yet
      const fallbackPayload = payload.map(({ images, colors, color_options, ...rest }) => rest);
      const fallbackRes = await supabase.from('products').insert(fallbackPayload);
      error = fallbackRes.error;
    }

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
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Dainty Import"
              className="h-10 w-auto rounded-lg object-contain shadow-xs border border-[#fa9d26]/30"
            />
            <div>
              <h1 className="text-xl font-bold">Dainty Import Admin</h1>
              <p className="text-xs text-stone-500">Signed in as {session.user.email}</p>
            </div>
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

          {/* Upload Mode Selector: Single Product vs Separate Products */}
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs">
            <label className="block text-xs font-semibold text-stone-900 mb-2">Upload Mode</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  uploadMode === 'separate'
                    ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900'
                    : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
              >
                <input
                  type="radio"
                  name="uploadMode"
                  value="separate"
                  checked={uploadMode === 'separate'}
                  onChange={() => setUploadMode('separate')}
                  className="mt-0.5 text-stone-900"
                />
                <div>
                  <span className="block text-xs font-semibold text-stone-900">Separate Products</span>
                  <span className="block text-[11px] text-stone-500">Each uploaded photo creates its own product in your store.</span>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  uploadMode === 'single_product'
                    ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900'
                    : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
              >
                <input
                  type="radio"
                  name="uploadMode"
                  value="single_product"
                  checked={uploadMode === 'single_product'}
                  onChange={() => setUploadMode('single_product')}
                  className="mt-0.5 text-stone-900"
                />
                <div>
                  <span className="block text-xs font-semibold text-stone-900">Single Product (Multiple Colors / Angles)</span>
                  <span className="block text-[11px] text-stone-500">All photos you choose attach to 1 product with color variants.</span>
                </div>
              </label>
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
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
                    <label className="block text-[11px] font-medium text-stone-600">Colors (comma-separated)</label>
                    <input
                      type="text"
                      value={sharedColors}
                      onChange={(e) => setSharedColors(e.target.value)}
                      placeholder="e.g. Black, White, Beige, Red"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600">
                      Retail Price (₦)
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
                      Wholesale Price (₦)
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
                    <label className="block text-[11px] font-medium text-emerald-700">
                      Est. Air Cargo (₦)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={sharedAirShipping}
                      onChange={(e) => setSharedAirShipping(e.target.value)}
                      placeholder="e.g. 5000"
                      className="mt-1 w-full rounded-lg border border-emerald-300 bg-emerald-50/40 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-blue-700">
                      Est. Sea Cargo (₦)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={sharedSeaShipping}
                      onChange={(e) => setSharedSeaShipping(e.target.value)}
                      placeholder="e.g. 1500"
                      className="mt-1 w-full rounded-lg border border-blue-300 bg-blue-50/40 px-2.5 py-1.5 text-xs"
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
                    className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs space-y-3"
                  >
                    {/* Top Row: Images & Main Info */}
                    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-12">
                      <div className="flex items-center gap-3 sm:col-span-4">
                        <div className="relative group shrink-0">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-16 w-16 rounded-lg border border-stone-200 object-contain bg-stone-50 p-1"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block text-[11px] font-semibold text-stone-400">#{idx + 1}</span>
                          <input
                            type="text"
                            required
                            value={item.name}
                            onChange={(e) => updateDraftItem(item.tempId, 'name', e.target.value)}
                            placeholder="Item name"
                            className="w-full rounded-md border border-stone-300 px-2.5 py-1 text-xs font-semibold"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-stone-500">Size</label>
                        <input
                          type="text"
                          value={item.size}
                          onChange={(e) => updateDraftItem(item.tempId, 'size', e.target.value)}
                          placeholder="e.g. S/M/L"
                          className="mt-0.5 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-medium text-stone-700">Colors (comma-separated)</label>
                        <input
                          type="text"
                          value={item.colors}
                          onChange={(e) => updateDraftItem(item.tempId, 'colors', e.target.value)}
                          placeholder="e.g. Black, White, Beige, Blue"
                          className="mt-0.5 w-full rounded-md border border-stone-300 bg-stone-50/50 px-2 py-1 text-xs font-medium text-stone-900"
                        />
                      </div>

                      <div className="flex items-center justify-end sm:col-span-3">
                        <button
                          type="button"
                          onClick={() => removeDraftItem(item.tempId)}
                          className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove Item
                        </button>
                      </div>
                    </div>

                    {/* Photo Gallery for this single product */}
                    <div className="rounded-lg border border-stone-100 bg-stone-50/60 p-2.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-medium text-stone-600">
                          Photos for this product ({(item.additionalImages?.length || 0) + (item.imageUrl ? 1 : 0)} attached):
                        </span>
                        <label className="cursor-pointer inline-flex items-center gap-1 text-[11px] font-medium text-stone-700 hover:text-stone-900">
                          <Plus className="h-3 w-3" />
                          Add photo / color
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => handleAddPhotoToDraftItem(item.tempId, e.target.files)}
                            className="sr-only"
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {item.imageUrl && (
                          <div className="relative group rounded-md border border-stone-300 bg-white p-1">
                            <img src={item.imageUrl} alt="Main photo" className="h-12 w-12 object-contain rounded" />
                            <span className="absolute bottom-1 left-1 bg-stone-900/80 text-[9px] text-white px-1 rounded">Main</span>
                          </div>
                        )}
                        {(item.additionalImages || []).map((imgUrl, subIdx) => (
                          <div key={subIdx} className="relative group rounded-md border border-stone-200 bg-white p-1">
                            <img src={imgUrl} alt={`Photo ${subIdx + 2}`} className="h-12 w-12 object-contain rounded" />
                            <button
                              type="button"
                              onClick={() => handleRemoveSubPhoto(item.tempId, imgUrl)}
                              className="absolute -top-1 -right-1 rounded-full bg-red-600 p-0.5 text-white opacity-0 group-hover:opacity-100 transition"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-stone-500">Retail Price</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={item.retailPrice}
                        onChange={(e) =>
                          updateDraftItem(item.tempId, 'retailPrice', e.target.value)
                        }
                        placeholder="0"
                        className="mt-0.5 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-stone-500">Wholesale Price</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={item.wholesalePrice}
                        onChange={(e) =>
                          updateDraftItem(item.tempId, 'wholesalePrice', e.target.value)
                        }
                        placeholder="0"
                        className="mt-0.5 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-emerald-700">
                        Est. Air (₦)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.estAirShipping}
                        onChange={(e) =>
                          updateDraftItem(item.tempId, 'estAirShipping', e.target.value)
                        }
                        placeholder="0"
                        className="mt-0.5 w-full rounded-md border border-emerald-300 bg-emerald-50/30 px-2 py-1 text-xs"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-blue-700">
                        Est. Sea (₦)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.estSeaShipping}
                        onChange={(e) =>
                          updateDraftItem(item.tempId, 'estSeaShipping', e.target.value)
                        }
                        placeholder="0"
                        className="mt-0.5 w-full rounded-md border border-blue-300 bg-blue-50/30 px-2 py-1 text-xs"
                      />
                    </div>

                    <div className="flex justify-end sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => removeDraftItem(item.tempId)}
                        aria-label={`Remove ${item.name}`}
                        className="rounded-lg border border-stone-200 p-2 text-stone-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-4 pt-2">
                <p className="text-xs text-stone-500">
                  Shipping fees are saved as estimates and may change on arrival.
                </p>
                <button
                  type="submit"
                  disabled={savingBatch || uploadingPhotos}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {savingBatch
                    ? `Saving ${draftItems.length} items...`
                    : `Publish ${draftItems.length} Product(s)`}
                </button>
              </div>
            </>
          )}
        </form>

        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
          <h2 className="mb-4 text-base font-semibold">Published Products ({products.length})</h2>
          {products.length === 0 ? (
            <p className="text-sm text-stone-500">No published products yet.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="h-12 w-12 rounded-lg border border-stone-200 object-cover"
                      />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {p.name}{' '}
                        {p.size ? (
                          <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-normal text-stone-700">
                            Size: {p.size}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-stone-500">
                        Retail: ₦{Number(p.retail_price).toLocaleString()} • Wholesale: ₦
                        {Number(p.wholesale_price).toLocaleString()} • Air Est: ₦
                        {Number(p.est_shipping_fee_air ?? p.est_shipping_fee ?? 0).toLocaleString()} • Sea Est: ₦
                        {Number(p.est_shipping_fee_sea ?? p.est_shipping_fee ?? 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(p.id)}
                    aria-label={`Delete ${p.name}`}
                    className="rounded-lg border border-stone-200 p-2 text-stone-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
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