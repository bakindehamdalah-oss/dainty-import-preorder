'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Grid,
  Heart,
  Home,
  Maximize2,
  MessageCircle,
  Package,
  PackagePlus,
  Plane,
  RefreshCw,
  Search,
  Ship,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import ReviewModal from '../components/ReviewModal';
import {
  addPastItemToCart,
  getAllSavedReviews,
  getReviewKey,
  ProductReview,
} from '../../lib/reviews';

type OrderItem = {
  productId: string;
  title: string;
  price: number;
  quantity: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
  selectedImage?: string | null;
  estShippingAir?: number | null;
  estShippingSea?: number | null;
};

type Preorder = {
  id: string;
  items: OrderItem[];
  total_pieces: number;
  total_amount: number;
  mode?: 'retail' | 'wholesale';
  shipping_method?: 'air' | 'sea';
  est_shipping_fee?: number;
  final_shipping_fee?: number;
  shipping_timeline?: string;
  status?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_city?: string;
  created_at?: string;
  payment_date?: string;
  china_ordered_at?: string;
  shipped_at?: string;
  ready_at?: string;
  delivered_at?: string;
  cancelled_at?: string;
  is_delayed?: boolean;
  delay_reason?: string;
  revised_arrival_date?: string;
};

type StoreSettings = {
  id: number;
  whatsapp_number: string | null;
};

export default function MePage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Preorder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'transit' | 'delivered' | 'unpaid'>('all');
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Phone / Order ID lookup state
  const [phoneLookup, setPhoneLookup] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);

  // Review Modal State
  const [activeReviewItem, setActiveReviewItem] = useState<{
    orderId: string;
    item: OrderItem;
  } | null>(null);
  const [savedReviews, setSavedReviews] = useState<Record<string, ProductReview>>({});

  // WhatsApp and store settings
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('Valued Shopper');

  // Reorder toast message
  const [reorderNotice, setReorderNotice] = useState<string | null>(null);

  // 1. Initial Load of Saved Orders and Reviews
  useEffect(() => {
    async function initMePage() {
      setLoading(true);

      // Load settings
      try {
        const { data: sData } = await supabase
          .from('store_settings')
          .select('whatsapp_number')
          .eq('id', 1)
          .maybeSingle();
        if (sData?.whatsapp_number) {
          setWhatsappNumber(sData.whatsapp_number);
        }
      } catch (e) {
        console.warn('Could not fetch store settings:', e);
      }

      // Load saved reviews
      setSavedReviews(getAllSavedReviews());

      // Read device orders from localStorage
      const localOrdersMap = new Map<string, Preorder>();
      const trackedIds = new Set<string>();

      if (typeof window !== 'undefined') {
        const cachedName = localStorage.getItem('dainty_customer_name');
        if (cachedName) setCustomerName(cachedName);

        // A. From saved order IDs array
        try {
          const idsRaw = localStorage.getItem('dainty_customer_order_ids');
          if (idsRaw) {
            const arr = JSON.parse(idsRaw);
            if (Array.isArray(arr)) {
              arr.forEach((id) => trackedIds.add(String(id).trim()));
            }
          }
        } catch (e) {
          console.warn('Error reading order IDs array:', e);
        }

        // B. From all dainty_order_ keys
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('dainty_order_')) {
              const raw = localStorage.getItem(key);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.id) {
                  localOrdersMap.set(parsed.id, parsed);
                  trackedIds.add(parsed.id);
                }
              }
            }
          }
        } catch (e) {
          console.warn('Error reading individual order keys:', e);
        }
      }

      const allIds = Array.from(trackedIds);

      // Fetch live updates from Supabase
      if (allIds.length > 0) {
        try {
          const { data: dbOrders } = await supabase
            .from('preorders')
            .select('*')
            .in('id', allIds)
            .order('created_at', { ascending: false });

          if (dbOrders && dbOrders.length > 0) {
            dbOrders.forEach((o) => {
              localOrdersMap.set(o.id, o as Preorder);
            });
          }
        } catch (err) {
          console.warn('Could not query live preorders from Supabase:', err);
        }
      }

      const sorted = Array.from(localOrdersMap.values()).sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      });

      setOrders(sorted);
      setLoading(false);
    }

    void initMePage();
  }, []);

  // 2. Lookup Orders by WhatsApp Number or Order ID
  async function handleFindOrders(e: React.FormEvent) {
    e.preventDefault();
    const query = phoneLookup.trim();
    if (!query) return;

    setLookupLoading(true);
    setLookupNotice(null);

    try {
      const cleanDigits = query.replace(/[^0-9]/g, '');

      // Search Supabase
      let matches: Preorder[] = [];

      // A. Try exact or partial Order ID match
      const { data: byId } = await supabase
        .from('preorders')
        .select('*')
        .ilike('id', `%${query.replace(/^#/, '')}%`);

      if (byId && byId.length > 0) {
        matches = [...matches, ...(byId as Preorder[])];
      }

      // B. Try Phone number match
      if (cleanDigits.length >= 7) {
        const { data: byPhone } = await supabase
          .from('preorders')
          .select('*')
          .ilike('customer_phone', `%${cleanDigits.slice(-8)}%`);

        if (byPhone && byPhone.length > 0) {
          byPhone.forEach((item) => {
            if (!matches.some((m) => m.id === item.id)) {
              matches.push(item as Preorder);
            }
          });
        }
      }

      if (matches.length > 0) {
        // Save to this device's localStorage
        const currentOrdersMap = new Map<string, Preorder>();
        orders.forEach((o) => currentOrdersMap.set(o.id, o));
        matches.forEach((o) => currentOrdersMap.set(o.id, o));

        const updated = Array.from(currentOrdersMap.values()).sort((a, b) => {
          const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return timeB - timeA;
        });

        setOrders(updated);

        // Update local storage IDs
        if (typeof window !== 'undefined') {
          const ids = updated.map((o) => o.id);
          localStorage.setItem('dainty_customer_order_ids', JSON.stringify(ids));
          matches.forEach((m) => {
            localStorage.setItem(`dainty_order_${m.id}`, JSON.stringify(m));
          });
        }

        setLookupNotice(`Success! Found and linked ${matches.length} preorder(s) to this phone.`);
        setPhoneLookup('');
      } else {
        setLookupNotice('No preorders found matching that phone number or Order ID. Please check and try again.');
      }
    } catch (err) {
      console.warn('Error during order lookup:', err);
      setLookupNotice('Could not reach database. Please try again or chat with us on WhatsApp.');
    } finally {
      setLookupLoading(false);
    }
  }

  // 3. Order Again Action
  function handleOrderAgain(item: OrderItem) {
    const success = addPastItemToCart({
      productId: item.productId,
      title: item.title,
      price: item.price,
      quantity: 1,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
      selectedImage: item.selectedImage,
    });

    if (success) {
      setReorderNotice(`Added "${item.title}" to your cart!`);
      setTimeout(() => {
        router.push('/?openCart=1');
      }, 700);
    }
  }

  // 4. Callback when a review is saved
  function handleReviewSaved(review: ProductReview) {
    setSavedReviews(getAllSavedReviews());
  }

  // 5. Filtered Orders based on Tab
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const s = String(o.status || 'unpaid').toLowerCase().trim();
      const isDelivered = s === 'delivered' || !!o.delivered_at;
      const isCancelled = s === 'cancelled' || !!o.cancelled_at;
      const isUnpaid = s === 'unpaid' || s === 'pending';
      const isTransit = !isDelivered && !isCancelled && !isUnpaid;

      if (activeTab === 'delivered') return isDelivered;
      if (activeTab === 'transit') return isTransit;
      if (activeTab === 'unpaid') return isUnpaid;
      return true; // 'all'
    });
  }, [orders, activeTab]);

  // Counts for tabs
  const tabCounts = useMemo(() => {
    let transit = 0;
    let delivered = 0;
    let unpaid = 0;

    orders.forEach((o) => {
      const s = String(o.status || 'unpaid').toLowerCase().trim();
      if (s === 'delivered' || o.delivered_at) delivered++;
      else if (s === 'unpaid' || s === 'pending') unpaid++;
      else if (s !== 'cancelled' && !o.cancelled_at) transit++;
    });

    return { all: orders.length, transit, delivered, unpaid };
  }, [orders]);

  // Total items purchased
  const totalPurchasedItems = useMemo(() => {
    return orders.reduce((sum, o) => sum + (o.total_pieces || (o.items ? o.items.length : 0)), 0);
  }, [orders]);

  function getStatusBadge(order: Preorder) {
    const s = String(order.status || 'unpaid').toLowerCase().trim();
    if (order.cancelled_at || s === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-800">
          <XCircle className="h-3 w-3" />
          Cancelled
        </span>
      );
    }
    if (order.delivered_at || s === 'delivered') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-stone-900 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs">
          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          Delivered
        </span>
      );
    }
    if (order.ready_at || s === 'ready_for_delivery') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
          <Truck className="h-3 w-3 text-emerald-600" />
          Arrived in Nigeria
        </span>
      );
    }
    if (order.shipped_at || s === 'shipped') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
          {order.shipping_method === 'sea' ? <Ship className="h-3 w-3" /> : <Plane className="h-3 w-3" />}
          In Transit
        </span>
      );
    }
    if (order.china_ordered_at || s === 'ordered') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-900">
          <Package className="h-3 w-3" />
          Ordered from China
        </span>
      );
    }
    if (order.payment_date || s === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          Payment Confirmed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
        <Clock className="h-3 w-3 text-amber-600" />
        Pending Payment
      </span>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-stone-50 text-stone-900 pb-24 font-sans">
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
              alt="Zoomed product"
              className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain"
            />
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black transition"
              aria-label="Close image"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {activeReviewItem && (
        <ReviewModal
          isOpen={!!activeReviewItem}
          onClose={() => setActiveReviewItem(null)}
          orderId={activeReviewItem.orderId}
          productId={activeReviewItem.item.productId}
          productTitle={activeReviewItem.item.title}
          selectedColor={activeReviewItem.item.selectedColor}
          selectedSize={activeReviewItem.item.selectedSize}
          selectedImage={activeReviewItem.item.selectedImage}
          whatsappNumber={whatsappNumber}
          initialReview={
            savedReviews[
              getReviewKey(
                activeReviewItem.item.productId,
                activeReviewItem.orderId,
                activeReviewItem.item.selectedColor,
                activeReviewItem.item.selectedSize
              )
            ] || null
          }
          onReviewSaved={handleReviewSaved}
        />
      )}

      {/* Top Reorder Toast */}
      {reorderNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-xs font-bold text-white shadow-xl animate-fade-in border border-stone-700">
          <ShoppingBag className="h-4 w-4 text-[#fa9d26]" />
          <span>{reorderNotice}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-700 hover:text-[#fa9d26] transition active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Store</span>
          </Link>

          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Dainty Import"
              className="h-6 sm:h-7 w-auto object-contain"
            />
            <span className="text-xs sm:text-sm font-extrabold tracking-tight text-stone-900">
              Me & Orders
            </span>
          </div>

          <a
            href={
              whatsappNumber
                ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=Hello%20Dainty%20Import`
                : 'https://wa.me/?text=Hello%20Dainty%20Import'
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
            title="Chat on WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-2xl px-4 py-5 space-y-4">
        {/* Profile Card */}
        <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-stone-900 via-stone-800 to-amber-950 p-5 text-white shadow-md">
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#fa9d26] to-amber-400 text-stone-900 font-black shadow-md">
                <User className="h-7 w-7 text-white" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-amber-200/90 uppercase tracking-wider">
                  Preorder Profile
                </div>
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                  {customerName}
                </h1>
                <p className="text-[11px] text-stone-300">
                  Passwordless account • Saved on this phone
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-bold uppercase text-stone-300">Total Items</div>
              <div className="text-xl font-black text-[#fa9d26]">{totalPurchasedItems} pcs</div>
            </div>
          </div>

          {/* Quick stats grid */}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
            <div className="rounded-xl bg-white/5 p-2">
              <div className="text-[10px] text-stone-300 uppercase">Orders</div>
              <div className="text-sm font-extrabold text-white">{orders.length}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <div className="text-[10px] text-amber-300 uppercase">In Transit</div>
              <div className="text-sm font-extrabold text-[#fa9d26]">{tabCounts.transit}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <div className="text-[10px] text-emerald-300 uppercase">Delivered</div>
              <div className="text-sm font-extrabold text-emerald-400">{tabCounts.delivered}</div>
            </div>
          </div>
        </section>

        {/* Sync / Switch Phones Lookup Box */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-[#fa9d26]" />
                <span>Switching phones or missing past orders?</span>
              </h2>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Enter your WhatsApp number or Order ID to sync past orders to this phone.
              </p>
            </div>
          </div>

          <form onSubmit={handleFindOrders} className="mt-3 flex gap-2">
            <input
              type="text"
              value={phoneLookup}
              onChange={(e) => setPhoneLookup(e.target.value)}
              placeholder="e.g. 08012345678 or ORD-12345"
              className="flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs focus:border-[#fa9d26] focus:bg-white focus:outline-none transition"
            />
            <button
              type="submit"
              disabled={lookupLoading || !phoneLookup.trim()}
              className="inline-flex items-center gap-1 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50 transition active:scale-95 shrink-0"
            >
              {lookupLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              <span>Find</span>
            </button>
          </form>

          {lookupNotice && (
            <p className="mt-2 text-xs font-semibold text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200">
              {lookupNotice}
            </p>
          )}
        </section>

        {/* Tabs: All Orders, In Transit, Delivered, Unpaid */}
        <div className="flex rounded-2xl bg-stone-200/70 p-1 text-xs font-bold shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex-1 rounded-xl py-2 text-center transition ${
              activeTab === 'all'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            All ({tabCounts.all})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transit')}
            className={`flex-1 rounded-xl py-2 text-center transition ${
              activeTab === 'transit'
                ? 'bg-white text-[#b86200] shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            In Transit ({tabCounts.transit})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('delivered')}
            className={`flex-1 rounded-xl py-2 text-center transition ${
              activeTab === 'delivered'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Delivered ({tabCounts.delivered})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('unpaid')}
            className={`flex-1 rounded-xl py-2 text-center transition ${
              activeTab === 'unpaid'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Unpaid ({tabCounts.unpaid})
          </button>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-[#fa9d26]" />
            <p className="mt-3 text-xs font-medium text-stone-500">Loading your preorders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-[#fa9d26]">
              <Package className="h-7 w-7" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-stone-900">
              {activeTab === 'delivered'
                ? 'No delivered orders yet'
                : activeTab === 'transit'
                ? 'No orders currently in transit'
                : 'No preorders found on this phone'}
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-stone-500">
              {activeTab === 'all'
                ? 'Browse direct China supplier items, add to your cart, and checkout to start your first preorder.'
                : 'When an order status updates, it will automatically appear here.'}
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#fa9d26] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#e68c1d] transition active:scale-95"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Explore Products</span>
            </Link>
          </section>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const orderDate = order.created_at
                ? new Date(order.created_at).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Recently';

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs transition hover:border-stone-300"
                >
                  {/* Order Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-stone-900">
                          #{order.id}
                        </span>
                        <span className="text-[11px] text-stone-400">• {orderDate}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-500">
                        <span>{order.total_pieces || (order.items ? order.items.length : 0)} items</span>
                        <span>•</span>
                        <span className="font-bold text-stone-800">
                          ₦{Number(order.total_amount || 0).toLocaleString()}
                        </span>
                        <span>•</span>
                        <span className="uppercase text-[10px] font-bold text-stone-600">
                          {order.shipping_method || 'Air'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {getStatusBadge(order)}
                    </div>
                  </div>

                  {/* Items in this Order */}
                  <div className="divide-y divide-stone-100 py-2">
                    {(order.items || []).map((item, idx) => {
                      const reviewKey = getReviewKey(
                        item.productId,
                        order.id,
                        item.selectedColor,
                        item.selectedSize
                      );
                      const savedReview = savedReviews[reviewKey];

                      return (
                        <div
                          key={`${item.productId}-${idx}`}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3"
                        >
                          {/* Thumbnail & Title */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-stone-100 border border-stone-200">
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
                                    className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-sm bg-black/60 text-white"
                                    title="Zoom"
                                  >
                                    <Maximize2 className="h-2.5 w-2.5" />
                                  </button>
                                </>
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-stone-400">
                                  <Package className="h-6 w-6" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-stone-900 line-clamp-1">
                                {item.title}
                              </h4>
                              <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-stone-500">
                                {item.selectedColor && <span>Color: {item.selectedColor}</span>}
                                {item.selectedColor && item.selectedSize && <span>•</span>}
                                {item.selectedSize && <span>Size: {item.selectedSize}</span>}
                                <span>• Qty: {item.quantity}</span>
                              </div>
                              <div className="mt-0.5 text-xs font-black text-amber-800">
                                ₦{(Number(item.price) * Number(item.quantity)).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          {/* Individual Item Actions: Order Again & Review */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            {/* Order Again Button */}
                            <button
                              type="button"
                              onClick={() => handleOrderAgain(item)}
                              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-100 transition active:scale-95"
                              title="Add this item to cart again"
                            >
                              <ShoppingBag className="h-3 w-3 text-[#fa9d26]" />
                              <span>Order Again</span>
                            </button>

                            {/* Review Item Button */}
                            <button
                              type="button"
                              onClick={() =>
                                setActiveReviewItem({
                                  orderId: order.id,
                                  item,
                                })
                              }
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition active:scale-95 ${
                                savedReview
                                  ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                  : 'bg-stone-900 text-white hover:bg-stone-800'
                              }`}
                              title="Review this individual item"
                            >
                              <Star
                                className={`h-3 w-3 ${
                                  savedReview
                                    ? 'fill-amber-400 text-amber-500'
                                    : 'fill-white text-white'
                               }`}
                              />
                              <span>
                                {savedReview ? `${savedReview.rating}★ Reviewed` : 'Review Item'}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Order Footer Actions */}
                  <div className="mt-2 pt-2.5 border-t border-stone-100 flex items-center justify-between text-xs">
                    <Link
                      href={`/order?id=${order.id}`}
                      className="text-stone-500 hover:text-stone-900 font-semibold inline-flex items-center gap-0.5"
                    >
                      <span>View Order Details</span>
                      <ChevronRight className="h-3 w-3" />
                    </Link>

                    <Link
                      href={`/track?id=${order.id}`}
                      className="inline-flex items-center gap-1 font-bold text-[#b86200] hover:text-[#fa9d26]"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      <span>Track Shipment</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 px-4 py-2 shadow-lg">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          {/* 1. Me (where Request was) */}
          <Link
            href="/me"
            className="flex flex-col items-center gap-0.5 text-[#fa9d26] font-bold transition active:scale-95"
          >
            <User className="h-4 w-4" />
            <span className="text-[10px] font-bold">Me</span>
          </Link>

          {/* 2. Categories */}
          <Link
            href="/?categories=1"
            className="flex flex-col items-center gap-0.5 text-stone-600 hover:text-[#fa9d26] transition active:scale-95"
          >
            <Grid className="h-4 w-4" />
            <span className="text-[10px] font-bold">Categories</span>
          </Link>

          {/* 3. Shop */}
          <Link
            href="/"
            className="flex flex-col items-center gap-0.5 text-stone-600 hover:text-[#fa9d26] transition active:scale-95"
          >
            <Home className="h-4 w-4" />
            <span className="text-[10px] font-bold">Shop</span>
          </Link>

          {/* 4. Request (where Track was, Track is now under Me) */}
          <Link
            href="/?request=1"
            className="flex flex-col items-center gap-0.5 text-stone-600 hover:text-[#fa9d26] transition active:scale-95"
          >
            <PackagePlus className="h-4 w-4 text-[#fa9d26]" />
            <span className="text-[10px] font-bold">Request</span>
          </Link>

          {/* 5. Cart */}
          <Link
            href="/?openCart=1"
            className="relative flex flex-col items-center gap-0.5 text-stone-900 hover:text-[#fa9d26] transition active:scale-95"
          >
            <ShoppingBag className="h-4 w-4 text-[#fa9d26]" />
            <span className="text-[10px] font-bold">Cart</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
