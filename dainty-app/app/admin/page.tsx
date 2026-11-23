'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Upload, Trash2, Plus, LogOut, Check, FolderPlus, RefreshCw, X, ShieldAlert, Sparkles, Layers, Image as ImageIcon, Ship, Plane, Tag, Box, Info } from 'lucide-react';

type Category = {
  id: string;
  name: string;
  slug: string;
  wholesale_moq?: number;
  moq_scope?: 'item' | 'category';
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
  moq_scope?: 'item' | 'category' | null;
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
  moqScope: 'item' | 'category';
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
  const [catMoq, setCatMoq] = useState('50');
  const [catMoqScope, setCatMoqScope] = useState<'item' | 'category'>('category');
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
  const [sharedMoq, setSharedMoq] = useState('50');
  const [sharedMoqScope, setSharedMoqScope] = useState<'item' | 'category'>('category');
  const [sharedAirShipping, setSharedAirShipping] = useState('');
  const [sharedSeaShipping, setSharedSeaShipping] = useState('');
  const [sharedDescription, setSharedDescription] = useState('');

  // Auto-sync MOQ and scope from selected category
  useEffect(() => {
    const selCat = categories.find((c) => c.id === selectedCategoryId);
    if (selCat) {
      if (selCat.wholesale_moq) setSharedMoq(String(selCat.wholesale_moq));
      if (selCat.moq_scope) setSharedMoqScope(selCat.moq_scope);
      else setSharedMoqScope('category');
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
    } else {
      setCategories(catsRes.data || []);
      setProducts(prodsRes.data || []);
      if (!selectedCategoryId && catsRes.data && catsRes.data.length > 0) {
        setSelectedCategoryId(catsRes.data[0].id);
      }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
      if (session) refreshData();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) refreshData();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setSigningIn(true);
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSigningIn(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setEmail('');
      setPassword('');
    }
  }

  async function handleSignOut() {
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

    const targetMoq = Number(catMoq) || 50;
    const targetScope = catMoqScope || 'category';

    // Try inserting with wholesale_moq & moq_scope, fallback if columns not yet present
    let { data, error } = await supabase
      .from('categories')
      .insert({
        name: catName.trim(),
        slug: computedSlug,
        wholesale_moq: targetMoq,
        moq_scope: targetScope,
      })
      .select()
      .maybeSingle();

    if (error && error.message?.toLowerCase().includes('schema cache')) {
      const fallback = await supabase
        .from('categories')
        .insert({
          name: catName.trim(),
          slug: computedSlug,
          wholesale_moq: targetMoq,
        })
        .select()
        .maybeSingle();

      if (fallback.error && fallback.error.message?.toLowerCase().includes('schema cache')) {
        const minimal = await supabase
          .from('categories')
          .insert({
            name: catName.trim(),
            slug: computedSlug,
          })
          .select()
          .maybeSingle();
        data = minimal.data;
        error = minimal.error;
      } else {
        data = fallback.data;
        error = fallback.error;
      }
    }

    setSavingCat(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setCatName('');
      setCatSlug('');
      if (data?.id) setSelectedCategoryId(data.id);
      setStatusMsg(`Category "${data?.name || catName}" added with MOQ ${targetMoq} (${targetScope === 'item' ? 'Per Item' : 'Whole Category'}).`);
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
      moqScope: sharedMoqScope,
      estAirShipping: sharedAirShipping !== '' ? sharedAirShipping : item.estAirShipping,
      estSeaShipping: sharedSeaShipping !== '' ? sharedSeaShipping : item.estSeaShipping,
      description: sharedDescription !== '' ? sharedDescription : item.description,
    }));
  }

  function handleApplySameSpecsNow() {
    setDraftItems((prev) => applySharedSpecsToList(prev));
    setStatusMsg('Applied specifications, MOQ, and scope to all items in queue.');
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
    const defaultMoq = sharedMoq || (selCat?.wholesale_moq ? String(selCat.wholesale_moq) : '50');
    const defaultScope = sharedMoqScope || (selCat?.moq_scope ? selCat.moq_scope : 'category');

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
        moqScope: sameForAll ? sharedMoqScope : defaultScope,
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
          moqScope: sharedMoqScope || defaultScope,
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
      const sizeText = item.size ? item.size.trim() : null;
      const moqVal = Number(item.moq) || (isIphoneCaseCat ? 50 : 5);
      const moqScopeVal = item.moqScope || (isIphoneCaseCat ? 'item' : 'category');

      // Colors and sizes are completely optional!
      const colorsList = item.colors && item.colors.trim() !== ''
        ? item.colors.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
      const sizesList = sizeText && sizeText.trim() !== ''
        ? sizeText.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const allImages = [item.imageUrl, ...(item.additionalImages || [])].filter(Boolean);

      let descText = item.description ? item.description.trim() : '';
      if (sizeText) descText = descText ? `${descText} • Sizes: ${sizeText}` : `Sizes: ${sizeText}`;
      if (colorsList.length > 0) {
        descText = descText ? `${descText} • Colors: ${colorsList.join(', ')}` : `Colors: ${colorsList.join(', ')}`;
      }
      if (moqVal > 0) {
        descText = descText ? `${descText} • Wholesale MOQ: ${moqVal} pcs (${moqScopeVal === 'category' ? 'Category' : 'Item'})` : `Wholesale MOQ: ${moqVal} pcs (${moqScopeVal === 'category' ? 'Category' : 'Item'})`;
      }
      descText = descText ? `${descText} • MOQ Scope: ${moqScopeVal === 'category' ? 'Category' : 'Item'}` : `MOQ Scope: ${moqScopeVal === 'category' ? 'Category' : 'Item'}`;
      if (airFee <= 0 && seaFee > 0) {
        descText = descText ? `${descText} • Shipping: Sea Cargo Only` : `Shipping: Sea Cargo Only`;
      }

      return {
        name: cleanName,
        title: cleanName,
        category_id: selectedCategoryId || null,
        size: sizeText || null,
        sizes: sizesList.length > 0 ? sizesList : null,
        size_options: sizeText || null,
        wholesale_moq: moqVal,
        min_order_qty: moqVal,
        moq_scope: moqScopeVal,
        retail_price: retail,
        wholesale_price: wholesale,
        est_shipping_fee: airFee || seaFee || 0,
        est_shipping_fee_air: airFee > 0 ? airFee : null,
        est_shipping_fee_sea: seaFee > 0 ? seaFee : null,
        image_url: item.imageUrl || null,
        images: allImages.length > 0 ? allImages : (item.imageUrl ? [item.imageUrl] : []),
        colors: colorsList.length > 0 ? colorsList : null,
        color_options: colorsList.length > 0 ? colorsList.join(', ') : null,
        description: descText || null,
      };
    });

    let { error } = await supabase.from('products').insert(payload);
    if (error && error.message?.toLowerCase().includes('schema cache')) {
      // Gracefully omit fields if Supabase columns do not exist yet
      const fallbackPayload1 = payload.map(({ moq_scope, ...rest }) => rest);
      let fallbackRes1 = await supabase.from('products').insert(fallbackPayload1);
      error = fallbackRes1.error;

      if (error && error.message?.toLowerCase().includes('schema cache')) {
        const fallbackPayload2 = payload.map(({ moq_scope, sizes, size_options, wholesale_moq, min_order_qty, ...rest }) => rest);
        let fallbackRes2 = await supabase.from('products').insert(fallbackPayload2);
        error = fallbackRes2.error;

        if (error && error.message?.toLowerCase().includes('schema cache')) {
          const minimalPayload = payload.map(({ moq_scope, images, colors, color_options, sizes, size_options, wholesale_moq, min_order_qty, ...rest }) => rest);
          const minRes = await supabase.from('products').insert(minimalPayload);
          error = minRes.error;
        }
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
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-xs text-stone-500">
        Checking authentication...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <img src="/logo.png" alt="Dainty Import" className="h-8 w-auto rounded object-contain border border-[#fa9d26]/30 p-0.5" />
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-tight">Dainty Import Admin</h1>
              <span className="text-[10px] font-semibold text-[#fa9d26] uppercase">China Sourcing Portal</span>
            </div>
          </div>

          <p className="text-xs text-stone-500 mb-4">
            Sign in with your Supabase credentials to manage categories and bulk publish China sourcing products.
          </p>

          {errorMsg && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-3">
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
              className="w-full rounded-lg bg-stone-900 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50 transition"
            >
              {signingIn ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Dainty Import" className="h-8 w-auto rounded object-contain border border-[#fa9d26]/30 p-0.5" />
            <div>
              <h1 className="text-sm font-bold text-stone-900 leading-tight">Dainty Import Admin</h1>
              <span className="text-[10px] font-semibold text-[#fa9d26] uppercase tracking-wider">China Factory Catalog Management</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-stone-600 hover:text-stone-900 underline"
            >
              View Storefront ↗
            </a>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6">
        {/* Alerts */}
        {errorMsg && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)}><X className="h-4 w-4" /></button>
          </div>
        )}
        {statusMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center justify-between">
            <span>{statusMsg}</span>
            <button onClick={() => setStatusMsg(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Categories Section */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-stone-900">1. Select or Create Category</h2>
              <p className="text-xs text-stone-500">Pick which category your uploaded items belong to.</p>
            </div>
            <button
              type="button"
              onClick={refreshData}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-50"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>

          {/* Category Chips */}
          <div className="flex flex-wrap gap-2">
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
                {c.name} {c.wholesale_moq ? `(${c.wholesale_moq} pcs ${c.moq_scope === 'category' ? 'Cat' : 'Item'})` : ''}
              </button>
            ))}
          </div>

          {/* Add Category Form with MOQ & Scope */}
          <form onSubmit={handleAddCategory} className="flex flex-wrap items-center gap-2 pt-3 border-t border-stone-100 text-xs">
            <input
              type="text"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="New category name (e.g. iPhone Cases)"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs focus:border-stone-900 focus:outline-hidden min-w-0 flex-1 sm:min-w-[200px]"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-stone-500">MOQ:</span>
              <input
                type="number"
                min="1"
                value={catMoq}
                onChange={(e) => setCatMoq(e.target.value)}
                placeholder="50"
                className="w-16 rounded-lg border border-stone-300 px-2 py-1.5 text-xs"
              />
            </div>
            <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5 border border-stone-200">
              <button
                type="button"
                onClick={() => setCatMoqScope('item')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  catMoqScope === 'item' ? 'bg-white text-stone-900 shadow-2xs font-bold' : 'text-stone-600'
                }`}
              >
                Per Item
              </button>
              <button
                type="button"
                onClick={() => setCatMoqScope('category')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  catMoqScope === 'category' ? 'bg-white text-stone-900 shadow-2xs font-bold' : 'text-stone-600'
                }`}
              >
                Whole Category
              </button>
            </div>
            <button
              type="submit"
              disabled={savingCat}
              className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {savingCat ? 'Adding...' : 'Add Category'}
            </button>
          </form>
        </section>

        {/* Gallery Upload & Batch Specifications */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-stone-900">2. Upload China Product Photos & Specifications</h2>
            <p className="text-xs text-stone-500">
              Configure wholesale MOQs (per item or whole category), optional Air/Sea shipping, and optional sizes/colors.
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
              Single Product (Multiple photos/angles/colors)
            </button>
          </div>

          {/* Shared Specifications Panel */}
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sameForAll}
                  onChange={(e) => setSameForAll(e.target.checked)}
                  className="rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                />
                <span className="text-xs font-bold text-stone-900">
                  Apply Same Specifications, MOQ & Prices to All Uploads
                </span>
              </label>
              <span className="text-[11px] text-stone-500">
                Sizes & colors are fully optional!
              </span>
            </div>

            {sameForAll && (
              <div className="space-y-3 pt-1">
                {/* Wholesale MOQ Scope Selection (Requirement #1) */}
                <div className="rounded-lg bg-amber-50/70 border border-amber-200/80 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5" /> Wholesale Minimum Order (MOQ) Scope
                    </span>
                    <span className="text-[11px] text-amber-800 font-semibold">
                      Target: {sharedMoq} pieces
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setSharedMoqScope('item')}
                      className={`rounded-lg border p-2.5 text-left text-xs transition ${
                        sharedMoqScope === 'item'
                          ? 'border-[#fa9d26] bg-white ring-2 ring-[#fa9d26]/30 shadow-xs text-stone-900'
                          : 'border-stone-200 bg-white/60 text-stone-600 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-stone-900">
                        <Box className="h-3.5 w-3.5 text-[#fa9d26]" />
                        <span>Per Item Only (Product Specific)</span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-500 leading-snug">
                        Customers must buy at least <strong>{sharedMoq || 50} pcs</strong> of <em>this exact item</em>. They can mix sizes and colors toward the {sharedMoq || 50} pcs minimum. (Recommended for iPhone cases).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSharedMoqScope('category')}
                      className={`rounded-lg border p-2.5 text-left text-xs transition ${
                        sharedMoqScope === 'category'
                          ? 'border-[#fa9d26] bg-white ring-2 ring-[#fa9d26]/30 shadow-xs text-stone-900'
                          : 'border-stone-200 bg-white/60 text-stone-600 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-stone-900">
                        <FolderPlus className="h-3.5 w-3.5 text-blue-600" />
                        <span>Whole Category (Mix & Match)</span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-500 leading-snug">
                        Customers can mix and match <em>any different products</em> in this category to hit the <strong>{sharedMoq || 5} pcs</strong> wholesale minimum in their cart.
                      </p>
                    </button>
                  </div>
                </div>

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
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-stone-600">
                        Sizes / Models
                      </label>
                      <span className="text-[10px] text-stone-400 font-normal">Optional</span>
                    </div>
                    <input
                      type="text"
                      value={sharedSize}
                      onChange={(e) => setSharedSize(e.target.value)}
                      placeholder="e.g. iPhone 11, 12, 13, 14, 15 Pro Max (or leave blank)"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-stone-600">
                        Colors
                      </label>
                      <span className="text-[10px] text-stone-400 font-normal">Optional</span>
                    </div>
                    <input
                      type="text"
                      value={sharedColors}
                      onChange={(e) => setSharedColors(e.target.value)}
                      placeholder="e.g. Black, White, Pink (or leave blank)"
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
                    <span className="text-[10px] text-stone-400">Within 3 weeks (optional)</span>
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
                    <span className="text-[10px] text-stone-400">Within 3 months (optional)</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3 pt-1">
                  <div className="min-w-0 flex-1 sm:min-w-[220px] flex-1">
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
                Select multiple pictures at once — JPG, PNG, WEBP. Sizes and colors are optional!
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
                <span className="text-xs font-bold text-stone-700">
                  Ready to Publish ({draftItems.length} item{draftItems.length > 1 ? 's' : ''})
                </span>
                <button
                  type="button"
                  onClick={() => setDraftItems([])}
                  className="text-xs text-red-600 hover:underline"
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
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-stone-500">Sizes / Models</label>
                          <span className="text-[10px] text-stone-400 font-normal">Optional</span>
                        </div>
                        <input
                          type="text"
                          value={item.size}
                          onChange={(e) => updateDraftItem(item.tempId, 'size', e.target.value)}
                          placeholder="e.g. S, M, L or leave blank"
                          className="mt-0.5 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-stone-700">Colors</label>
                          <span className="text-[10px] text-stone-400 font-normal">Optional</span>
                        </div>
                        <input
                          type="text"
                          value={item.colors}
                          onChange={(e) => updateDraftItem(item.tempId, 'colors', e.target.value)}
                          placeholder="e.g. Black, White or leave blank"
                          className="mt-0.5 w-full rounded-md border border-stone-300 bg-stone-50/50 px-2 py-1 text-xs font-medium text-stone-900"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-medium text-amber-800">MOQ & Scope</label>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            type="number"
                            min="1"
                            value={item.moq}
                            onChange={(e) => updateDraftItem(item.tempId, 'moq', e.target.value)}
                            placeholder="50"
                            className="w-14 rounded-md border border-amber-300 bg-amber-50/50 px-1.5 py-1 text-xs font-semibold"
                          />
                          <select
                            value={item.moqScope || 'item'}
                            onChange={(e) => updateDraftItem(item.tempId, 'moqScope', e.target.value as any)}
                            className="text-[10px] rounded border border-stone-300 px-1 py-1 bg-white font-medium"
                          >
                            <option value="item">Item</option>
                            <option value="category">Category</option>
                          </select>
                        </div>
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
                          placeholder="e.g. 1500"
                          className="mt-0.5 w-full rounded-md border border-blue-300 bg-blue-50/30 px-2 py-1 text-xs"
                        />
                      </div>

                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => removeDraftItem(item.tempId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Publish Button */}
              <button
                type="button"
                disabled={savingBatch}
                onClick={handleSaveAllDraftProducts}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-xs font-bold text-white shadow-sm hover:bg-[#fa9d26] transition disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {savingBatch ? 'Publishing to China Catalog...' : `Publish All ${draftItems.length} Product(s) Now`}
              </button>
            </div>
          )}
        </section>

        {/* Existing Products List */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-stone-900">3. Current Store Products ({products.length})</h2>
              <p className="text-xs text-stone-500">Live products in your store catalog.</p>
            </div>
          </div>

          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {products.length === 0 ? (
              <p className="text-xs text-stone-400 py-4 text-center">No products published yet.</p>
            ) : (
              products.map((p) => {
                const air = Number(p.est_shipping_fee_air ?? p.est_shipping_fee ?? 0);
                const sea = Number(p.est_shipping_fee_sea ?? p.est_shipping_fee ?? 0);
                const pTitle = p.name || p.title || 'Untitled';
                const moqVal = p.wholesale_moq || p.min_order_qty || 5;

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50/50 p-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {p.image_url ? (
                        <img src={p.image_url} alt={pTitle} className="h-12 w-12 rounded-lg object-contain bg-white border border-stone-200 p-0.5" />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-stone-200 flex items-center justify-center text-[10px] text-stone-500">No img</div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-stone-900 truncate">{pTitle}</div>
                        <div className="text-[11px] text-stone-500 flex flex-wrap gap-2 mt-0.5">
                          <span>Retail: ₦{Number(p.retail_price).toLocaleString()}</span>
                          <span className="font-medium text-amber-700">Wholesale: ₦{Number(p.wholesale_price).toLocaleString()} (MOQ: {moqVal} pcs)</span>
                          {p.size && <span>Size: {p.size}</span>}
                          {p.colors && p.colors.length > 0 && <span>Colors: {p.colors.join(', ')}</span>}
                          {air <= 0 && sea > 0 ? (
                            <span className="text-blue-700 font-medium">Sea Only (₦{sea.toLocaleString()})</span>
                          ) : (
                            <span>Air: ₦{air.toLocaleString()} • Sea: ₦{sea.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(p.id)}
                      className="ml-3 p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-white"
                      title="Delete Product"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
