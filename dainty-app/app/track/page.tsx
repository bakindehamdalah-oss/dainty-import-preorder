'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { AlertCircle, AlertTriangle, ArrowLeft, Calendar, CheckCircle2, Clock, ExternalLink, Grid, Home, Maximize2, MessageCircle, Package, PackagePlus, Plane, Search, Share2, Ship, ShoppingBag, Sparkles, Star, Truck, User, X, XCircle } from 'lucide-react';
import ReviewModal from '../components/ReviewModal';
import { addPastItemToCart, getAllSavedReviews, getReviewKey, ProductReview } from '../../lib/reviews';

type OrderItem = {
  productId: string;
  title: string;
  price: number;
  quantity: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
  selectedImage?: string | null;
};

type Preorder = {
  id: string;
  items: OrderItem[];
  total_pieces: number;
  total_amount: number;
  shipping_method?: 'air' | 'sea';
  est_shipping_fee?: number;
  final_shipping_fee?: number;
  shipping_batch?: string | null;
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

const statusOrder = ['pending', 'paid', 'ordered', 'shipped', 'waiting_for_clearance', 'ready_for_delivery', 'delivered'];

export default function TrackOrderPage() {
  const [trackingInput, setTrackingInput] = useState(() => {
    if (typeof window !== 'undefined') {
      const id = new URLSearchParams(window.location.search).get('id') || new URLSearchParams(window.location.search).get('order') || new URLSearchParams(window.location.search).get('track');
      return id ? id.trim().replace(/^#/, '') : '';
    }
    return '';
  });
  const [order, setOrder] = useState<Preorder | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeReviewItem, setActiveReviewItem] = useState<{ orderId: string; item: OrderItem } | null>(null);
  const [savedReviews, setSavedReviews] = useState<Record<string, ProductReview>>({});
  const [reorderNotice, setReorderNotice] = useState<string | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);

  useEffect(() => {
    setSavedReviews(getAllSavedReviews());
    async function fetchStoreSettings() {
      try {
        const { data } = await supabase.from('store_settings').select('whatsapp_number').eq('id', 1).maybeSingle();
        if (data?.whatsapp_number) setWhatsappNumber(data.whatsapp_number);
      } catch (e) {
        console.warn('Failed to load whatsapp number in track page:', e);
      }
    }
    void fetchStoreSettings();
  }, []);

  function handleOrderAgain(item: OrderItem) {
    const success = addPastItemToCart({
      productId: item.productId,
      title: item.title,
      price: item.price,
      quantity: item.quantity || 1,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
      selectedImage: item.selectedImage,
    });
    if (success) {
      setReorderNotice(`Added "${item.title}" to your cart!`);
      setTimeout(() => {
        window.location.href = '/?openCart=1';
      }, 700);
    }
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id') || new URLSearchParams(window.location.search).get('order') || new URLSearchParams(window.location.search).get('track');
    if (id) {
      const cleanId = id.trim().replace(/^#/, '');
      void loadOrder(cleanId);
    }
  }, []);

  async function loadOrder(rawId: string) {
    const id = rawId.trim().replace(/^#/, '');
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);
    setOrder(null);
    try {
      const { data, error } = await supabase.from('preorders').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (data) {
        setOrder(data as Preorder);
      } else {
        setErrorMsg(`No preorder found with Tracking ID “${id}”. Please check the order number and try again.`);
      }
    } catch (error) {
      console.error('Unable to load preorder tracking record:', error);
      setErrorMsg('We could not load this order right now. Please check the tracking ID or try again shortly.');
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = trackingInput.trim().replace(/^#/, '');
    if (!id) return;
    window.history.replaceState(null, '', `/track?id=${encodeURIComponent(id)}`);
    void loadOrder(id);
  }

  async function copyTrackingLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  }

  const status = order?.status || 'pending';
  const delayed = Boolean(order?.is_delayed) || status === 'delayed';
  const cancelled = status === 'cancelled';
  const arrival = useMemo(() => {
    if (!order) return null;
    const from = order.shipped_at || order.china_ordered_at || order.payment_date || order.created_at;
    const date = from ? new Date(from) : new Date('2026-11-27T00:00:00.000Z');
    if (order.shipping_method === 'sea') date.setMonth(date.getMonth() + 3);
    else date.setDate(date.getDate() + 21);
    return date.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }, [order]);



  const steps = [
    { id: 'pending', label: 'Preorder placed', date: order?.created_at, icon: Clock },
    { id: 'paid', label: 'Payment confirmed', date: order?.payment_date, icon: CheckCircle2 },
    { id: 'ordered', label: 'Ordered from China', date: order?.china_ordered_at, icon: Package },
    { id: 'shipped', label: delayed ? 'Shipped (delayed)' : 'Shipped / in transit', date: order?.shipped_at, icon: order?.shipping_method === 'sea' ? Ship : Plane },
    { id: 'waiting_for_clearance', label: 'Waiting for clearance (Pay shipping)', date: order?.ready_at, icon: Clock },
    { id: 'ready_for_delivery', label: 'Cleared & ready for delivery', date: order?.ready_at, icon: Truck },
    { id: 'delivered', label: 'Delivered', date: order?.delivered_at, icon: CheckCircle2 },
  ];
  const currentStep = status === 'delayed' ? 3 : statusOrder.indexOf(status);
  const maskedPhone = order?.customer_phone
    ? `${order.customer_phone.slice(0, 3)}••••${order.customer_phone.slice(-2)}`
    : 'Not provided';

  return (
    <div className="min-h-screen bg-stone-50 pb-12 text-stone-900">
      {zoomedImage && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomedImage(null)}><img src={zoomedImage} alt="Order item" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" /><button className="absolute right-5 top-5 rounded-full bg-white p-2" onClick={() => setZoomedImage(null)} aria-label="Close image"><X className="h-5 w-5" /></button></div>}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
          <Link href="/" className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600"><ArrowLeft className="h-4 w-4" />Storefront</Link>
          <div className="flex items-center gap-2"><img src="/logo.png" alt="Dainty Import" className="h-7 w-auto" /><span className="text-xs font-bold">Customer Tracking</span></div>
          <div className="flex items-center gap-1.5">
            <a
              href={order ? `https://wa.me/?text=${encodeURIComponent(`Hello Dainty Import, I have a question about my tracking order #${order.id}.`)}` : 'https://wa.me/?text=Hello%20Dainty%20Import'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
              title="Chat on WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
              <span>WhatsApp</span>
            </a>
            {order && (
              <button onClick={copyTrackingLink} className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-semibold">
                <Share2 className="h-3.5 w-3.5" />
                {copiedLink ? 'Copied!' : 'Share'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <form onSubmit={onSubmit} className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wide text-stone-700">Track your preorder</label>
            <p className="text-xs text-stone-500">Your order number is your tracking ID.</p>
            <div className="flex gap-2">
              <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" /><input value={trackingInput} onChange={e => setTrackingInput(e.target.value)} placeholder="Enter order number, e.g. ORD-12345" className="w-full rounded-xl border border-stone-300 bg-stone-50 py-2 pl-9 pr-3 text-sm focus:border-[#fa9d26] focus:outline-none" /></div>
              <button disabled={loading} className="rounded-xl bg-[#fa9d26] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{loading ? 'Checking…' : 'Track Order'}</button>
            </div>
          </form>
        </section>

        {loading && <div className="py-12 text-center text-sm text-stone-500">Loading order tracking…</div>}
        {errorMsg && !loading && <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center"><AlertCircle className="mx-auto mb-2 h-7 w-7 text-red-600" /><p className="text-sm font-semibold text-red-800">{errorMsg}</p></section>}

        {order && !loading && <div className="space-y-5">
          {cancelled && <section className="rounded-2xl border border-red-300 bg-red-50 p-4"><div className="flex items-center gap-2 font-bold text-red-800"><XCircle className="h-5 w-5" />Order cancelled</div><p className="mt-1 text-xs text-red-700">Tracking ID #{order.id} has been cancelled.</p></section>}
          {delayed && !cancelled && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4"><div className="flex items-center gap-2 font-extrabold text-amber-900"><AlertTriangle className="h-5 w-5 text-amber-600" />Shipment delayed</div><p className="mt-2 text-sm text-amber-900">{order.delay_reason || 'This shipment is delayed. We are following up and will share an update when available.'}</p>{order.revised_arrival_date && <p className="mt-2 text-xs font-bold text-amber-900">Revised estimated arrival: {order.revised_arrival_date}</p>}</section>}

          <section className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-2 border-b border-stone-100 pb-4 sm:flex-row sm:items-center">
              <div><p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Customer Tracking ID</p><h1 className="font-mono text-xl font-extrabold">#{order.id}</h1><p className="text-xs text-stone-500">Order placed {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'recently'}</p></div>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${cancelled ? 'bg-red-100 text-red-800' : delayed ? 'bg-amber-100 text-amber-900' : status === 'waiting_for_clearance' ? 'bg-amber-100 text-amber-900 border border-amber-300' : status === 'delivered' ? 'bg-stone-900 text-white' : 'bg-amber-100 text-amber-900'}`}>{cancelled ? 'Cancelled' : delayed ? 'Delayed in transit' : status === 'waiting_for_clearance' ? 'Waiting for clearance' : status === 'ready_for_delivery' ? 'Ready for delivery' : status === 'pending' ? 'Pending payment' : status.replaceAll('_', ' ')}</span>
            </div>

            {!cancelled && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[#fa9d26] p-2 text-white">
                  {order.shipping_method === 'sea' ? <Ship className="h-5 w-5" /> : <Plane className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Estimated arrival in Nigeria</p>
                  <p className="mt-0.5 text-lg font-extrabold">{order.revised_arrival_date || arrival}</p>
                  <p className="text-xs text-stone-600">
                    {order.shipping_method === 'sea'
                      ? 'Sea Cargo: Approximately 3 months from dispatch.'
                      : 'Air Cargo: Approximately 3 weeks from dispatch.'}
                  </p>
                </div>
                <span className="text-xs font-bold uppercase text-stone-700">{order.shipping_method === 'sea' ? 'Sea' : 'Air'}</span>
              </div>
            </div>}

            {!cancelled && status === 'waiting_for_clearance' && (
              <div className="rounded-2xl border-2 border-[#fa9d26] bg-amber-50/80 p-5 shadow-xs space-y-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-[#fa9d26] p-2.5 text-white shrink-0 mt-0.5">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900">
                        Action Required
                      </span>
                      <span className="text-xs font-bold text-amber-950">Arrived in Nigeria</span>
                    </div>
                    <h3 className="text-base font-extrabold text-stone-900">
                      Waiting for Clearance — Pay Shipping Fee
                    </h3>
                    <p className="text-xs text-stone-700 leading-relaxed">
                      Your shipment has arrived in Nigeria and is currently waiting for clearance from our shipping company. <strong>Shipping fee has to be paid for us to be able to clear it from our shipping company.</strong>
                    </p>
                    <p className="text-xs text-stone-700 leading-relaxed">
                      Confirmed shipping fees must be settled within <strong>7 days</strong> of notification so we can clear your goods from the shipping company and dispatch your order.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white border border-amber-200 p-3.5 shadow-2xs">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">Confirmed Shipping Fee</span>
                        <span className="text-lg font-black text-[#b86200]">
                          ₦{Number(order.final_shipping_fee || order.est_shipping_fee || 0).toLocaleString()}
                        </span>
                      </div>

                      <a
                        href={`https://wa.me/${whatsappNumber ? whatsappNumber.replace(/[^0-9]/g, '') : ''}?text=${encodeURIComponent(
                          `Hello Dainty Import, I would like to pay my shipping fee for Order #${order.id} (Waiting for clearance).`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs active:scale-95"
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span>Pay Shipping Fee on WhatsApp</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!cancelled && <div className="space-y-3"><h2 className="text-xs font-bold uppercase tracking-wide">Order progress</h2><div className="space-y-4">{steps.map((step, index) => {const Icon = step.icon; const done = currentStep >= index; return <div key={step.id} className="flex gap-3"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? delayed && index === 3 ? 'bg-amber-500 text-white' : 'bg-[#fa9d26] text-white' : 'border border-stone-300 text-stone-400'}`}><Icon className="h-4 w-4" /></div><div className="flex-1"><div className="flex flex-wrap justify-between gap-1"><p className={`text-sm font-bold ${done ? 'text-stone-900' : 'text-stone-400'}`}>{step.label}</p>{step.date && done && <span className="text-[11px] text-stone-400">{new Date(step.date).toLocaleDateString()}</span>}</div>{step.id === 'shipped' && delayed && order.delay_reason && <p className="mt-1 text-xs text-amber-800">{order.delay_reason}</p>}</div></div>})}</div></div>}
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="mb-3 flex items-center gap-2 border-b border-stone-100 pb-3 text-xs font-bold uppercase tracking-wide"><User className="h-4 w-4 text-[#fa9d26]" />Customer information</h2><div className="grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-[10px] font-bold uppercase text-stone-400">Name</p><p className="font-semibold">{order.customer_name || 'Not provided'}</p></div><div><p className="text-[10px] font-bold uppercase text-stone-400">Phone / WhatsApp</p><p>{maskedPhone}</p></div><div><p className="text-[10px] font-bold uppercase text-stone-400">Delivery address</p><p>{order.customer_city || (order.customer_address ? 'Address on file (shown privately by the admin)' : 'To be confirmed')}</p></div></div></section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div className="mb-2 flex items-center justify-between border-b border-stone-100 pb-3"><h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide"><ShoppingBag className="h-4 w-4 text-[#fa9d26]" />Full order ({order.total_pieces || 0} pcs)</h2><Link href={`/order?id=${order.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-amber-800">View order <ExternalLink className="h-3 w-3" /></Link></div>
            <div className="divide-y divide-stone-100">{(order.items || []).map((item, i) => {
              const reviewKey = getReviewKey(item.productId, order.id, item.selectedColor, item.selectedSize);
              const savedReview = savedReviews[reviewKey];
              return (
                <div key={`${item.productId}-${i}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.selectedImage ? (
                      <button onClick={() => setZoomedImage(item.selectedImage || null)} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-stone-200">
                        <img src={item.selectedImage} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-stone-100"><Package className="h-5 w-5 text-stone-400" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-stone-900 line-clamp-1">{item.title}</p>
                      <p className="text-xs text-stone-500">{item.selectedColor ? `Color: ${item.selectedColor} · ` : ''}{item.selectedSize ? `Size: ${item.selectedSize} · ` : ''}Qty: {item.quantity}</p>
                      <p className="text-xs font-black text-amber-800 mt-0.5">₦{(Number(item.price) * Number(item.quantity)).toLocaleString()}</p>
                    </div>
                  </div>
                  {status === 'delivered' || !!order.delivered_at ? (
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleOrderAgain(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100 transition active:scale-95"
                      >
                        <ShoppingBag className="h-3 w-3 text-[#fa9d26]" />
                        <span>Order Again</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveReviewItem({ orderId: order.id, item })}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition active:scale-95 ${savedReview ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-stone-900 text-white hover:bg-stone-800'}`}
                      >
                        <Star className={`h-3 w-3 ${savedReview ? 'fill-amber-400 text-amber-500' : 'fill-white text-white'}`} />
                        <span>{savedReview ? `${savedReview.rating}★ Reviewed` : 'Review Item'}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}</div>
            <div className="mt-3 space-y-2 rounded-xl bg-stone-50 p-3 text-xs"><div className="flex justify-between"><span>Product total</span><strong>₦{Number(order.total_amount || 0).toLocaleString()}</strong></div><div className="flex justify-between"><span>Estimated {order.shipping_method === 'sea' ? 'sea' : 'air'} shipping</span><strong>₦{Number(order.est_shipping_fee || 0).toLocaleString()}</strong></div>{order.final_shipping_fee != null && <div className="flex justify-between border-t border-stone-200 pt-2 font-bold text-purple-800"><span>Confirmed shipping</span><strong>₦{Number(order.final_shipping_fee).toLocaleString()}</strong></div>}</div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 text-xs text-stone-600"><h2 className="mb-2 flex items-center gap-2 font-bold text-stone-900"><Sparkles className="h-4 w-4 text-[#fa9d26]" />China Sourcing & Preorder Terms</h2><ul className="list-disc space-y-1 pl-4"><li>The initial payment covers the buying price of the item.</li><li>Estimated shipping fee is shown, but the exact shipping cost will be given when the shipment arrives in Nigeria.</li><li>Shipping fee is confirmed and paid separately when your goods arrive in Nigeria. <strong>Shipping fee has to be paid for us to be able to clear it from our shipping company.</strong></li><li>Confirmed shipping fees must be settled within 7 days of notification to allow clearance.</li></ul></section>
        </div>}
      </main>

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
          onReviewSaved={() => setSavedReviews(getAllSavedReviews())}
        />
      )}

      {/* Reorder Notification Toast */}
      {reorderNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-xs font-bold text-white shadow-xl animate-fade-in border border-stone-700">
          <ShoppingBag className="h-4 w-4 text-[#fa9d26]" />
          <span>{reorderNotice}</span>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 px-4 py-2 shadow-lg">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          <Link href="/me" className="flex flex-col items-center gap-0.5 text-[#fa9d26] font-bold transition active:scale-95">
            <User className="h-4 w-4" />
            <span className="text-[10px] font-bold">My Account</span>
          </Link>
          <Link href="/?categories=1" className="flex flex-col items-center gap-0.5 text-stone-600 hover:text-[#fa9d26] transition active:scale-95">
            <Grid className="h-4 w-4" />
            <span className="text-[10px] font-bold">Categories</span>
          </Link>
          <Link href="/" className="flex flex-col items-center gap-0.5 text-stone-600 hover:text-[#fa9d26] transition active:scale-95">
            <Home className="h-4 w-4" />
            <span className="text-[10px] font-bold">Shop</span>
          </Link>
          <Link href="/?request=1" className="flex flex-col items-center gap-0.5 text-stone-600 hover:text-[#fa9d26] transition active:scale-95">
            <PackagePlus className="h-4 w-4 text-[#fa9d26]" />
            <span className="text-[10px] font-bold">Request</span>
          </Link>
          <Link href="/?openCart=1" className="flex flex-col items-center gap-0.5 text-stone-900 hover:text-[#fa9d26] transition active:scale-95">
            <ShoppingBag className="h-4 w-4 text-[#fa9d26]" />
            <span className="text-[10px] font-bold">Cart</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
