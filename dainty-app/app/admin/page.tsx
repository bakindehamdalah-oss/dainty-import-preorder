'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Upload, Trash2, Plus, LogOut, Check, FolderPlus, RefreshCw, X, ShieldAlert, Sparkles, Layers, Image as ImageIcon, Ship, Plane } from 'lucide-react';

type Category = {
  id: string;
  name: string;
  slug: string;
  wholesale_moq?: number;
};

type Product = {
  id: string;
  category_id: string | null;
  name?: string | null;
  title?: string | null;
  size: string | null;
  sizes?: string[] | null;
  size_options?: string | null;
  wholesale_moq?: number | null;
  min_order_qty?: number | null;
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
  moq: string;
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
  const [sharedMoq, setSharedMoq] = useState('');
  const [sharedAirShipping, setSharedAirShipping] = useState('');
  const [sharedSeaShipping, setSharedSeaShipping] = useState('');
  const [sharedDescription, setSharedDescription] = useState('');

  // Auto-detect iPhone Case category to default MOQ to 50
  useEffect(() => {
    const selCat = categories.find((c) => c.id === selectedCategoryId);
    const catNameLower = (selCat?.name || '').toLowerCase();
    if (catNameLower.includes('case') || catNameLower.includes('iphone')) {
      if (!sharedMoq || sharedMoq === '5') {
        setSharedMoq('50');
      }
    } else if (!sharedMoq) {
      setSharedMoq('5');
    }
  }, [selectedCategoryId, categories]);

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

    const isCase = computedSlug.includes('case') || computedSlug.includes('iphone');

    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: catName.trim(),
        slug: computedSlug,
        wholesale_moq: isCase ? 50 : 5,
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
      moq: sharedMoq !== '' ? sharedMoq : item.moq,
      estAirShipping: sharedAirShipping !== '' ? sharedAirShipping : item.estAirShipping,
      estSeaShipping: sharedSeaShipping !== '' ? sharedSeaShipping : item.estSeaShipping,
      description: sharedDescription !== '' ? sharedDescription : item.description,
    }));
  }

  function handleApplySameSpecsNow() {
    setDraftItems((prev) => applySharedSpecsToList(prev));
    setStatusMsg('Applied the same specifications, prices, MOQ, and details to all items in queue.');
  }

  async function handleGalleryFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingPhotos(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setUploadProgress(`Uploading 0 of ${files.length}...`);

    const newUploadedUrls: { url: string; originalName: string }[] = [];
    const bucketCandidates = ['product images', 'productimages', 'product-images'];

    const batchSize = 6;
    for (let i = 0; i < files.length; i += batchSize) {
      const chunk = files.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (file) => {
          const ext = file.name.split('.').pop() || 'jpg';
          const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const filePath = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${cleanName}`;

          let uploadSuccess = false;
          let publicUrl = '';
          let lastErrText = '';

          for (const bName of bucketCandidates) {
            try {
              const { error: upErr } = await supabase.storage.from(bName).upload(filePath, file, {
                cacheControl: '3600',
                upsert: true,
              });

              if (!upErr) {
                const { data } = supabase.storage.from(bName).getPublicUrl(filePath);
                if (data?.publicUrl) {
                  publicUrl = data.publicUrl;
                  uploadSuccess = true;
                  break;
                }
              } else {
                lastErrText = upErr.message || JSON.stringify(upErr);
              }
            } catch (err: any) {
              lastErrText = err?.message || String(err);
            }
          }

          if (uploadSuccess && publicUrl) {
            newUploadedUrls.push({ url: publicUrl, originalName: file.name });
          } else {
            console.error(`Failed to upload ${file.name}:`, lastErrText);
          }
        })
      );
      setUploadProgress(`Uploaded ${Math.min(i + batchSize, files.length)} of ${files.length}...`);
    }

    setUploadingPhotos(false);
    setUploadProgress('');

    if (newUploadedUrls.length === 0) {
      setErrorMsg('Failed to upload images. Please make sure the public bucket exists in Supabase Storage.');
      return;
    }

    const selCat = categories.find((c) => c.id === selectedCategoryId);
    const catNameLower = (selCat?.name || '').toLowerCase();
    const defaultMoq = (catNameLower.includes('case') || catNameLower.includes('iphone')) ? '50' : (sharedMoq || '5');

    if (uploadMode === 'single_product') {
      const mainPhoto = newUploadedUrls[0];
      const extraPhotos = newUploadedUrls.slice(1).map((u) => u.url);

      const newItem: DraftPhotoItem = {
        tempId: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: sharedBaseName.trim() || cleanFileTitle(mainPhoto.originalName),
        size: sameForAll ? sharedSize : '',
        colors: sameForAll ? sharedColors : '',
        retailPrice: sameForAll ? sharedRetail : '',
        wholesalePrice: sameForAll ? sharedWholesale : '',
        moq: sameForAll ? (sharedMoq || defaultMoq) : defaultMoq,
        estAirShipping: sameForAll ? sharedAirShipping : '',
        estSeaShipping: sameForAll ? sharedSeaShipping : '',
        imageUrl: mainPhoto.url,
        additionalImages: extraPhotos,
        description: sameForAll ? sharedDescription : '',
      };

      setDraftItems((prev) => [...prev, newItem]);
      setStatusMsg(`Created 1 multi-photo product with ${newUploadedUrls.length} angle(s)/color(s).`);
    } else {
      const createdDrafts: DraftPhotoItem[] = newUploadedUrls.map((item, idx) => {
        const base = sharedBaseName.trim();
        const generatedName = base
          ? (newUploadedUrls.length > 1 ? `${base} ${idx + 1}` : base)
          : cleanFileTitle(item.originalName);

        return {
          tempId: `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
          name: generatedName,
          size: sharedSize || '',
          colors: sharedColors || '',
          retailPrice: sharedRetail || '',
          wholesalePrice: sharedWholesale || '',
          moq: sharedMoq || defaultMoq,
          estAirShipping: sharedAirShipping || '',
          estSeaShipping: sharedSeaShipping || '',
          imageUrl: item.url,
          additionalImages: [],
          description: sharedDescription || '',
        };
      });

      setDraftItems((prev) => [...prev, ...createdDrafts]);
      setStatusMsg(`Uploaded ${newUploadedUrls.length} image(s). Ready for review.`);
    }

    e.target.value = '';
  }

  function updateDraftItem(tempId: string, field: keyof DraftPhotoItem, val: any) {
    setDraftItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, [field]: val } : item))
    );
  }

  function handleAddPhotoToDraft(tempId: string, file: File) {
    setUploadingPhotos(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const bucketCandidates = ['product images', 'productimages', 'product-images'];

    (async () => {
      let publicUrl = '';
      for (const bName of bucketCandidates) {
        try {
          const { error: upErr } = await supabase.storage.from(bName).upload(filePath, file, { upsert: true });
          if (!upErr) {
            const { data } = supabase.storage.from(bName).getPublicUrl(filePath);
            if (data?.publicUrl) {
              publicUrl = data.publicUrl;
              break;
            }
          }
        } catch (e) {}
      }

      setUploadingPhotos(false);
      if (publicUrl) {
        setDraftItems((prev) =>
          prev.map((item) =>
            item.tempId === tempId
              ? { ...item, additionalImages: [...(item.additionalImages || []), publicUrl] }
              : item
          )
        );
        setStatusMsg('Angle photo attached.');
      } else {
        setErrorMsg('Failed to upload additional angle.');
      }
    })();
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

    const selCat = categories.find((c) => c.id === selectedCategoryId);
    const catNameLower = (selCat?.name || '').toLowerCase();
    const isIphoneCaseCat = catNameLower.includes('case') || catNameLower.includes('iphone');

    const payload = itemsToPublish.map((item, idx) => {
      const cleanName = item.name.trim() || `Product ${idx + 1}`;
      const retail = Number(item.retailPrice) || 0;
      const wholesale = Number(item.wholesalePrice) || 0;
      const airFee = item.estAirShipping.trim() !== '' ? Number(item.estAirShipping) : 0;
      const seaFee = item.estSeaShipping.trim() !== '' ? Number(item.estSeaShipping) : 0;
      const sizeText = item.size.trim() || null;
      const moqVal = Number(item.moq) || (isIphoneCaseCat ? 50 : 5);

      const colorsList = item.colors
        ? item.colors.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
      const sizesList = sizeText
        ? sizeText.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const allImages = [item.imageUrl, ...(item.additionalImages || [])].filter(Boolean);

      let descText = item.description.trim();
      if (sizeText) descText = descText ? `${descText} • Sizes: ${sizeText}` : `Sizes: ${sizeText}`;
      if (colorsList.length > 0) {
        descText = descText ? `${descText} • Colors: ${colorsList.join(', ')}` : `Colors: ${colorsList.join(', ')}`;
      }
      if (moqVal > 0) {
        descText = descText ? `${descText} • Wholesale MOQ: ${moqVal} pcs` : `Wholesale MOQ: ${moqVal} pcs`;
      }
      if (airFee <= 0 && seaFee > 0) {
        descText = descText ? `${descText} • Shipping: Sea Cargo Only` : `Shipping: Sea Cargo Only`;
      }

      return {
        name: cleanName,
        title: cleanName,
        category_id: selectedCategoryId || null,
        size: sizeText,
        sizes: sizesList,
        size_options: sizeText,
        wholesale_moq: moqVal,
        min_order_qty: moqVal,
        retail_price: retail,
        wholesale_price: wholesale,
        est_shipping_fee: airFee || seaFee || 0,
        est_shipping_fee_air: airFee > 0 ? airFee : null,
        est_shipping_fee_sea: seaFee > 0 ? seaFee : null,
        image_url: item.imageUrl || null,
        images: allImages.length > 0 ? allImages : (item.imageUrl ? [item.imageUrl] : []),
        colors: colorsList,
        color_options: colorsList.join(', '),
        description: descText || null,
      };
    });

    let { error } = await supabase.from('products').insert(payload);
    if (error && error.message?.toLowerCase().includes('schema cache')) {
      // Gracefully omit fields if Supabase columns do not exist yet
      const fallbackPayload = payload.map(({ sizes, size_options, wholesale_moq, min_order_qty, ...rest }) => rest);
      let fallbackRes = await supabase.from('products').insert(fallbackPayload);
      error = fallbackRes.error;

      if (error && error.message?.toLowerCase().includes('schema cache')) {
        const minimalPayload = payload.map(({ images, colors, color_options, sizes, size_options, wholesale_moq, min_order_qty, ...rest }) => rest);
        const minRes = await supabase.from('products').insert(minimalPayload);
        error = minRes.error;
      }
    }

    setSavingBatch(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setDraftItems([]);
      setStatusMsg(`Published ${payload.length} China product(s) to your storefront.`);
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
              Sign in with your Supabase admin account to upload photos and manage China sourcing products.
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
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-xs focus:border-stone-900 focus:outline-hidden"
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
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-xs focus:border-stone-900 focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={signingIn}
              className="w-full rounded-lg bg-stone-900 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              {signingIn ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-20">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Dainty Import"
              className="h-9 w-auto rounded-md object-contain border border-[#fa9d26]/20"
            />
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-tight">Dainty Import Admin</h1>
              <p className="text-[11px] font-semibold text-[#fa9d26] uppercase tracking-wider">
                China Sourcing Catalog Manager
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/"
              target="_blank"
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
            >
              View Storefront
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8 sm:px-6 space-y-6">
        {statusMsg && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-800">
            <span>{statusMsg}</span>
            <button type="button" onClick={() => setStatusMsg(null)} className="text-emerald-600 hover:text-emerald-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} className="text-red-600 hover:text-red-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Categories Bar & Quick Add */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-stone-900">1. Select or Create Category</h2>
              <p className="text-xs text-stone-500">
                iPhone cases automatically default to a wholesale MOQ of 50 pieces.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshData}
              className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 self-start sm:self-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Data
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategoryId(c.id)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  selectedCategoryId === c.id
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleAddCategory} className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100">
            <input
              type="text"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="New category name (e.g. iPhone Cases)"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs focus:border-stone-900 focus:outline-hidden"
            />
            <button
              type="submit"
              disabled={savingCat}
              className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-200 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {savingCat ? 'Adding...' : 'Add Category'}
            </button>
          </form>
        </section>

        {/* Gallery Upload & Batch Specifications */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-stone-900">2. Upload Product Photos & Details</h2>
            <p className="text-xs text-stone-500">
              Easily configure sizes, colors, wholesale MOQs, and optional Air/Sea shipping fees.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex flex-wrap gap-2 text-xs border-b border-stone-100 pb-3">
            <button
              type="button"
              onClick={() => setUploadMode('separate')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition ${
                uploadMode === 'separate'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              <Layers className="h-4 w-4" />
              Separate Products (1 item per photo)
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('single_product')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition ${
                uploadMode === 'single_product'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              <ImageIcon className="h-4 w-4" />
              Single Product with Multiple Angles / Colors
            </button>
          </div>

          {/* Shared Specifications Box */}
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-stone-900 cursor-pointer">
              <input
                type="checkbox"
                checked={sameForAll}
                onChange={(e) => setSameForAll(e.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-stone-900"
              />
              All uploaded items share the same specifications, prices, and shipping details
            </label>

            {sameForAll && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600">
                      Base Name
                    </label>
                    <input
                      type="text"
                      value={sharedBaseName}
                      onChange={(e) => setSharedBaseName(e.target.value)}
                      placeholder="e.g. Luxury Magnetic Case"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600">
                      Sizes / Models (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={sharedSize}
                      onChange={(e) => setSharedSize(e.target.value)}
                      placeholder="e.g. iPhone 11, 12, 13, 14, 15 Pro Max"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600">
                      Colors (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={sharedColors}
                      onChange={(e) => setSharedColors(e.target.value)}
                      placeholder="e.g. Black, White, Titanium, Pink"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-amber-800">
                      Wholesale MOQ (pcs)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={sharedMoq}
                      onChange={(e) => setSharedMoq(e.target.value)}
                      placeholder="50 for iPhone cases"
                      className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50/50 px-2.5 py-1.5 text-xs font-semibold"
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
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-emerald-700">
                        Est. Air Cargo (₦)
                      </label>
                      <button
                        type="button"
                        onClick={() => setSharedAirShipping('')}
                        title="Clear if item cannot ship by air"
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        Sea Only
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={sharedAirShipping}
                      onChange={(e) => setSharedAirShipping(e.target.value)}
                      placeholder="Leave blank if Sea only"
                      className="mt-1 w-full rounded-lg border border-emerald-300 bg-emerald-50/40 px-2.5 py-1.5 text-xs"
                    />
                    <span className="text-[10px] text-stone-400">Delivery within 3 weeks (optional)</span>
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
                      placeholder="e.g. 1500 (optional)"
                      className="mt-1 w-full rounded-lg border border-blue-300 bg-blue-50/40 px-2.5 py-1.5 text-xs"
                    />
                    <span className="text-[10px] text-stone-400">Delivery within 3 months (optional)</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3 pt-1">
                  <div className="min-w-[220px] flex-1">
                    <label className="block text-[11px] font-medium text-stone-600">
                      Notes / Specifications (shared by all)
                    </label>
                    <input
                      type="text"
                      value={sharedDescription}
                      onChange={(e) => setSharedDescription(e.target.value)}
                      placeholder="e.g. Shockproof, raised camera protection • Est. shipping billed upon arrival"
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

          {/* Photo Dropzone */}
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 text-center">
              <Upload className="h-7 w-7 text-stone-600" />
              <span className="text-sm font-semibold text-stone-800">
                {uploadingPhotos
                  ? uploadProgress || 'Uploading photos...'
                  : 'Tap or click to select China product photos from gallery'}
              </span>
              <span className="text-xs text-stone-500">
                Select multiple pictures at once — JPG, PNG, WEBP
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

          {/* Review Queue */}
          {draftItems.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                <div className="text-sm font-bold text-stone-900">
                  Review Draft Products ({draftItems.length})
                </div>
                <button
                  type="button"
                  onClick={() => setDraftItems([])}
                  className="text-xs text-stone-400 hover:text-stone-600"
                >
                  Clear Queue
                </button>
              </div>

              <div className="space-y-3">
                {draftItems.map((item, idx) => (
                  <div
                    key={item.tempId}
                    className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs space-y-3"
                  >
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

                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-medium text-stone-500">Sizes / Models</label>
                        <input
                          type="text"
                          value={item.size}
                          onChange={(e) => updateDraftItem(item.tempId, 'size', e.target.value)}
                          placeholder="e.g. iPhone 11, 12, 13, 14, 15"
                          className="mt-0.5 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-medium text-stone-700">Colors</label>
                        <input
                          type="text"
                          value={item.colors}
                          onChange={(e) => updateDraftItem(item.tempId, 'colors', e.target.value)}
                          placeholder="e.g. Black, White, Clear"
                          className="mt-0.5 w-full rounded-md border border-stone-300 bg-stone-50/50 px-2 py-1 text-xs font-medium text-stone-900"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-amber-800">MOQ (pcs)</label>
                        <input
                          type="number"
                          min="1"
                          value={item.moq}
                          onChange={(e) => updateDraftItem(item.tempId, 'moq', e.target.value)}
                          placeholder="50"
                          className="mt-0.5 w-full rounded-md border border-amber-300 bg-amber-50/50 px-2 py-1 text-xs font-semibold"
                        />
                      </div>
                    </div>

                    {/* Second Row: Prices, Shipping, Delete */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 items-end border-t border-stone-100 pt-2">
                      <div>
                        <label className="block text-[11px] font-medium text-stone-500">Retail (₦)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.retailPrice}
                          onChange={(e) => updateDraftItem(item.tempId, 'retailPrice', e.target.value)}
                          placeholder="0"
                          className="mt-0.5 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-500">Wholesale (₦)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.wholesalePrice}
                          onChange={(e) => updateDraftItem(item.tempId, 'wholesalePrice', e.target.value)}
                          placeholder="0"
                          className="mt-0.5 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-emerald-700">
                          Air Ship (₦) <span className="text-[10px] text-stone-400 font-normal">(3 wks)</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.estAirShipping}
                          onChange={(e) => updateDraftItem(item.tempId, 'estAirShipping', e.target.value)}
                          placeholder="Blank = Sea only"
                          className="mt-0.5 w-full rounded-md border border-emerald-300 bg-emerald-50/30 px-2 py-1 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-blue-700">
                          Sea Ship (₦) <span className="text-[10px] text-stone-400 font-normal">(3 mos)</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.estSeaShipping}
                          onChange={(e) => updateDraftItem(item.tempId, 'estSeaShipping', e.target.value)}
                          placeholder="0"
                          className="mt-0.5 w-full rounded-md border border-blue-300 bg-blue-50/30 px-2 py-1 text-xs"
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeDraftItem(item.tempId)}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={savingBatch}
                onClick={handleSaveAllDraftProducts}
                className="w-full rounded-xl bg-stone-900 py-3 text-sm font-bold text-white shadow-xs hover:bg-[#fa9d26] transition disabled:opacity-50"
              >
                {savingBatch ? 'Publishing Products to Storefront...' : `Publish All ${draftItems.length} Products to Storefront`}
              </button>
            </div>
          )}
        </section>

        {/* Existing Products List */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-stone-900">Published Products ({products.length})</h2>
              <p className="text-xs text-stone-500">Catalog items currently live on your storefront.</p>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="py-10 text-center text-xs text-stone-400">No products uploaded yet.</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {products.map((p) => {
                const cat = categories.find((c) => c.id === p.category_id);
                const air = p.est_shipping_fee_air ?? p.est_shipping_fee ?? 0;
                const sea = p.est_shipping_fee_sea ?? p.est_shipping_fee ?? 0;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name || 'Product'}
                          className="h-12 w-12 rounded-lg border border-stone-200 object-contain bg-stone-50 p-0.5"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-stone-100 flex items-center justify-center text-[10px] text-stone-400">
                          No img
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-stone-900 truncate">
                          {p.name || p.title}
                        </div>
                        <div className="text-[11px] text-stone-500 flex flex-wrap gap-x-2">
                          <span>{cat?.name || 'Uncategorized'}</span>
                          {p.size && <span>• Size: {p.size}</span>}
                          <span>• Retail: ₦{Number(p.retail_price).toLocaleString()}</span>
                          <span>• Wholesale: ₦{Number(p.wholesale_price).toLocaleString()}</span>
                          {air > 0 && <span className="text-emerald-700">• Air: ₦{Number(air).toLocaleString()}</span>}
                          {sea > 0 && <span className="text-blue-700">• Sea: ₦{Number(sea).toLocaleString()}</span>}
                          {air <= 0 && sea > 0 && <span className="text-blue-700 font-semibold">• Sea Only</span>}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(p.id)}
                      className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 transition shrink-0"
                      title="Delete product"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
