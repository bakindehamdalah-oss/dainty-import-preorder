'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { getShippingBatch } from '../../lib/shippingBatches';
import {
  ArrowLeft,
  Check,
  Clock,
  Maximize2,
  MessageCircle,
  Minus,
  Plane,
  Plus,
  Share2,
  ShieldCheck,
  Ship,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
  X,
} from 'lucide-react';

export type OrderItem = {
  productId: string;
  title: string;
  price: number;
  quantity: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
  selectedImage?: string | null;
  estShippingAir?: number;
  estShippingSea?: number;
};

export type PreorderRecord = {
  id: string;
  items: OrderItem[];
  total_pieces: number;
  total_amount: number;
  mode: 'wholesale' | 'retail';
  shipping_method: 'air' | 'sea';
  est_shipping_fee?: number;
  shipping_timeline?: string;
  shipping_batch?: string | null;
  admin_notes?: string;
  customer_name?: string;
  customer_phone?: string;
  created_at?: string;
  status?: string;
  payment_date?: string;
  china_ordered_at?: string;
  shipped_at?: string;
  ready_at?: string;
  delivered_at?: string;
};

export default function OrderCatalogPage() {
  const [orderId, setOrderId] = useState<string>('');
  const [order, setOrder] = useState<PreorderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminSaveError, setAdminSaveError] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);


  const isPaid = useMemo(() => {
    if (!order) return false;
    const s = String(order.status || '').toLowerCase().trim();
    return ['paid', 'ordered', 'shipped', 'ready_for_delivery', 'delivered'].includes(s) || Boolean(order.payment_date);
  }, [order]);

  // Real-time status sync when admin updates payment or fulfillment
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order_realtime_${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'preorders', filter: `id=eq.${orderId}` },
        (payload) => {
          if (payload.new) {
            setOrder((prev) => ({ ...prev, ...(payload.new as PreorderRecord) }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  // Admin edit mode
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Editable state (used when admin is unlocked)
  const [editedItems, setEditedItems] = useState<OrderItem[]>([]);
  const [editedShippingMethod, setEditedShippingMethod] = useState<'air' | 'sea'>('air');
  const [editedAdminNotes, setEditedAdminNotes] = useState('');

  // Only an authenticated Supabase admin session can enable order editing.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setIsAdminUnlocked(Boolean(session));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdminUnlocked(Boolean(session));
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Read order ID or encoded fallback from window.location
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id') || '';
    const fallbackData = urlParams.get('d') || urlParams.get('data') || '';

    // The order ID comes from the customer-specific URL and drives the order fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrderId(id);

    async function fetchOrder() {
      setLoading(true);
      setErrorMsg(null);

      // 1. Try fetching from Supabase preorders table
      if (id) {
        try {
          const { data, error } = await supabase
            .from('preorders')
            .select('*')
            .eq('id', id)
            .maybeSingle();

          if (data && !error) {
            setOrder(data);
            setEditedItems(data.items || []);
            setEditedShippingMethod(data.shipping_method || 'air');
            setEditedAdminNotes(data.admin_notes || '');
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Could not query Supabase preorders:', err);
        }

        // 2. Try loading from device localStorage
        try {
          const localSaved = localStorage.getItem(`dainty_order_${id}`);
          if (localSaved) {
            const parsed = JSON.parse(localSaved);
            setOrder(parsed);
            setEditedItems(parsed.items || []);
            setEditedShippingMethod(parsed.shipping_method || 'air');
            setEditedAdminNotes(parsed.admin_notes || '');
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('LocalStorage order read error:', e);
        }
      }

      // 3. Try fallback encoded data in URL
      if (fallbackData) {
        try {
          const json = decodeURIComponent(atob(decodeURIComponent(fallbackData)));
          const parsed = JSON.parse(json);
          setOrder(parsed);
          setEditedItems(parsed.items || []);
          setEditedShippingMethod(parsed.shipping_method || 'air');
          setEditedAdminNotes(parsed.admin_notes || '');
          setLoading(false);
          return;
        } catch (e) {
          console.warn('Fallback data parse error:', e);
        }
      }

      // If nothing found
      setErrorMsg(
        id
          ? `Order #${id} could not be loaded. Please ensure it has been submitted or check your connection.`
          : 'No Order ID provided in the link.'
      );
      setLoading(false);
    }

    fetchOrder();
  }, []);

  // Recalculate totals for active items (view or admin edit mode)
  const activeItems = useMemo(
    () => (isAdminUnlocked ? editedItems : (order?.items || [])),
    [isAdminUnlocked, editedItems, order?.items]
  );
  const activeShippingMethod = isAdminUnlocked ? editedShippingMethod : (order?.shipping_method || 'air');

  const totalPieces = useMemo(() => {
    return activeItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }, [activeItems]);

  const totalProductCost = useMemo(() => {
    return activeItems.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
      0
    );
  }, [activeItems]);

  const estShippingCost = useMemo(() => {
    return activeItems.reduce((sum, item) => {
      const fee =
        activeShippingMethod === 'air'
          ? Number(item.estShippingAir || 0)
          : Number(item.estShippingSea || 0);
      return sum + fee * (Number(item.quantity) || 0);
    }, 0);
  }, [activeItems, activeShippingMethod]);

  const shippingTimeline = activeShippingMethod === 'air' ? '~3 weeks' : '~3 months';
  const orderDate = order?.created_at ? new Date(order.created_at) : null;
  const activeBatch = getShippingBatch(activeShippingMethod, orderDate);
  const displayBatchName = order?.shipping_batch || activeBatch.batchName;

  // Admin quantity & item controls
  function handleQuantityChange(index: number, delta: number) {
    setEditedItems((prev) => {
      const copy = [...prev];
      const newQty = (copy[index].quantity || 1) + delta;
      if (newQty <= 0) {
        copy.splice(index, 1);
      } else {
        copy[index] = { ...copy[index], quantity: newQty };
      }
      return copy;
    });
  }

  function handleRemoveItem(index: number) {
    setEditedItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Save changes only when the existing Supabase admin session is still valid.
  async function handleSaveAdminChanges() {
    if (!order) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsAdminUnlocked(false);
      setAdminSaveError('Your admin session has expired. Sign in through the admin dashboard to edit this order.');
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);
    setAdminSaveError(null);

    const updatedRecord: PreorderRecord = {
      ...order,
      items: editedItems,
      shipping_method: editedShippingMethod,
      total_pieces: totalPieces,
      total_amount: totalProductCost,
      est_shipping_fee: estShippingCost,
      shipping_timeline: shippingTimeline,
      admin_notes: editedAdminNotes,
    };

    const { error } = await supabase.from('preorders').upsert([updatedRecord]);
    if (error) {
      setIsSaving(false);
      setAdminSaveError(`Could not save this order: ${error.message}`);
      return;
    }

    setOrder(updatedRecord);
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  function handleCopyOrderLink() {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  }

  // Generate WhatsApp message from this catalog
  function buildOrderWhatsAppUrl() {
    if (!order) return '#';
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    const lines: string[] = [
      `*Dainty Preorder*`,
      `*Order ID:* #${order.id}`,
      '',
      `*Total Items Ordered:* ${activeItems.length} item${activeItems.length === 1 ? '' : 's'}`,
      `*Total Pieces:* ${totalPieces} pcs`,
      `*Total Product Price:* ₦${totalProductCost.toLocaleString()}`,
      `*Shipping Method:* ${activeShippingMethod.toUpperCase()}`,
      `*Shipping Batch:* ${displayBatchName} (${activeBatch.dispatchSchedule} · ${activeBatch.timeline})`,
      `*Est. Shipping Fee:* ${estShippingCost > 0 ? `₦${estShippingCost.toLocaleString()}` : 'To be confirmed upon arrival in Nigeria'}`,
      '',
      `*View Order:*`,
      currentUrl,
    ];

    return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  return (
    <div className="min-h-screen w-full bg-[#fdfbf7] text-stone-900 flex flex-col font-sans">
      {/* Lightbox / Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs transition"
          onClick={() => setZoomedImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-white p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomedImage}
              alt="Enlarged view"
              className="max-h-[82vh] max-w-[85vw] object-contain rounded-xl"
            />
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black transition shadow-lg"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Storefront</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-[#b86200]">
              {orderId ? `#${orderId}` : 'Preorder'}
            </span>

            {isAdminUnlocked && (
              <span className="inline-flex items-center rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                Admin Editing
              </span>
            )}

            <a
              href={buildOrderWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
              title="Message on WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
              <span>WhatsApp</span>
            </a>
            <button
              type="button"
              onClick={handleCopyOrderLink}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition shadow-2xs"
            >
              <Share2 className="h-3.5 w-3.5 text-stone-500" />
              <span>{copiedLink ? 'Copied!' : 'Share'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-3 border-stone-300 border-t-[#fa9d26]" />
            <p className="mt-4 text-xs font-medium text-stone-500">Loading preorder details...</p>
          </div>
        ) : errorMsg ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-semibold text-red-700">{errorMsg}</p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#fa9d26] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#e68c1d]"
            >
              Browse Catalog
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Admin notice banner when editing */}
            {isAdminUnlocked && (
              <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 font-medium">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#fa9d26] shrink-0" />
                  <span>Admin Mode Active: You can adjust quantities, remove items, or switch shipping method.</span>
                </div>
                <div className="ml-auto flex flex-col items-end gap-1">
                  {adminSaveError && <span role="alert" className="max-w-xs text-[11px] font-semibold text-red-700">{adminSaveError}</span>}
                  <button
                  type="button"
                  onClick={handleSaveAdminChanges}
                  disabled={isSaving}
                  className="rounded-lg bg-[#fa9d26] px-3 py-1 text-xs font-bold text-white hover:bg-[#e68c1d] disabled:opacity-50 transition"
                >
                  {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}

            {/* Order Title & Badge */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg sm:text-xl font-extrabold text-stone-900 tracking-tight">
                      Dainty Preorder
                    </h1>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Order Ref: <span className="font-mono font-bold text-stone-800">#{order?.id}</span> • Mode: <span className="font-semibold uppercase text-[#fa9d26]">{order?.mode}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isPaid ? (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-300 px-3 py-1 text-xs font-bold text-emerald-800 shadow-2xs">
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Payment Confirmed
                      </span>
                      <Link
                        href={`/track?id=${order?.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-3.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-stone-800 transition"
                      >
                        <Truck className="h-3.5 w-3.5 text-[#fa9d26]" />
                        <span>Track Order</span>
                      </Link>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
                      <Clock className="h-3.5 w-3.5 text-amber-600" />
                      Pending Payment
                    </span>
                  )}
                </div>
              </div>

              {/* Real-time Tracking Notice when Payment is Confirmed */}
              {isPaid && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-2xs">
                      <Truck className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-950">Payment Confirmed • Tracking Active</div>
                      <div className="text-[11px] text-emerald-800">Your purchase payment is confirmed! You can now track China procurement and delivery in real time.</div>
                    </div>
                  </div>
                  <Link
                    href={`/track?id=${order?.id}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-2xs shrink-0"
                  >
                    <Truck className="h-3.5 w-3.5" />
                    <span>Track Order</span>
                  </Link>
                </div>
              )}

              {/* Summary Stats Row */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-stone-50 p-3 border border-stone-100">
                  <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Total Items</div>
                  <div className="mt-1 text-base font-extrabold text-stone-900">
                    {activeItems.length} {activeItems.length === 1 ? 'Design' : 'Designs'}
                  </div>
                </div>

                <div className="rounded-xl bg-stone-50 p-3 border border-stone-100">
                  <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Total Quantity</div>
                  <div className="mt-1 text-base font-extrabold text-stone-900">
                    {totalPieces} Pieces
                  </div>
                </div>

                <div className="rounded-xl bg-stone-50 p-3 border border-stone-100">
                  <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Product Total</div>
                  <div className="mt-1 text-base font-extrabold text-[#b86200]">
                    ₦{totalProductCost.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-xl bg-stone-50 p-3 border border-stone-100">
                  <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Shipping & Batch</div>
                  <div className="mt-1 text-xs font-bold text-stone-800 flex items-center gap-1">
                    {activeShippingMethod === 'air' ? (
                      <>
                        <Plane className="h-3.5 w-3.5 text-sky-600" />
                        <span>Air (~3 wks)</span>
                      </>
                    ) : (
                      <>
                        <Ship className="h-3.5 w-3.5 text-teal-600" />
                        <span>Sea (~3 mos)</span>
                      </>
                    )}
                    <span className="text-[11px] text-stone-500 font-normal">• {displayBatchName}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Catalog Items Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-[#fa9d26]" />
                  <span>Order Items ({activeItems.length})</span>
                </h2>
                <span className="text-xs text-stone-500">{totalPieces} total units</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {activeItems.map((item, idx) => {
                  const itemSubtotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
                  return (
                    <div
                      key={idx}
                      className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-xs transition hover:border-stone-300"
                    >
                      {/* Product Thumbnail with Lightbox */}
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-100 border border-stone-200">
                        {item.selectedImage ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.selectedImage}
                              alt={item.title}
                              className="h-full w-full object-cover cursor-zoom-in"
                              onClick={() => setZoomedImage(item.selectedImage || null)}
                            />
                            <button
                              type="button"
                              onClick={() => setZoomedImage(item.selectedImage || null)}
                              className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white"
                              title="Zoom"
                            >
                              <Maximize2 className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-stone-400">
                            <ShoppingBag className="h-6 w-6" />
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="flex flex-1 flex-col justify-between min-w-0">
                        <div>
                          <h3 className="text-xs font-bold text-stone-900 line-clamp-2 leading-snug">
                            {item.title}
                          </h3>

                          {/* Selected specifications */}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.selectedColor && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                                Color: {item.selectedColor}
                              </span>
                            )}
                            {item.selectedSize && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                                Size: {item.selectedSize}
                              </span>
                            )}
                            {activeShippingMethod === 'air' ? (
                              Number(item.estShippingAir || 0) > 0 ? (
                                <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                                  Est. Air: ₦{Number(item.estShippingAir).toLocaleString()}/pc
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-red-50 text-red-700 px-2 py-0.5 text-[10px] font-semibold border border-red-200">
                                  Can&apos;t be shipped by air
                                </span>
                              )
                            ) : (
                              Number(item.estShippingSea || 0) > 0 ? (
                                <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                                  Est. Sea: ₦{Number(item.estShippingSea).toLocaleString()}/pc
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-red-50 text-red-700 px-2 py-0.5 text-[10px] font-semibold border border-red-200">
                                  Can&apos;t be shipped by sea
                                </span>
                              )
                            )}
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between">
                          <div>
                            <div className="text-[11px] text-stone-500">
                              ₦{Number(item.price).toLocaleString()} × {item.quantity}
                            </div>
                            <div className="text-xs font-black text-stone-900">
                              ₦{itemSubtotal.toLocaleString()}
                            </div>
                          </div>

                          {/* Admin Edit Controls for Quantity */}
                          {isAdminUnlocked ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(idx, -1)}
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="min-w-6 text-center text-xs font-bold">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(idx, 1)}
                                className="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="ml-1 p-1 text-stone-400 hover:text-red-600"
                                title="Remove"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-700">
                              Qty: {item.quantity} pcs
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Admin Shipping Switcher if Unlocked */}
            {isAdminUnlocked && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="text-xs font-bold text-amber-950 uppercase tracking-wider mb-2">
                  Admin: Change Shipping Method
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditedShippingMethod('air')}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition ${
                      editedShippingMethod === 'air'
                        ? 'border-sky-500 bg-white text-sky-950 shadow-xs'
                        : 'border-stone-200 bg-white/70 text-stone-600 hover:bg-white'
                    }`}
                  >
                    <Plane className="h-4 w-4 text-sky-600" />
                    <span>Air Cargo (~3 weeks)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditedShippingMethod('sea')}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition ${
                      editedShippingMethod === 'sea'
                        ? 'border-teal-500 bg-white text-teal-950 shadow-xs'
                        : 'border-stone-200 bg-white/70 text-stone-600 hover:bg-white'
                    }`}
                  >
                    <Ship className="h-4 w-4 text-teal-600" />
                    <span>Sea Cargo (~3 months)</span>
                  </button>
                </div>
              </div>
            )}

            {/* China Sourcing Terms Card */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#fa9d26]" />
                <span>China Sourcing & Preorder Terms</span>
              </h3>
              <div className="space-y-2 text-xs text-stone-600 leading-relaxed border-t border-stone-100 pt-3">
                <p>
                  <strong className="text-stone-900">Initial Payment:</strong> The initial payment covers the buying price of the item. Your order will be shipped once the purchase payment has been completed.
                </p>
                <p>
                  <strong className="text-stone-900">Shipping Estimate:</strong> Estimated shipping fee is shown, but the exact shipping cost will be given when the shipment arrives in Nigeria.
                </p>
                <p>
                  <strong className="text-stone-900">Shipping Payment:</strong> Shipping fee is confirmed and paid separately when your goods arrive in Nigeria.
                </p>
                <p>
                  <strong className="text-stone-900">Payment Window:</strong> Confirmed shipping fees must be settled within 7 days of notification.
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {isPaid && (
                <Link
                  href={`/track?id=${order?.id}`}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-stone-900 py-3.5 text-xs font-bold text-white shadow-sm hover:bg-stone-800 transition"
                >
                  <Truck className="h-4 w-4 text-[#fa9d26]" />
                  <span>Track Order</span>
                </Link>
              )}
              <a
                href={buildOrderWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Open in WhatsApp</span>
              </a>

              <Link
                href="/"
                className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3.5 text-xs font-bold text-stone-700 shadow-2xs hover:bg-stone-50 transition"
              >
                <span>Back to Store</span>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
