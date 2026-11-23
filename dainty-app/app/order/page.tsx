'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import {
  ArrowLeft,
  Check,
  Edit2,
  ExternalLink,
  Eye,
  FileText,
  Lock,
  Maximize2,
  MessageCircle,
  Minus,
  Plane,
  Plus,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Ship,
  ShoppingBag,
  Sparkles,
  Trash2,
  Unlock,
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
  admin_notes?: string;
  customer_name?: string;
  customer_phone?: string;
  created_at?: string;
};

export default function OrderCatalogPage() {
  const [orderId, setOrderId] = useState<string>('');
  const [order, setOrder] = useState<PreorderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Admin edit mode
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Editable state (used when admin is unlocked)
  const [editedItems, setEditedItems] = useState<OrderItem[]>([]);
  const [editedShippingMethod, setEditedShippingMethod] = useState<'air' | 'sea'>('air');
  const [editedAdminNotes, setEditedAdminNotes] = useState('');

  // Read order ID or encoded fallback from window.location
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id') || '';
    const fallbackData = urlParams.get('d') || urlParams.get('data') || '';

    setOrderId(id);

    // Auto-unlock admin if ?admin=1234 or similar in URL
    const adminParam = urlParams.get('admin');
    if (adminParam === '1234' || adminParam === 'true') {
      setIsAdminUnlocked(true);
    }

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
  const activeItems = isAdminUnlocked ? editedItems : (order?.items || []);
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

  // Admin PIN verification (Default PIN: 1234)
  function handleUnlockAdmin() {
    if (adminPinInput.trim() === '1234') {
      setIsAdminUnlocked(true);
      setShowPinModal(false);
      setPinError(false);
      setAdminPinInput('');
    } else {
      setPinError(true);
    }
  }

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

  // Admin Save Changes
  async function handleSaveAdminChanges() {
    if (!order) return;
    setIsSaving(true);
    setSaveSuccess(false);

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

    // Save to Supabase preorders
    try {
      await supabase.from('preorders').upsert([updatedRecord]);
    } catch (e) {
      console.warn('Failed to upsert to Supabase:', e);
    }

    // Save to localStorage
    try {
      localStorage.setItem(`dainty_order_${order.id}`, JSON.stringify(updatedRecord));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
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
    const cleanPhone = '2348000000000'; // Fallback or loaded from settings
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    const lines: string[] = [
      `*🇨🇳 China Factory Preorder - Dainty Import*`,
      `*Order ID:* #${order.id}`,
      '',
      `*📦 Total Items Ordered:* ${activeItems.length} item${activeItems.length === 1 ? '' : 's'}`,
      `*🔢 Total Pieces:* ${totalPieces} pcs`,
      `*💰 Total Product Price:* ₦${totalProductCost.toLocaleString()}`,
      `*🚢 Shipping Method:* ${activeShippingMethod.toUpperCase()} (${shippingTimeline})`,
      `*📦 Est. Shipping Fee:* ${estShippingCost > 0 ? `₦${estShippingCost.toLocaleString()}` : 'To be confirmed upon arrival in Nigeria'}`,
      '',
      `*🛒 View Cart (Click link below to view full cart and all items on website):*`,
      currentUrl,
      '',
      `*China Sourcing & Preorder Terms*`,
      `• *Initial Payment:* The initial payment covers only the cost of purchasing your item. Your order will be shipped once the purchase payment has been completed.`,
      `• *Shipping Estimate:* Shipping fees provided are estimates. The exact shipping cost will be confirmed when your order arrives in Nigeria.`,
      `• *Shipping Payment:* Shipping fees are paid separately when your order arrives in Nigeria.`
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

      {/* Admin PIN Modal */}
      {showPinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setShowPinModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-stone-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-sm">Admin Access</h3>
                <p className="text-xs text-stone-500">Enter Admin PIN to edit this preorder</p>
              </div>
            </div>

            <div className="mt-4">
              <input
                type="password"
                placeholder="Enter PIN (Default: 1234)"
                value={adminPinInput}
                onChange={(e) => {
                  setAdminPinInput(e.target.value);
                  setPinError(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlockAdmin()}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-center text-lg tracking-widest font-mono focus:border-[#fa9d26] focus:outline-hidden"
                autoFocus
              />
              {pinError && (
                <p className="mt-2 text-center text-xs font-semibold text-red-600">
                  Incorrect PIN. Please try again.
                </p>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="flex-1 rounded-xl border border-stone-200 py-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnlockAdmin}
                className="flex-1 rounded-xl bg-[#fa9d26] py-2.5 text-xs font-bold text-white hover:bg-[#e68c1d] shadow-sm transition"
              >
                Unlock
              </button>
            </div>
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
              {orderId ? `#${orderId}` : 'Preorder Sheet'}
            </span>

            {/* Admin Edit / Lock toggle: only visible when explicitly unlocked from admin dashboard */}
            {isAdminUnlocked && (
              <button
                type="button"
                onClick={() => setIsAdminUnlocked(false)}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-200 transition"
                title="Lock Admin Mode"
              >
                <Unlock className="h-3.5 w-3.5 text-amber-700" />
                <span>Admin Editing</span>
              </button>
            )}

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
            <p className="mt-4 text-xs font-medium text-stone-500">Loading preorder catalog...</p>
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
                <button
                  type="button"
                  onClick={handleSaveAdminChanges}
                  disabled={isSaving}
                  className="rounded-lg bg-[#fa9d26] px-3 py-1 text-xs font-bold text-white hover:bg-[#e68c1d] disabled:opacity-50 transition"
                >
                  {isSaving ? 'Saving...' : saveSuccess ? '✓ Saved!' : 'Save Changes'}
                </button>
              </div>
            )}

            {/* Order Title & Badge */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg sm:text-xl font-extrabold text-stone-900 tracking-tight">
                      🇨🇳 China Factory Preorder Sheet
                    </h1>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Order Ref: <span className="font-mono font-bold text-stone-800">#{order?.id}</span> • Mode: <span className="font-semibold uppercase text-[#fa9d26]">{order?.mode}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">
                    <Check className="h-3.5 w-3.5" />
                    Verified Preorder
                  </span>
                </div>
              </div>

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
                  <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Shipping Method</div>
                  <div className="mt-1 text-xs font-bold text-stone-800 flex items-center gap-1">
                    {activeShippingMethod === 'air' ? (
                      <>
                        <Plane className="h-3.5 w-3.5 text-sky-600" />
                        <span>AIR (~3 wks)</span>
                      </>
                    ) : (
                      <>
                        <Ship className="h-3.5 w-3.5 text-teal-600" />
                        <span>SEA (~3 mos)</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Catalog Items Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-[#fa9d26]" />
                  <span>Selected Products Catalog ({activeItems.length})</span>
                </h2>
                <span className="text-xs text-stone-500">{totalPieces} total units</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {activeItems.map((item, idx) => {
                  const itemSubtotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
                  const shipFee =
                    activeShippingMethod === 'air'
                      ? Number(item.estShippingAir || 0)
                      : Number(item.estShippingSea || 0);

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
                                🎨 {item.selectedColor}
                              </span>
                            )}
                            {item.selectedSize && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                                📏 {item.selectedSize}
                              </span>
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
                  <strong className="text-stone-900">Initial Payment:</strong> The initial payment covers only the cost of purchasing your item. Your order will be shipped once the purchase payment has been completed.
                </p>
                <p>
                  <strong className="text-stone-900">Shipping Estimate:</strong> Shipping fees provided are estimates. The exact shipping cost will be confirmed when your order arrives in Nigeria.
                </p>
                <p>
                  <strong className="text-stone-900">Shipping Payment:</strong> Shipping fees are paid separately when your order arrives in Nigeria.
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
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
