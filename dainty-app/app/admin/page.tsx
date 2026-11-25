'use client';

import { ChangeEvent, FormEvent, useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Upload, Trash2, Plus, LogOut, Check, FolderPlus, RefreshCw, X, ShieldAlert, Sparkles, Layers, Image as ImageIcon, Ship, Plane, Tag, Box, Package, Info, Pencil, Save, Settings, Phone, Search, Sliders, Edit2, CheckSquare, ExternalLink, User, UserPlus, MapPin, Truck, CheckCircle2, Clock, CreditCard, MessageCircle, AlertCircle, ChevronRight, Eye } from 'lucide-react';

type Category = {
  id: string;
  name: string;
  slug: string;
  wholesale_moq?: number;
  moq_scope?: 'category' | 'item';
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
  moq_scope?: 'category' | 'item' | null;
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


export type Customer = {
  id: string;
  name: string;
  phone: string;
  whatsapp?: string;
  delivery_address?: string;
  state_city?: string;
  instagram_handle?: string;
  notes?: string;
  created_at?: string;
};

type EditProductState = {
  id: string;
  name: string;
  categoryId: string;
  retailPrice: string;
  wholesalePrice: string;
  moq: string;
  moqScope: 'category' | 'item';
  estAirShipping: string;
  estSeaShipping: string;
  size: string;
  colors: string;
  description: string;
  imageUrl: string;
  images: string[];
};

type EditCategoryState = {
  id: string;
  name: string;
  wholesale_moq: string;
  moq_scope: 'category' | 'item';
};

type PreorderAdminRecord = {
  id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  china_order_ref?: string | null;
  china_tracking_ref?: string | null;
  items?: {
    productId?: string;
    product_id?: string;
    name?: string;
    title?: string;
    quantity?: number;
    price?: number;
    selectedColor?: string | null;
    selectedSize?: string | null;
    selectedImage?: string | null;
    estShippingAir?: number;
    estShippingSea?: number;
  }[];
  total_pieces?: number;
  total_amount?: number;
  mode?: 'wholesale' | 'retail';
  shipping_method?: 'air' | 'sea';
  est_shipping_fee?: number;
  final_shipping_fee?: number;
  shipping_timeline?: string;
  admin_notes?: string;
  created_at?: string;
  status?: string;
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
  moqScope: 'category' | 'item';
  description: string;
};


// Resolve each shipping method independently; never treat a generic fee as an Air or Sea rate.
function getProductShippingFees(p: {
  est_shipping_fee?: number | null;
  est_shipping_fee_air?: number | null;
  est_shipping_fee_sea?: number | null;
  description?: string | null;
}): { air: number; sea: number } {
  if (p.description) {
    const airMatch = p.description.match(/<!--dainty_ship_air:([0-9]+(?:\.[0-9]+)?)-->/);
    const seaMatch = p.description.match(/<!--dainty_ship_sea:([0-9]+(?:\.[0-9]+)?)-->/);
    if (airMatch !== null || seaMatch !== null) {
      return {
        air: airMatch ? Number(airMatch[1]) : 0,
        sea: seaMatch ? Number(seaMatch[1]) : 0,
      };
    }
  }

  const hasAir = p.est_shipping_fee_air !== undefined && p.est_shipping_fee_air !== null;
  const hasSea = p.est_shipping_fee_sea !== undefined && p.est_shipping_fee_sea !== null;
  return {
    air: hasAir && Number(p.est_shipping_fee_air) > 0 ? Number(p.est_shipping_fee_air) : 0,
    sea: hasSea && Number(p.est_shipping_fee_sea) > 0 ? Number(p.est_shipping_fee_sea) : 0,
  };
}

function cleanProductDescription(description?: string | null): string {
  return (description || '')
    .replace(/<!--dainty_[\s\S]*?-->/g, '')
    .replace(/(?:^|\s*[•|]\s*)(?:sizes?|models?):\s*[^•\n]*/gi, '')
    .replace(/(?:^|\s*[•|]\s*)colors?:\s*[^•\n]*/gi, '')
    .replace(/(?:^|\s*[•|]\s*)shipping:\s*(?:sea|air)\s+cargo\s+only/gi, '')
    .replace(/(?:\s*•\s*){2,}/g, ' • ')
    .replace(/^\s*•\s*|\s*•\s*$/g, '')
    .trim();
}

function getDescriptionList(description: string | null | undefined, field: 'sizes' | 'colors'): string[] {
  if (!description) return [];
  const match = description.match(new RegExp(`<!--dainty_${field}:(.*?)-->`));
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      // Fall back to legacy inline specs below.
    }
  }
  const label = field === 'sizes' ? '(?:sizes?|models?)' : 'colors?';
  const legacy = description.match(new RegExp(`${label}:\\s*([^•\\n]+)`, 'i'));
  return legacy?.[1]
    ? legacy[1].split(/[,/|;]+/).map((item) => item.trim()).filter(Boolean)
    : [];
}

function getProductAllImages(product: Product | null | undefined): string[] {
  if (!product) return [];
  const list: string[] = [];

  const add = (url: unknown) => {
    if (typeof url === 'string') {
      const clean = url.trim();
      if (clean && !list.includes(clean)) list.push(clean);
    }
  };

  add(product.image_url);

  if (Array.isArray(product.images)) {
    for (const img of product.images) add(img);
  } else if (typeof product.images === 'string') {
    try {
      const parsed = JSON.parse(product.images);
      if (Array.isArray(parsed)) {
        for (const img of parsed) add(img);
      } else {
        add(product.images);
      }
    } catch {
      for (const part of (product.images as string).split(',')) {
        add(part);
      }
    }
  }

  if (product.description && product.description.includes('<!--dainty_images:')) {
    try {
      const match = product.description.match(/<!--dainty_images:(.*?)-->/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          for (const img of parsed) add(img);
        }
      }
    } catch {}
  }

  return list;
}

function cleanFileTitle(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateCustomerId(): string {
  return 'CUST-' + Math.random().toString(36).substring(2, 7).toUpperCase();
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

  // Editing published products
  const [editingProduct, setEditingProduct] = useState<EditProductState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingEditPhoto, setUploadingEditPhoto] = useState(false);

  // Editing categories
  const [editingCategory, setEditingCategory] = useState<EditCategoryState | null>(null);
  const [preorders, setPreorders] = useState<PreorderAdminRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [adminActiveTab, setAdminActiveTab] = useState<'upload' | 'published' | 'inventory'>(() => {
    if (typeof window !== 'undefined') {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'upload' || tabParam === 'published' || tabParam === 'inventory') {
        return tabParam;
      }
    }
    return 'upload';
  });
  const [adminActiveSubTab, setAdminActiveSubTab] = useState<'pipeline' | 'customers'>('pipeline');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderCustomerFilter, setOrderCustomerFilter] = useState<string>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');

  // Customer Modal & Assignment
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [assigningToOrderId, setAssigningToOrderId] = useState<string | null>(null);
  const [custFormName, setCustFormName] = useState('');
  const [custFormPhone, setCustFormPhone] = useState('');
  const [custFormAddress, setCustFormAddress] = useState('');
  const [custFormCity, setCustFormCity] = useState('');
  const [custFormInstagram, setCustFormInstagram] = useState('');
  const [custFormNotes, setCustFormNotes] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [editingOrderDetailsId, setEditingOrderDetailsId] = useState<string | null>(null);
  const [editChinaRef, setEditChinaRef] = useState('');
  const [editFinalShipping, setEditFinalShipping] = useState('');
  const [savingCategoryEdit, setSavingCategoryEdit] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);

  // Store WhatsApp settings
  const [storeWhatsapp, setStoreWhatsapp] = useState('');
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // Search & filter in published products
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('all');


  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catMoq, setCatMoq] = useState('');
  const [catMoqScope, setCatMoqScope] = useState<'category' | 'item'>('item');
  const [uploadingItemPhotoId, setUploadingItemPhotoId] = useState<string | null>(null);
  const [managingPhotosProductId, setManagingPhotosProductId] = useState<string | null>(null);
  const [uploadingExistingPhotoId, setUploadingExistingPhotoId] = useState<string | null>(null);
  const [savingCat, setSavingCat] = useState(false);
  const [applyingCategoryMoq, setApplyingCategoryMoq] = useState(false);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dainty_admin_selected_cat_id') || '';
    }
    return '';
  });
  const selectedCatIdRef = useRef<string>(selectedCategoryId);

  useEffect(() => {
    selectedCatIdRef.current = selectedCategoryId;
  }, [selectedCategoryId]);

  function handleSelectCategory(catId: string) {
    selectedCatIdRef.current = catId;
    setSelectedCategoryId(catId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dainty_admin_selected_cat_id', catId);
    }
  }
  const [draftItems, setDraftItems] = useState<DraftPhotoItem[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);

  // Upload mode: single product with multiple colors/photos OR separate products
  const [uploadMode, setUploadMode] = useState<'single_product' | 'separate'>('single_product');

  // "Same specifications, prices and everything" batch mode
  const [sameForAll, setSameForAll] = useState(true);
  const [sharedBaseName, setSharedBaseName] = useState('');
  const [sharedSize, setSharedSize] = useState('');
  const [sharedColors, setSharedColors] = useState('');
  const [sharedRetail, setSharedRetail] = useState('');
  const [sharedWholesale, setSharedWholesale] = useState('');
  const [sharedMoq, setSharedMoq] = useState('');
  const [sharedMoqScope, setSharedMoqScope] = useState<'category' | 'item'>('item');
  const [sharedAirShipping, setSharedAirShipping] = useState('');
  const [sharedSeaShipping, setSharedSeaShipping] = useState('');
  const [sharedDescription, setSharedDescription] = useState('');

  // Auto-sync MOQ and scope from selected category
  useEffect(() => {
    if (!selectedCategoryId) return;
    const selCat = categories.find((c) => c.id === selectedCategoryId);
    if (selCat) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('dainty_admin_selected_cat_id', selCat.id);
      }
      const catNameLower = (selCat.name || '').toLowerCase();
      const isIphoneCat = catNameLower.includes('iphone') || (catNameLower.includes('case') && !catNameLower.includes('briefcase') && !catNameLower.includes('suitcase'));
      const isCategoryMoq = selCat.moq_scope === 'category' || isIphoneCat;
      const targetScope = isCategoryMoq ? 'category' : 'item';
      const targetMoq = isIphoneCat ? '50' : (isCategoryMoq ? String(Number(selCat.wholesale_moq) > 0 ? selCat.wholesale_moq : '') : '');
      const timer = setTimeout(() => {
        setSharedMoqScope(targetScope);
        setSharedMoq(targetMoq);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [selectedCategoryId, categories]);

  async function refreshData() {
    setErrorMsg(null);
    const [catsRes, prodsRes, settingsRes] = await Promise.all([
      supabase.from('categories').select('*').order('name', { ascending: true }),
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
    ]);

    if (settingsRes.data?.whatsapp_number) {
      setStoreWhatsapp(settingsRes.data.whatsapp_number);
    }

    try {
      const preordersRes = await supabase
        .from('preorders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (preordersRes.data) {
        setPreorders(preordersRes.data);
      }

      try {
        const custRes = await supabase
          .from('customers')
          .select('*')
          .order('name', { ascending: true });
        if (custRes.data && custRes.data.length > 0) {
          setCustomers(custRes.data);
        } else {
          const saved = typeof window !== 'undefined' ? localStorage.getItem('dainty_admin_customers') : null;
          if (saved) setCustomers(JSON.parse(saved));
        }
      } catch (custErr) {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('dainty_admin_customers') : null;
        if (saved) setCustomers(JSON.parse(saved));
      }
    } catch (err) {
      console.warn('Could not load preorders in admin:', err);
    }

    if (catsRes.error || prodsRes.error) {
      setErrorMsg(
        catsRes.error?.message || prodsRes.error?.message || 'Failed to load store data.'
      );
    } else {
      const loadedCats: Category[] = (catsRes.data || []).map((c) => {
        const n = (c.name || c.slug || '').toLowerCase();
        if (n.includes('iphone') || (n.includes('case') && !n.includes('briefcase') && !n.includes('suitcase'))) {
          return { ...c, wholesale_moq: 50, moq_scope: 'category' as const };
        }
        return c;
      });

      // Synchronize Supabase so iPhone cases category permanently holds 50 pcs MOQ
      const iphoneCatRecord = loadedCats.find((c) => {
        const n = (c.name || c.slug || '').toLowerCase();
        return n.includes('iphone') || (n.includes('case') && !n.includes('briefcase') && !n.includes('suitcase'));
      });
      if (iphoneCatRecord) {
        supabase
          .from('categories')
          .update({ wholesale_moq: 50, moq_scope: 'category' })
          .eq('id', iphoneCatRecord.id)
          .then(() => {
            supabase
              .from('products')
              .update({ wholesale_moq: 50, min_order_qty: 50, moq_scope: 'category' })
              .eq('category_id', iphoneCatRecord.id);
          });
      }

      setCategories(loadedCats);
      setProducts(prodsRes.data || []);

      const currentSelected = selectedCatIdRef.current || (typeof window !== 'undefined' ? localStorage.getItem('dainty_admin_selected_cat_id') : '');
      if (currentSelected && loadedCats.some((c) => c.id === currentSelected)) {
        selectedCatIdRef.current = currentSelected;
        setSelectedCategoryId(currentSelected);
      } else if (loadedCats.length > 0) {
        selectedCatIdRef.current = loadedCats[0].id;
        setSelectedCategoryId(loadedCats[0].id);
        if (typeof window !== 'undefined') {
          localStorage.setItem('dainty_admin_selected_cat_id', loadedCats[0].id);
        }
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

  // =========================================================
  // CUSTOMER MANAGEMENT & ORDER STATUS PIPELINE HANDLERS
  // =========================================================
  async function handleSaveCustomer(e: FormEvent) {
    e.preventDefault();
    if (!custFormName.trim() || !custFormPhone.trim()) {
      alert('Please enter at least the customer name and phone number.');
      return;
    }
    setSavingCustomer(true);
    const newId = generateCustomerId();
    const newCustomer: Customer = {
      id: newId,
      name: custFormName.trim(),
      phone: custFormPhone.trim(),
      whatsapp: custFormPhone.trim(),
      delivery_address: custFormAddress.trim() || undefined,
      state_city: custFormCity.trim() || undefined,
      instagram_handle: custFormInstagram.trim() || undefined,
      notes: custFormNotes.trim() || undefined,
      created_at: new Date().toISOString(),
    };

    const updatedList = [newCustomer, ...customers.filter(c => c.phone !== newCustomer.phone)];
    setCustomers(updatedList);
    try {
      localStorage.setItem('dainty_admin_customers', JSON.stringify(updatedList));
    } catch (err) {
      console.warn('LocalStorage customer save error:', err);
    }

    try {
      await supabase.from('customers').upsert([newCustomer]);
    } catch (err) {
      console.warn('Supabase customers table notice:', err);
    }

    // If modal was opened to assign to an active order:
    if (assigningToOrderId) {
      await handleAssignCustomerToOrder(assigningToOrderId, newCustomer);
    }

    setSavingCustomer(false);
    setShowCustomerModal(false);
    setAssigningToOrderId(null);
    setCustFormName('');
    setCustFormPhone('');
    setCustFormAddress('');
    setCustFormCity('');
    setCustFormInstagram('');
    setCustFormNotes('');
  }

  async function handleAssignCustomerToOrder(orderId: string, customer: Customer | null) {
    const updatePayload = customer
      ? {
          customer_id: customer.id,
          customer_name: customer.name,
          customer_phone: customer.phone,
          customer_address: customer.delivery_address || '',
          customer_city: customer.state_city || '',
        }
      : {
          customer_id: null,
          customer_name: null,
          customer_phone: null,
          customer_address: null,
          customer_city: null,
        };

    setPreorders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, ...updatePayload } : o))
    );

    try {
      await supabase.from('preorders').update(updatePayload).eq('id', orderId);
    } catch (err) {
      console.warn('Supabase preorders update notice:', err);
    }
  }

  async function handleUpdateOrderStatus(
    orderId: string,
    newStatus: string,
    extraFields?: Record<string, unknown>
  ) {
    setUpdatingOrderId(orderId);
    const timeNow = new Date().toISOString();
    const statusTimestamps: Record<string, unknown> = {};
    if (newStatus === 'paid') statusTimestamps.payment_date = timeNow;
    if (newStatus === 'ordered') statusTimestamps.china_ordered_at = timeNow;
    if (newStatus === 'shipped') statusTimestamps.shipped_at = timeNow;
    if (newStatus === 'ready_for_delivery') statusTimestamps.ready_at = timeNow;
    if (newStatus === 'delivered') statusTimestamps.delivered_at = timeNow;
    if (newStatus === 'cancelled') statusTimestamps.cancelled_at = timeNow;

    const fullPayload = {
      status: newStatus,
      ...statusTimestamps,
      ...(extraFields || {}),
    };
    const originalOrder = preorders.find((o) => o.id === orderId);

    setPreorders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, ...fullPayload } : o))
    );

    try {
      const { error } = await supabase.from('preorders').update(fullPayload).eq('id', orderId);
      if (error) {
        console.warn('Supabase update order status error:', error);
        if (originalOrder) setPreorders((prev) => prev.map((o) => o.id === orderId ? originalOrder : o));
        setErrorMsg(`Could not save this order update: ${error.message}`);
      }
    } catch (err) {
      console.warn('Supabase update order status error:', err);
      if (originalOrder) setPreorders((prev) => prev.map((o) => o.id === orderId ? originalOrder : o));
      setErrorMsg('Could not save this order update. Please check your connection and database columns.');
    } finally {
      setUpdatingOrderId(null);
    }
  }

  function handleSendCustomerWhatsAppUpdate(order: PreorderAdminRecord) {
    const phone = ((order.customer_phone as string) || '').replace(/[^0-9]/g, '');
    const name = (order.customer_name as string) || 'Customer';
    const status = (order.status as string) || 'pending';
    const pieces = Number(order.total_pieces) || ((order.items as unknown[])?.length || 0);
    const amount = Number(order.total_amount || 0).toLocaleString();
    const finalShip = order.final_shipping_fee ? Number(order.final_shipping_fee).toLocaleString() : null;
    const estShip = order.est_shipping_fee ? Number(order.est_shipping_fee).toLocaleString() : '0';

    let message = '';
    if (status === 'paid') {
      message = `*DAINTY IMPORT - PREORDER PAYMENT CONFIRMED*\n\n` +
        `Hello ${name}!\n` +
        `We have received your payment of ₦${amount} for Preorder *#${order.id}* (${pieces} pcs).\n\n` +
        `Next Step: We are processing and placing the order with our China supplier now!\n\n` +
        `View your order catalog here: https://${typeof window !== 'undefined' ? window.location.host : ''}/order?id=${order.id}\n\n` +
        `Thank you for choosing Dainty Import!`;
    } else if (status === 'ordered') {
      message = `*DAINTY IMPORT - ORDERED FROM CHINA*\n\n` +
        `Hello ${name}!\n` +
        `Your Preorder *#${order.id}* (${pieces} pcs) has been ordered from our China supplier and is being prepared for overseas shipping (${order.shipping_method || 'Air'}).\n\n` +
        `View your order catalog: https://${typeof window !== 'undefined' ? window.location.host : ''}/order?id=${order.id}\n\n` +
        `We will notify you once your package is in transit!`;
    } else if (status === 'shipped' && order.is_delayed) {
      message = `*DAINTY IMPORT - SHIPMENT DELAY UPDATE*\n\n` +
        `Hello ${name}!\n` +
        `Your preorder *#${order.id}* is delayed in transit.\n` +
        `${order.delay_reason || 'We are following up with the carrier and will share another update when available.'}\n` +
        `${order.revised_arrival_date ? `Revised estimated arrival: ${order.revised_arrival_date}\n` : ''}`;
    } else if (status === 'shipped') {
      message = `*DAINTY IMPORT - ORDER IN TRANSIT*\n\n` +
        `Hello ${name}!\n` +
        `Your Preorder *#${order.id}* has been shipped from China via ${order.shipping_method || 'Air'} shipping!\n` +
        `Timeline: ${order.shipping_timeline || (order.shipping_method === 'sea' ? 'Within 3 months' : 'Within 3 weeks')}.\n\n` +
        `View order details: https://${typeof window !== 'undefined' ? window.location.host : ''}/order?id=${order.id}`;
    } else if (status === 'ready_for_delivery') {
      message = `*DAINTY IMPORT - ARRIVED IN NIGERIA*\n\n` +
        `Hello ${name}!\n` +
        `Exciting news! Your Preorder *#${order.id}* (${pieces} pcs) has arrived in Nigeria and is ready for pickup or delivery!\n\n` +
        `*Confirmed Shipping Fee:* ₦${finalShip || estShip}\n` +
        `*Delivery Address:* ${order.customer_address || 'As registered'}\n\n` +
        `Please confirm payment of the shipping fee so we can dispatch your parcel right away! Note that shipping fees must be settled within 7 days of notification.`;
    } else if (status === 'delivered') {
      message = `*DAINTY IMPORT - ORDER DELIVERED*\n\n` +
        `Hello ${name}!\n` +
        `Your Preorder *#${order.id}* has been delivered! We hope you love all your items.\n\n` +
        `Thank you so much for your patronising Dainty Import! We look forward to sourcing for you again soon!`;
    } else {
      message = `*DAINTY IMPORT - PREORDER UPDATE*\n\n` +
        `Hello ${name}!\n` +
        `Here is the update regarding your Preorder *#${order.id}* (${pieces} pcs - ₦${amount}).\n\n` +
        `View your catalog: https://${typeof window !== 'undefined' ? window.location.host : ''}/order?id=${order.id}`;
    }

    const trackingUrl = `https://${typeof window !== 'undefined' ? window.location.host : ''}/track?id=${encodeURIComponent(order.id)}`;
    message += `\n\nTrack this order with ID *#${order.id}*: ${trackingUrl}`;
    const cleanMsg = message;
    const targetUrl = phone
      ? `https://wa.me/${phone.startsWith('0') ? '234' + phone.substring(1) : phone}?text=${encodeURIComponent(cleanMsg)}`
      : `https://wa.me/?text=${encodeURIComponent(cleanMsg)}`;

    window.open(targetUrl, '_blank');
  }

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

    const targetMoq = Number(catMoq) > 0 ? Number(catMoq) : null;
    const targetScope = catMoqScope || 'item';

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
      if (data?.id) {
        selectedCatIdRef.current = data.id;
        setSelectedCategoryId(data.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem('dainty_admin_selected_cat_id', data.id);
        }
      }
      setStatusMsg(`Category "${data?.name || catName}" added with MOQ ${targetMoq || 1} (${targetScope === 'item' ? 'Per Item' : 'Whole Category'}).`);
      await refreshData();
    }
  }



  async function handleResetIphoneCaseMoq50() {
    setErrorMsg(null);
    setStatusMsg(null);
    const targetCat = categories.find((c) => {
      const n = (c.name || '').toLowerCase();
      return n.includes('iphone') || n.includes('case');
    });

    if (!targetCat) {
      setErrorMsg('No category matching "iPhone" or "Case" found.');
      return;
    }

    const { error: catErr } = await supabase
      .from('categories')
      .update({ wholesale_moq: 50, moq_scope: 'category' })
      .eq('id', targetCat.id);

    if (catErr) {
      setErrorMsg(`Failed to update category: ${catErr.message}`);
      return;
    }

    await supabase
      .from('products')
      .update({ wholesale_moq: 50, min_order_qty: 50, moq_scope: 'category' })
      .eq('category_id', targetCat.id);

    setStatusMsg(`Restored "${targetCat.name}" wholesale MOQ to 50 pieces (category bulk)!`);
    await refreshData();
  }

  async function handleAddPhotosToDraftItem(tempId: string, filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return;
    const files = Array.from(filesList);
    setUploadingItemPhotoId(tempId);
    setErrorMsg(null);
    setStatusMsg(`Uploading ${files.length} photo(s) to product...`);

    const bucketCandidates = ['product images', 'productimages', 'product-images'];
    const uploadedUrls: string[] = [];

    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg';
      const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${cleanName}`;
      for (const bName of bucketCandidates) {
        try {
          const { error: upErr } = await supabase.storage.from(bName).upload(filePath, file, { cacheControl: '3600', upsert: true });
          if (!upErr) {
            const { data } = supabase.storage.from(bName).getPublicUrl(filePath);
            if (data?.publicUrl) {
              uploadedUrls.push(data.publicUrl);
              break;
            }
          }
        } catch (e) {}
      }
    }

    setUploadingItemPhotoId(null);
    if (uploadedUrls.length > 0) {
      setDraftItems((prev) =>
        prev.map((item) => {
          if (item.tempId !== tempId) return item;
          const currentMain = item.imageUrl || uploadedUrls[0];
          const newAdditional = item.imageUrl
            ? [...(item.additionalImages || []), ...uploadedUrls]
            : [...(item.additionalImages || []), ...uploadedUrls.slice(1)];
          return {
            ...item,
            imageUrl: currentMain,
            additionalImages: newAdditional,
          };
        })
      );
      setStatusMsg(`Attached ${uploadedUrls.length} picture(s) to this product.`);
    } else {
      setErrorMsg('Failed to upload pictures. Please check Supabase Storage bucket.');
    }
  }

  function handleSetMainPhoto(tempId: string, targetUrl: string) {
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        if (item.imageUrl === targetUrl) return item;
        const all = [item.imageUrl, ...(item.additionalImages || [])].filter(Boolean);
        const remaining = all.filter((u) => u !== targetUrl);
        return {
          ...item,
          imageUrl: targetUrl,
          additionalImages: remaining,
        };
      })
    );
  }

  function handleRemovePhoto(tempId: string, targetUrl: string) {
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        if (item.imageUrl === targetUrl) {
          const nextMain = item.additionalImages[0] || '';
          return {
            ...item,
            imageUrl: nextMain,
            additionalImages: item.additionalImages.slice(1),
          };
        }
        return {
          ...item,
          additionalImages: (item.additionalImages || []).filter((u) => u !== targetUrl),
        };
      })
    );
  }

  async function applyCategoryMixAndMatchToExistingProducts() {
    if (!selectedCategoryId) {
      setErrorMsg('Select a category first.');
      return;
    }

    const category = categories.find((item) => item.id === selectedCategoryId);
    const categoryName = category?.name || 'selected category';
    const catNameLower = categoryName.toLowerCase();
    const isIphoneCat = catNameLower.includes('iphone') || (catNameLower.includes('case') && !catNameLower.includes('briefcase') && !catNameLower.includes('suitcase'));
    const categoryMoq = isIphoneCat ? 50 : Number(sharedMoq || category?.wholesale_moq || 10);
    if (!Number.isFinite(categoryMoq) || categoryMoq < 1) {
      setErrorMsg('Enter a valid category minimum of at least 1 piece.');
      return;
    }

    if (!window.confirm(`Apply a ${categoryMoq}-piece minimum to the whole ${categoryName} category? The minimum applies to the combined quantity across products in this category.`)) {
      return;
    }

    setApplyingCategoryMoq(true);
    setErrorMsg(null);
    setStatusMsg(null);

    const categoryUpdate = await supabase
      .from('categories')
      .update({ wholesale_moq: categoryMoq, moq_scope: 'category' })
      .eq('id', selectedCategoryId);

    if (categoryUpdate.error) {
      setApplyingCategoryMoq(false);
      setErrorMsg(`Could not update the category MOQ: ${categoryUpdate.error.message}`);
      return;
    }

    const productsUpdate = await supabase
      .from('products')
      .update({ wholesale_moq: categoryMoq, min_order_qty: categoryMoq, moq_scope: 'category' })
      .eq('category_id', selectedCategoryId);

    setApplyingCategoryMoq(false);
    if (productsUpdate.error) {
      setErrorMsg(`Category settings were saved, but existing products were not updated: ${productsUpdate.error.message}`);
      return;
    }

    setSharedMoq(String(categoryMoq));
    setSharedMoqScope('category');
    setStatusMsg(`Applied ${categoryMoq} pieces total across ${categoryName}. The minimum applies to the combined quantity across products in this category.`);
    await refreshData();
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
            } catch (err: unknown) {
              lastErrText = err instanceof Error ? err.message : String(err);
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
    const isIphoneCat = catNameLower.includes('iphone') || (catNameLower.includes('case') && !catNameLower.includes('briefcase') && !catNameLower.includes('suitcase'));
    const defaultScope = isIphoneCat || selCat?.moq_scope === 'category' ? 'category' : 'item';
    const categoryMoq = isIphoneCat ? '50' : (defaultScope === 'category' && Number(selCat?.wholesale_moq) > 0 ? String(selCat?.wholesale_moq) : '');
    const defaultMoq = isIphoneCat ? '50' : (sharedMoq || categoryMoq || '1');

    if (uploadMode === 'single_product') {
      const mainPhoto = newUploadedUrls[0];
      const extraPhotos = newUploadedUrls.slice(1).map((u) => u.url);

      if (draftItems.length === 1) {
        setDraftItems((prev) =>
          prev.map((item, idx) => {
            if (idx === 0) {
              const currentMain = item.imageUrl || mainPhoto.url;
              const newAdditional = item.imageUrl
                ? [...(item.additionalImages || []), ...newUploadedUrls.map((u) => u.url)]
                : [...(item.additionalImages || []), ...extraPhotos];
              return {
                ...item,
                imageUrl: currentMain,
                additionalImages: newAdditional,
              };
            }
            return item;
          })
        );
        setStatusMsg(`Added ${newUploadedUrls.length} more photo(s) to your product draft.`);
      } else {
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
        setStatusMsg(`Created 1 product draft with ${newUploadedUrls.length} photo(s). Review or add more below.`);
      }
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

  function updateDraftItem(tempId: string, field: keyof DraftPhotoItem, val: unknown) {
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


  async function handleAddPhotosToExistingProduct(productId: string, filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return;
    const files = Array.from(filesList);
    setUploadingExistingPhotoId(productId);
    setErrorMsg(null);
    setStatusMsg(`Uploading ${files.length} photo(s)...`);

    const bucketCandidates = ['product images', 'productimages', 'product-images'];
    const uploadedUrls: string[] = [];

    for (const file of files) {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${cleanName}`;
      for (const bName of bucketCandidates) {
        try {
          const { error: upErr } = await supabase.storage.from(bName).upload(filePath, file, { cacheControl: '3600', upsert: true });
          if (!upErr) {
            const { data } = supabase.storage.from(bName).getPublicUrl(filePath);
            if (data?.publicUrl) {
              uploadedUrls.push(data.publicUrl);
              break;
            }
          }
        } catch (e) {}
      }
    }

    setUploadingExistingPhotoId(null);
    if (uploadedUrls.length === 0) {
      setErrorMsg('Failed to upload pictures. Please check Supabase Storage.');
      return;
    }

    const currentProd = products.find((p) => p.id === productId);
    if (!currentProd) return;

    const existingImages = getProductAllImages(currentProd);
    const updatedImages = [...existingImages, ...uploadedUrls];
    const newMain = currentProd.image_url || updatedImages[0];

    let updatedDesc = (currentProd.description || '').replace(/<!--dainty_images:.*?-->/g, '').trim();
    updatedDesc = updatedDesc ? `${updatedDesc}\n<!--dainty_images:${JSON.stringify(updatedImages)}-->` : `<!--dainty_images:${JSON.stringify(updatedImages)}-->`;

    let updateRes = await supabase.from('products').update({
      images: updatedImages,
      image_url: newMain,
      description: updatedDesc,
    }).eq('id', productId);

    if (updateRes.error && updateRes.error.message?.toLowerCase().includes('schema cache')) {
      updateRes = await supabase.from('products').update({
        image_url: newMain,
        description: updatedDesc,
      }).eq('id', productId);
    }

    if (updateRes.error) {
      setErrorMsg(`Failed to save photos: ${updateRes.error.message}`);
    } else {
      setStatusMsg(`Added ${uploadedUrls.length} photo(s) to "${currentProd.name || currentProd.title}".`);
      await refreshData();
    }
  }

  async function handleSetMainPhotoForExistingProduct(productId: string, targetUrl: string) {
    const currentProd = products.find((p) => p.id === productId);
    if (!currentProd) return;

    const all = getProductAllImages(currentProd);
    const reordered = [targetUrl, ...all.filter((u) => u !== targetUrl)];

    let updatedDesc = (currentProd.description || '').replace(/<!--dainty_images:.*?-->/g, '').trim();
    updatedDesc = updatedDesc ? `${updatedDesc}\n<!--dainty_images:${JSON.stringify(reordered)}-->` : `<!--dainty_images:${JSON.stringify(reordered)}-->`;

    let updateRes = await supabase.from('products').update({
      image_url: targetUrl,
      images: reordered,
      description: updatedDesc,
    }).eq('id', productId);

    if (updateRes.error && updateRes.error.message?.toLowerCase().includes('schema cache')) {
      updateRes = await supabase.from('products').update({
        image_url: targetUrl,
        description: updatedDesc,
      }).eq('id', productId);
    }

    if (updateRes.error) {
      setErrorMsg(updateRes.error.message);
    } else {
      setStatusMsg('Main photo updated!');
      await refreshData();
    }
  }

  async function handleDeletePhotoFromExistingProduct(productId: string, targetUrl: string) {
    const currentProd = products.find((p) => p.id === productId);
    if (!currentProd) return;

    const all = getProductAllImages(currentProd).filter((u) => u !== targetUrl);
    const newMain = all[0] || null;

    let updatedDesc = (currentProd.description || '').replace(/<!--dainty_images:.*?-->/g, '').trim();
    if (all.length > 0) {
      updatedDesc = updatedDesc ? `${updatedDesc}\n<!--dainty_images:${JSON.stringify(all)}-->` : `<!--dainty_images:${JSON.stringify(all)}-->`;
    }

    let updateRes = await supabase.from('products').update({
      image_url: newMain,
      images: all,
      description: updatedDesc,
    }).eq('id', productId);

    if (updateRes.error && updateRes.error.message?.toLowerCase().includes('schema cache')) {
      updateRes = await supabase.from('products').update({
        image_url: newMain,
        description: updatedDesc,
      }).eq('id', productId);
    }

    if (updateRes.error) {
      setErrorMsg(updateRes.error.message);
    } else {
      setStatusMsg('Photo removed.');
      await refreshData();
    }
  }

  async function handleSaveAllDraftProducts(e: FormEvent) {
    e.preventDefault();
    if (draftItems.length === 0) return;

    setSavingBatch(true);
    setErrorMsg(null);
    setStatusMsg(null);

    const itemsToPublish = sameForAll ? applySharedSpecsToList(draftItems) : draftItems;

    const selCat = categories.find((c) => c.id === selectedCategoryId);

    const payload = itemsToPublish.map((item, idx) => {
      const cleanName = item.name.trim() || `Product ${idx + 1}`;
      const retail = Number(item.retailPrice) || 0;
      const wholesale = Number(item.wholesalePrice) || 0;
      const airFee = item.estAirShipping && item.estAirShipping.trim() !== '' ? Number(item.estAirShipping) : 0;
      const seaFee = item.estSeaShipping && item.estSeaShipping.trim() !== '' ? Number(item.estSeaShipping) : 0;
      const sizeText = item.size ? item.size.trim() : null;
      const catNameLower = (selCat?.name || '').toLowerCase();
      const isIphoneCat = catNameLower.includes('iphone') && catNameLower.includes('case');

      const parsedItemMoq = Number(item.moq);
      const parsedSharedMoq = Number(sharedMoq);
      const parsedCatMoq = Number(selCat?.wholesale_moq);

      const moqScopeVal: 'category' | 'item' = item.moqScope || sharedMoqScope || (selCat?.moq_scope === 'category' ? 'category' : 'item');
      const moqVal = parsedItemMoq > 0
        ? parsedItemMoq
        : parsedSharedMoq > 0
        ? parsedSharedMoq
        : moqScopeVal === 'category' && parsedCatMoq > 0
        ? parsedCatMoq
        : (isIphoneCat && moqScopeVal === 'category' ? 50 : 1);

      // Colors and sizes are completely optional!
      const colorsList = item.colors && item.colors.trim() !== ''
        ? item.colors.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
      const sizesList = sizeText && sizeText.trim() !== ''
        ? sizeText.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const allImages = [item.imageUrl, ...(item.additionalImages || [])].filter(Boolean);

      let descText = item.description ? item.description.trim() : '';
      // Keep variants as hidden metadata for older schemas without repeating them in the visible description.
      descText = descText
        ? `${descText}\n<!--dainty_sizes:${JSON.stringify(sizesList)}-->\n<!--dainty_colors:${JSON.stringify(colorsList)}-->`
        : `<!--dainty_sizes:${JSON.stringify(sizesList)}-->\n<!--dainty_colors:${JSON.stringify(colorsList)}-->`;

      // Safe multi-photo backup embedded in description
      if (allImages.length > 0) {
        descText = descText ? `${descText}\n<!--dainty_images:${JSON.stringify(allImages)}-->` : `<!--dainty_images:${JSON.stringify(allImages)}-->`;
      }
      // Explicit shipping metadata tags so 0/blank is never lost or confused
      descText = descText
        ? `${descText}\n<!--dainty_ship_air:${airFee}-->\n<!--dainty_ship_sea:${seaFee}-->`
        : `<!--dainty_ship_air:${airFee}-->\n<!--dainty_ship_sea:${seaFee}-->`;

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
        est_shipping_fee: airFee > 0 ? airFee : (seaFee > 0 ? seaFee : 0),
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
      const fallbackRes1 = await supabase.from('products').insert(fallbackPayload1);
      error = fallbackRes1.error;

      if (error && error.message?.toLowerCase().includes('schema cache')) {
        const fallbackPayload2 = payload.map(({ moq_scope, sizes, size_options, wholesale_moq, min_order_qty, ...rest }) => rest);
        const fallbackRes2 = await supabase.from('products').insert(fallbackPayload2);
        error = fallbackRes2.error;

        if (error && error.message?.toLowerCase().includes('schema cache')) {
          const minimalPayload = payload.map(({ moq_scope, images, colors, color_options, sizes, size_options, wholesale_moq, min_order_qty, ...rest }) => rest);
          const minRes = await supabase.from('products').insert(minimalPayload);
          error = minRes.error;
          if (error && error.message?.toLowerCase().includes('schema cache')) {
            const compatiblePayload = minimalPayload.map(({ est_shipping_fee, est_shipping_fee_air, est_shipping_fee_sea, ...rest }) => rest);
            const compatibleRes = await supabase.from('products').insert(compatiblePayload);
            error = compatibleRes.error;
          }
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

  
  // ==========================================
  // EDIT PUBLISHED PRODUCT HANDLERS
  // ==========================================
  function startEditingProduct(p: Product) {
    const ship = getProductShippingFees(p);
    const allImages = getProductAllImages(p);
    const cleanDesc = cleanProductDescription(p.description);
    const pCat = categories.find((c) => c.id === p.category_id);
    const pCatName = (pCat?.name || '').toLowerCase();
    const prodName = (p.name || p.title || '').toLowerCase();
    const isIphoneCat = pCatName.includes('iphone') || prodName.includes('iphone') || ((pCatName.includes('case') || prodName.includes('case')) && !pCatName.includes('briefcase') && !prodName.includes('briefcase'));
    const descMoq = Number((p.description || '').match(/<!--dainty_moq:(\d+(?:\.\d+)?)-->/)?.[1] || 0);
    const descScope = (p.description || '').match(/<!--dainty_moq_scope:(category|item)-->/)?.[1];
    const moqScope: 'category' | 'item' = isIphoneCat
      ? 'category'
      : (p.moq_scope === 'category' || p.moq_scope === 'item'
          ? p.moq_scope
          : descScope === 'category' || descScope === 'item'
          ? descScope
          : pCat?.moq_scope === 'category' ? 'category' : 'item');
    const moqValue = isIphoneCat
      ? 50
      : (moqScope === 'category' && Number(pCat?.wholesale_moq) > 0
          ? Number(pCat?.wholesale_moq)
          : Number(p.wholesale_moq) > 0
          ? Number(p.wholesale_moq)
          : Number(p.min_order_qty) > 0
          ? Number(p.min_order_qty)
          : descMoq > 0
          ? descMoq
          : 1);
    const sizesFromMeta = getDescriptionList(p.description, 'sizes');
    const colorsFromMeta = getDescriptionList(p.description, 'colors');

    setEditingProduct({
      id: p.id,
      name: p.name || p.title || '',
      categoryId: p.category_id || '',
      retailPrice: String(p.retail_price ?? 0),
      wholesalePrice: String(p.wholesale_price ?? 0),
      moq: String(moqValue),
      moqScope,
      estAirShipping: ship.air > 0 ? String(ship.air) : '',
      estSeaShipping: ship.sea > 0 ? String(ship.sea) : '',
      size: p.size || (Array.isArray(p.sizes) ? p.sizes.join(', ') : '') || p.size_options || sizesFromMeta.join(', ') || '',
      colors: (Array.isArray(p.colors) ? p.colors.join(', ') : '') || p.color_options || colorsFromMeta.join(', ') || '',
      description: cleanDesc,
      imageUrl: p.image_url || allImages[0] || '',
      images: allImages,
    });
  }

  async function handleSaveEditedProduct(e: FormEvent) {
    e.preventDefault();
    if (!editingProduct) return;

    setSavingEdit(true);
    setErrorMsg(null);
    setStatusMsg(null);

    const cleanName = editingProduct.name.trim();
    const retail = Number(editingProduct.retailPrice) || 0;
    const wholesale = Number(editingProduct.wholesalePrice) || 0;
    const selCat = categories.find((c) => c.id === editingProduct.categoryId);
    const catNameLower = (selCat?.name || '').toLowerCase();
    const prodName = editingProduct.name.toLowerCase();
    const isIphoneCat = catNameLower.includes('iphone') || prodName.includes('iphone') || ((catNameLower.includes('case') || prodName.includes('case')) && !catNameLower.includes('briefcase') && !prodName.includes('briefcase'));
    const finalScope = isIphoneCat ? 'category' : editingProduct.moqScope;
    const moqVal = isIphoneCat
      ? 50
      : (Number(editingProduct.moq) > 0
          ? Number(editingProduct.moq)
          : finalScope === 'category' && Number(selCat?.wholesale_moq) > 0
          ? Number(selCat?.wholesale_moq)
          : 1);
    const airFee = editingProduct.estAirShipping && editingProduct.estAirShipping.trim() !== '' ? Number(editingProduct.estAirShipping) : 0;
    const seaFee = editingProduct.estSeaShipping && editingProduct.estSeaShipping.trim() !== '' ? Number(editingProduct.estSeaShipping) : 0;

    const sizesList = editingProduct.size
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const colorsList = editingProduct.colors
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    let descText = cleanProductDescription(editingProduct.description);
    if (editingProduct.images.length > 0) {
      descText = descText
        ? `${descText}
<!--dainty_images:${JSON.stringify(editingProduct.images)}-->`
        : `<!--dainty_images:${JSON.stringify(editingProduct.images)}-->`;
    }
    descText = descText
      ? `${descText}\n<!--dainty_moq:${moqVal}-->\n<!--dainty_moq_scope:${editingProduct.moqScope}-->\n<!--dainty_ship_air:${airFee}-->\n<!--dainty_ship_sea:${seaFee}-->\n<!--dainty_sizes:${JSON.stringify(sizesList)}-->\n<!--dainty_colors:${JSON.stringify(colorsList)}-->`
      : `<!--dainty_moq:${moqVal}-->\n<!--dainty_moq_scope:${editingProduct.moqScope}-->\n<!--dainty_ship_air:${airFee}-->\n<!--dainty_ship_sea:${seaFee}-->\n<!--dainty_sizes:${JSON.stringify(sizesList)}-->\n<!--dainty_colors:${JSON.stringify(colorsList)}-->`;

    const payload: Record<string, unknown> = {
      name: cleanName,
      title: cleanName,
      category_id: editingProduct.categoryId || null,
      size: editingProduct.size.trim() || null,
      sizes: sizesList.length > 0 ? sizesList : null,
      size_options: editingProduct.size.trim() || null,
      wholesale_moq: moqVal,
      min_order_qty: moqVal,
      moq_scope: finalScope,
      retail_price: retail,
      wholesale_price: wholesale,
      est_shipping_fee: airFee > 0 ? airFee : (seaFee > 0 ? seaFee : 0),
      est_shipping_fee_air: airFee > 0 ? airFee : null,
      est_shipping_fee_sea: seaFee > 0 ? seaFee : null,
      image_url: editingProduct.imageUrl || editingProduct.images[0] || null,
      images: editingProduct.images,
      colors: colorsList.length > 0 ? colorsList : null,
      color_options: colorsList.length > 0 ? colorsList.join(', ') : null,
      description: descText || null,
    };

    let updateRes = await supabase.from('products').update(payload).eq('id', editingProduct.id);

    if (updateRes.error && updateRes.error.message?.toLowerCase().includes('schema cache')) {
      const { moq_scope, ...fallback1 } = payload;
      updateRes = await supabase.from('products').update(fallback1).eq('id', editingProduct.id);

      if (updateRes.error && updateRes.error.message?.toLowerCase().includes('schema cache')) {
        const { moq_scope: _m, sizes: _s, size_options: _so, wholesale_moq: _w, min_order_qty: _mo, ...fallback2 } = payload;
        updateRes = await supabase.from('products').update(fallback2).eq('id', editingProduct.id);

        if (updateRes.error && updateRes.error.message?.toLowerCase().includes('schema cache')) {
          const { moq_scope: _m2, images: _img, colors: _col, color_options: _co, sizes: _s2, size_options: _so2, wholesale_moq: _w2, min_order_qty: _mo2, ...minimal } = payload;
          updateRes = await supabase.from('products').update(minimal).eq('id', editingProduct.id);
          if (updateRes.error && updateRes.error.message?.toLowerCase().includes('schema cache')) {
            const { est_shipping_fee, est_shipping_fee_air, est_shipping_fee_sea, ...compatible } = minimal;
            updateRes = await supabase.from('products').update(compatible).eq('id', editingProduct.id);
          }
        }
      }
    }

    setSavingEdit(false);
    if (updateRes.error) {
      setErrorMsg(`Failed to save changes: ${updateRes.error.message}`);
    } else {
      setStatusMsg(`Updated "${cleanName}" successfully!`);
      setEditingProduct(null);
      await refreshData();
    }
  }

  async function handleUploadPhotoToEditingProduct(filesList: FileList | null) {
    if (!filesList || filesList.length === 0 || !editingProduct) return;
    const files = Array.from(filesList);
    setUploadingEditPhoto(true);

    const bucketCandidates = ['product images', 'productimages', 'product-images'];
    const uploadedUrls: string[] = [];

    for (const file of files) {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${cleanName}`;
      for (const bName of bucketCandidates) {
        try {
          const { error: upErr } = await supabase.storage.from(bName).upload(filePath, file, { cacheControl: '3600', upsert: true });
          if (!upErr) {
            const { data } = supabase.storage.from(bName).getPublicUrl(filePath);
            if (data?.publicUrl) {
              uploadedUrls.push(data.publicUrl);
              break;
            }
          }
        } catch {}
      }
    }

    setUploadingEditPhoto(false);
    if (uploadedUrls.length > 0) {
      const newImages = [...editingProduct.images, ...uploadedUrls];
      setEditingProduct({
        ...editingProduct,
        imageUrl: editingProduct.imageUrl || newImages[0],
        images: newImages,
      });
      setStatusMsg(`Uploaded ${uploadedUrls.length} new photo(s) to draft edit.`);
    }
  }

  function handleSetMainPhotoInEditingProduct(targetUrl: string) {
    if (!editingProduct) return;
    const reordered = [targetUrl, ...editingProduct.images.filter((u) => u !== targetUrl)];
    setEditingProduct({
      ...editingProduct,
      imageUrl: targetUrl,
      images: reordered,
    });
  }

  function handleRemovePhotoFromEditingProduct(targetUrl: string) {
    if (!editingProduct) return;
    const filtered = editingProduct.images.filter((u) => u !== targetUrl);
    setEditingProduct({
      ...editingProduct,
      imageUrl: editingProduct.imageUrl === targetUrl ? (filtered[0] || '') : editingProduct.imageUrl,
      images: filtered,
    });
  }

  // ==========================================
  // EDIT PUBLISHED CATEGORY HANDLERS
  // ==========================================
  function startEditingCategory(c: Category) {
    setEditingCategory({
      id: c.id,
      name: c.name,
      wholesale_moq: String(c.wholesale_moq || 5),
      moq_scope: c.moq_scope === 'item' ? 'item' : 'category',
    });
  }

  async function handleSaveEditedCategory(e: FormEvent) {
    e.preventDefault();
    if (!editingCategory) return;
    setSavingCategoryEdit(true);
    setErrorMsg(null);
    setStatusMsg(null);

    const cleanName = editingCategory.name.trim();
    const moqVal = Number(editingCategory.wholesale_moq) || 1;

    let updateRes = await supabase.from('categories').update({
      name: cleanName,
      wholesale_moq: moqVal,
      moq_scope: editingCategory.moq_scope,
    }).eq('id', editingCategory.id);

    if (updateRes.error && updateRes.error.message?.toLowerCase().includes('schema cache')) {
      updateRes = await supabase.from('categories').update({
        name: cleanName,
        wholesale_moq: moqVal,
      }).eq('id', editingCategory.id);
    }

    setSavingCategoryEdit(false);
    if (updateRes.error) {
      setErrorMsg(`Failed to update category: ${updateRes.error.message}`);
    } else {
      setStatusMsg(`Category "${cleanName}" updated!`);
      setEditingCategory(null);
      await refreshData();
    }
  }

  async function handleDeleteCategory(catId: string, catName: string) {
    if (!window.confirm(`Are you sure you want to delete category "${catName}"? Products in this category will become uncategorized.`)) {
      return;
    }
    setErrorMsg(null);
    setStatusMsg(null);

    const { error } = await supabase.from('categories').delete().eq('id', catId);
    if (error) {
      setErrorMsg(`Failed to delete category: ${error.message}`);
    } else {
      setStatusMsg(`Category "${catName}" removed.`);
      if (selectedCategoryId === catId) setSelectedCategoryId('');
      await refreshData();
    }
  }

  // ==========================================
  // STORE SETTINGS HANDLER (WHATSAPP NUMBER)
  // ==========================================
  async function handleSaveStoreWhatsapp(e: FormEvent) {
    e.preventDefault();
    setSavingWhatsapp(true);
    setErrorMsg(null);
    setStatusMsg(null);

    const cleanNum = storeWhatsapp.replace(/[^0-9]/g, '');
    const { error } = await supabase.from('store_settings').upsert({
      id: 1,
      whatsapp_number: cleanNum,
    });

    setSavingWhatsapp(false);
    if (error) {
      setErrorMsg(`Failed to save WhatsApp number: ${error.message}`);
    } else {
      setStatusMsg(`WhatsApp preorder number updated to +${cleanNum}!`);
      setShowSettingsDrawer(false);
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
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center justify-between gap-2">
            <span>{statusMsg}</span>
            <div className="flex items-center gap-2">
              {adminActiveTab === 'upload' && statusMsg.includes('Published') && (
                <button
                  type="button"
                  onClick={() => {
                    setAdminActiveTab('published');
                    if (typeof window !== 'undefined') {
                      const url = new URL(window.location.href);
                      url.searchParams.set('tab', 'published');
                      window.history.replaceState(null, '', url.toString());
                    }
                  }}
                  className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-800 transition"
                >
                  View Published Products →
                </button>
              )}
              <button onClick={() => setStatusMsg(null)}><X className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        {/* Admin Navigation: 3 Distinct Pages / Tabs */}
        <nav aria-label="Admin views" className="sticky top-[57px] z-20 -mx-4 flex gap-2 border-b border-stone-200 bg-stone-100/95 p-2 backdrop-blur sm:top-[61px] sm:mx-0 sm:rounded-2xl sm:border sm:bg-white sm:p-2 sm:shadow-xs">
          {[
            { id: 'upload', label: 'Upload Products', icon: Upload, count: null },
            { id: 'published', label: 'Published Products', icon: CheckSquare, count: products.length },
            { id: 'inventory', label: 'Inventory & Orders', icon: Package, count: preorders.length },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = adminActiveTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setAdminActiveTab(item.id as 'upload' | 'published' | 'inventory');
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', item.id);
                    window.history.replaceState(null, '', url.toString());
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2.5 py-2.5 text-xs font-bold transition ${
                  isActive
                    ? 'bg-[#fa9d26] text-white shadow-xs'
                    : 'bg-white sm:bg-stone-50 text-stone-700 hover:bg-stone-100 hover:text-stone-900 border border-stone-200/70'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.count !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                      isActive ? 'bg-white/25 text-white' : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* TAB 1: UPLOAD PRODUCTS */}
        {adminActiveTab === 'upload' && (
          <div className="space-y-6">
            {/* Categories Section */}
            <section id="upload" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
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

          {/* Category Chips with Edit Option */}
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className={`inline-flex items-center rounded-full border text-xs font-medium transition shadow-2xs ${
                  selectedCategoryId === c.id
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectCategory(c.id)}
                  className="px-3.5 py-1.5 focus:outline-hidden"
                >
                  {c.name} {c.wholesale_moq ? `(${c.wholesale_moq} pcs ${c.moq_scope === 'category' ? 'category total' : 'per item'})` : ''}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditingCategory(c);
                  }}
                  className={`pr-2.5 pl-1 py-1 hover:opacity-75 transition ${
                    selectedCategoryId === c.id ? 'text-amber-300' : 'text-stone-500'
                  }`}
                  title={`Edit Category: ${c.name}`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Quick Category Editor (when active) */}
          {editingCategory && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <Pencil className="h-3.5 w-3.5 text-[#fa9d26]" />
                  Edit Published Category
                </span>
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="text-stone-400 hover:text-stone-700 text-xs"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleSaveEditedCategory} className="flex flex-wrap items-center gap-2.5 text-xs">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-[10px] font-bold text-stone-600 block mb-1">Category Name</label>
                  <input
                    type="text"
                    required
                    value={editingCategory.name}
                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs focus:border-stone-900 focus:outline-hidden"
                  />
                </div>
                <div className="w-24">
                  <label className="text-[10px] font-bold text-stone-600 block mb-1">Wholesale MOQ</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editingCategory.wholesale_moq}
                    onChange={(e) => setEditingCategory({ ...editingCategory, wholesale_moq: e.target.value })}
                    className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs focus:border-stone-900 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-600 block mb-1">MOQ Scope</label>
                  <select
                    value={editingCategory.moq_scope}
                    onChange={(e) => setEditingCategory({ ...editingCategory, moq_scope: e.target.value as 'category' | 'item' })}
                    className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs focus:border-stone-900 focus:outline-hidden"
                  >
                    <option value="category">Whole Category (Bulk MOQ)</option>
                    <option value="item">Per Item (Single design MOQ)</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 mt-4 sm:mt-5">
                  <button
                    type="submit"
                    disabled={savingCategoryEdit}
                    className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 transition disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {savingCategoryEdit ? 'Saving...' : 'Save Category'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(editingCategory.id, editingCategory.name)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </form>
            </div>
          )}

{/* Store-wide MOQ removed */}

          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                iPhone Cases Wholesale Minimum (50 pcs)
              </p>
              <p className="text-[11px] text-amber-900 leading-snug">
                Enforce a 50-piece minimum across all iPhone cases (category bulk: customers can pick any iPhone case designs to reach 50 pcs).
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetIphoneCaseMoq50}
              className="shrink-0 rounded-lg bg-amber-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-800 transition shadow-2xs"
            >
              Reset iPhone Cases to 50 pcs MOQ
            </button>
          </div>

          {selectedCategoryId && (
            <div className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-stone-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-stone-700">
                <strong>Category Bulk:</strong> Apply minimum only across products in this category.
              </p>
              <button
                type="button"
                onClick={applyCategoryMixAndMatchToExistingProducts}
                disabled={applyingCategoryMoq}
                className="shrink-0 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-900 disabled:opacity-50"
              >
                {applyingCategoryMoq ? 'Applying…' : `Apply ${sharedMoq || '10'}-pc Category MOQ`}
              </button>
            </div>
          )}

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
        <section id="upload-form" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-5">
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
              onClick={() => setUploadMode('single_product')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-medium transition ${
                uploadMode === 'single_product'
                  ? 'bg-[#fa9d26] text-white shadow-xs font-bold'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              <ImageIcon className="h-4 w-4" />
              Single Product (Multiple photos / angles / colors)
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('separate')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-medium transition ${
                uploadMode === 'separate'
                  ? 'bg-stone-900 text-white shadow-xs font-bold'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              <Layers className="h-4 w-4" />
              Bulk Upload (1 product per photo)
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
                          ? 'border-[#fa9d26] bg-white ring-2 ring-[#fa9d26]/30 shadow-xs text-stone-900 font-semibold'
                          : 'border-stone-200 bg-white/60 text-stone-600 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-stone-900">
                        <Box className="h-3.5 w-3.5 text-stone-800" />
                        <span>Per Item Only (Default)</span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-500 leading-snug font-normal">
                        Each item has its own MOQ. Different items under this category can have different minimum order quantities.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSharedMoqScope('category')}
                      className={`rounded-lg border p-2.5 text-left text-xs transition ${
                        sharedMoqScope === 'category'
                          ? 'border-[#fa9d26] bg-white ring-2 ring-[#fa9d26]/30 shadow-xs text-stone-900 font-semibold'
                          : 'border-stone-200 bg-white/60 text-stone-600 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-stone-900">
                        <FolderPlus className="h-3.5 w-3.5 text-blue-600" />
                        <span>Whole Category MOQ</span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-500 leading-snug font-normal">
                        Only if stated for the whole category. The minimum applies to the combined quantity across products in this category.
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
                  : uploadMode === 'single_product'
                  ? 'Tap or click to select product photos from gallery'
                  : 'Tap or click to select China product photos from gallery'}
              </span>
              <span className="text-xs text-stone-500">
                {uploadMode === 'single_product'
                  ? 'Select multiple pictures at once (JPG, PNG, WEBP, HEIC). You can also add more angles anytime below!'
                  : 'Select multiple pictures at once — each photo will become a separate product.'}
              </span>
              <input
                type="file"
                accept="image/*,image/jpeg,image/png,image/webp,image/heic"
                multiple
                disabled={uploadingPhotos || savingBatch}
                onChange={(e) => {
                  handleGalleryFilesChange(e);
                  e.target.value = '';
                }}
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
                            onChange={(e) => updateDraftItem(item.tempId, 'moqScope', e.target.value as 'category' | 'item')}
                            className="text-[10px] rounded border border-stone-300 px-1 py-1 bg-white font-medium"
                          >
                            <option value="item">Per item (Default)</option>
                            <option value="category">Whole category</option>
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

                    {/* Photo Gallery with multi-picture display, thumbnails, set main photo, and + Add More Photos */}
                    <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <ImageIcon className="h-3.5 w-3.5 text-stone-700" />
                          <span className="text-xs font-bold text-stone-800">
                            Product Photos ({1 + (item.additionalImages?.length || 0)})
                          </span>
                          <span className="text-[10px] text-stone-500">
                            • Tap any photo to make it the Main photo
                          </span>
                        </div>
                        {uploadingItemPhotoId === item.tempId && (
                          <span className="text-[11px] font-semibold text-[#fa9d26] animate-pulse">
                            Uploading photos...
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        {/* Main Photo Card */}
                        {item.imageUrl && (
                          <div className="relative group shrink-0">
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-16 w-16 rounded-lg border-2 border-[#fa9d26] object-contain bg-white p-1 shadow-2xs"
                            />
                            <span className="absolute -top-1.5 -left-1.5 rounded-full bg-[#fa9d26] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-xs">
                              Main
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(item.tempId, item.imageUrl)}
                              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold hover:bg-red-700 shadow-xs"
                              title="Remove photo"
                            >
                              ×
                            </button>
                          </div>
                        )}

                        {/* Additional Angle Photos */}
                        {(item.additionalImages || []).map((imgUrl, iIdx) => (
                          <div key={iIdx} className="relative group shrink-0">
                            <img
                              src={imgUrl}
                              alt={`Angle ${iIdx + 1}`}
                              onClick={() => handleSetMainPhoto(item.tempId, imgUrl)}
                              className="h-16 w-16 rounded-lg border border-stone-300 object-contain bg-white p-1 cursor-pointer hover:border-[#fa9d26] hover:scale-105 transition shadow-2xs"
                              title="Click to set as Main photo"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(item.tempId, imgUrl)}
                              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold hover:bg-red-700 shadow-xs"
                              title="Remove photo"
                            >
                              ×
                            </button>
                          </div>
                        ))}

                        {/* + Add More Photos Button for this single product */}
                        <label className="flex h-16 w-24 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-300 bg-white hover:border-[#fa9d26] hover:bg-amber-50/40 transition text-center p-1 shadow-2xs">
                          <Plus className="h-4 w-4 text-stone-700" />
                          <span className="text-[10px] font-bold text-stone-800 leading-tight mt-0.5">
                            + Add Photos
                          </span>
                          <span className="text-[8px] text-stone-500 leading-tight">Pick 1 or more</span>
                          <input
                            type="file"
                            accept="image/*,image/jpeg,image/png,image/webp,image/heic"
                            multiple
                            disabled={uploadingItemPhotoId === item.tempId || savingBatch}
                            onChange={(e) => {
                              handleAddPhotosToDraftItem(item.tempId, e.target.files);
                              e.target.value = '';
                            }}
                            className="sr-only"
                          />
                        </label>
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
          </div>
        )}

        {/* TAB 2: PUBLISHED PRODUCTS */}
        {adminActiveTab === 'published' && (
          <div className="space-y-6">
            {/* Existing Products List */}
            <section id="published" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <span>3. Current Store Products ({products.length})</span>
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  All Editable
                </span>
              </h2>
              <p className="text-xs text-stone-500">Click &ldquo;Edit&rdquo; on any product to update prices, MOQ, shipping, variants, description, or photos.</p>
            </div>

            {/* Catalog search and category filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-stone-50 pl-8 pr-3 py-1 text-xs focus:bg-white focus:border-stone-900 focus:outline-hidden w-40 sm:w-48"
                />
              </div>
              <select
                value={catalogCategoryFilter}
                onChange={(e) => setCatalogCategoryFilter(e.target.value)}
                className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs focus:bg-white focus:border-stone-900 focus:outline-hidden"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="max-h-[700px] space-y-2.5 overflow-y-auto pr-1">
            {products.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-sm font-semibold text-stone-600">No products published yet.</p>
                <button
                  type="button"
                  onClick={() => {
                    setAdminActiveTab('upload');
                    if (typeof window !== 'undefined') {
                      const url = new URL(window.location.href);
                      url.searchParams.set('tab', 'upload');
                      window.history.replaceState(null, '', url.toString());
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#fa9d26] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#e68c1d] transition"
                >
                  <Upload className="h-4 w-4" />
                  <span>Go to Upload Products</span>
                </button>
              </div>
            ) : (
              products
              .filter((p) => {
                const matchCat = catalogCategoryFilter === 'all' || p.category_id === catalogCategoryFilter;
                const pTitle = (p.name || p.title || '').toLowerCase();
                const pDesc = (p.description || '').toLowerCase();
                const q = catalogSearch.toLowerCase().trim();
                const matchSearch = !q || pTitle.includes(q) || pDesc.includes(q);
                return matchCat && matchSearch;
              })
              .map((p) => {
                const ship = getProductShippingFees(p);
                const air = ship.air;
                const sea = ship.sea;
                const pTitle = p.name || p.title || 'Untitled';
                const description = cleanProductDescription(p.description);
                const pImages = getProductAllImages(p);
                const isManagingPhotos = managingPhotosProductId === p.id;
                const isUploadingPhotos = uploadingExistingPhotoId === p.id;

                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3.5 text-xs shadow-2xs hover:border-stone-300 transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {p.image_url ? (
                          <div className="relative shrink-0">
                            <img src={p.image_url} alt={pTitle} className="h-14 w-14 rounded-lg object-contain bg-stone-50 border border-stone-200 p-0.5" />
                            {pImages.length > 1 && (
                              <span className="absolute -bottom-1 -right-1 rounded-full bg-stone-900 px-1.5 py-0.2 text-[9px] font-bold text-white shadow-xs">
                                {pImages.length}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="h-14 w-14 rounded-lg bg-stone-100 flex items-center justify-center text-[10px] text-stone-400 border border-stone-200">No img</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-stone-900">{pTitle}</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                              <ImageIcon className="h-3 w-3 text-[#fa9d26]" />
                              {pImages.length} photo{pImages.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="text-[11px] text-stone-500 flex flex-wrap gap-2 mt-1">
                            <span>Retail: <strong className="text-stone-800">₦{Number(p.retail_price).toLocaleString()}</strong></span>
                            <span className="text-amber-800">Wholesale: <strong className="text-amber-900">₦{Number(p.wholesale_price).toLocaleString()}</strong></span>
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {air > 0 ? (
                                <span className="text-stone-600">Air: ₦{air.toLocaleString()}</span>
                              ) : (
                                <span className="text-red-600 font-medium">Can&apos;t be shipped by air</span>
                              )}
                              <span className="text-stone-300">•</span>
                              {sea > 0 ? (
                                <span className="text-stone-600">Sea: ₦{sea.toLocaleString()}</span>
                              ) : (
                                <span className="text-red-600 font-medium">Can&apos;t be shipped by sea</span>
                              )}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-stone-600"><span className="font-semibold text-stone-700">Description:</span> {description || 'No description added.'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* EDIT PRODUCT BUTTON */}
                        <button
                          type="button"
                          onClick={() => startEditingProduct(p)}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-900 shadow-2xs hover:bg-stone-50 hover:border-stone-900 transition"
                          title="Edit product details, prices, shipping, variants, and description"
                        >
                          <Pencil className="h-3.5 w-3.5 text-[#fa9d26]" />
                          <span>Edit</span>
                        </button>

                        {/* Manage Photos Button */}
                        <button
                          type="button"
                          onClick={() => setManagingPhotosProductId(isManagingPhotos ? null : p.id)}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                            isManagingPhotos
                              ? 'border-[#fa9d26] bg-amber-50 text-amber-950 shadow-2xs'
                              : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                          }`}
                          title="View and edit all pictures for this product"
                        >
                          <ImageIcon className="h-3.5 w-3.5 text-[#fa9d26]" />
                          {isManagingPhotos ? 'Close Photos' : 'Photos'}
                        </button>

                        {/* Quick Add Photo */}
                        <label className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 hover:border-stone-300 transition cursor-pointer">
                          <Plus className="h-3.5 w-3.5 text-[#fa9d26]" />
                          <span className="hidden sm:inline">Add Photo</span>
                          <input
                            type="file"
                            accept="image/*,image/jpeg,image/png,image/webp,image/heic"
                            multiple
                            disabled={isUploadingPhotos}
                            onChange={(e) => {
                              handleAddPhotosToExistingProduct(p.id, e.target.files);
                              e.target.value = '';
                            }}
                            className="sr-only"
                          />
                        </label>

                        {/* Delete Product */}
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(p.id)}
                          className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                          title="Delete Product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Quick photo preview thumbnails row */}
                    {pImages.length > 1 && !isManagingPhotos && (
                      <div className="flex items-center gap-1.5 pt-1 overflow-x-auto border-t border-stone-100">
                        <span className="text-[10px] text-stone-400 font-medium shrink-0">All angles:</span>
                        {pImages.map((img, i) => (
                          <img
                            key={i}
                            src={img}
                            alt={`${pTitle} photo ${i + 1}`}
                            className={`h-8 w-8 rounded-md object-contain bg-stone-50 border p-0.5 shrink-0 ${
                              img === p.image_url ? 'border-[#fa9d26] ring-1 ring-[#fa9d26]' : 'border-stone-200'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Manage Photos Tray (when expanded) */}
                    {isManagingPhotos && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-950">
                            Manage Pictures ({pImages.length})
                          </span>
                          <span className="text-[11px] text-stone-500">
                            • Click any photo to make it the Main photo
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {pImages.map((img, idx) => {
                            const isMain = img === p.image_url;
                            return (
                              <div key={idx} className="relative group shrink-0">
                                <img
                                  src={img}
                                  alt={`Angle ${idx + 1}`}
                                  onClick={() => handleSetMainPhotoForExistingProduct(p.id, img)}
                                  className={`h-16 w-16 rounded-lg object-contain bg-white p-1 cursor-pointer transition ${
                                    isMain
                                      ? 'border-2 border-[#fa9d26] shadow-2xs'
                                      : 'border border-stone-300 hover:border-[#fa9d26] hover:scale-105'
                                  }`}
                                  title={isMain ? 'Main photo' : 'Click to make this the Main photo'}
                                />
                                {isMain ? (
                                  <span className="absolute -top-1.5 -left-1.5 rounded-full bg-[#fa9d26] px-1.5 py-0.2 text-[9px] font-bold text-white shadow-2xs">
                                    Main
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSetMainPhotoForExistingProduct(p.id, img)}
                                    className="absolute bottom-1 left-1 right-1 rounded bg-stone-900/80 px-1 py-0.5 text-[8px] font-bold text-white opacity-0 group-hover:opacity-100 transition text-center"
                                  >
                                    Make Main
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeletePhotoFromExistingProduct(p.id, img)}
                                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold hover:bg-red-700 shadow-2xs"
                                  title="Delete photo"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}

                          {/* Add more photos button */}
                          <label className="flex h-16 w-24 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-amber-300 bg-white hover:border-[#fa9d26] hover:bg-amber-100/50 transition text-center p-1">
                            <Plus className="h-4 w-4 text-stone-700" />
                            <span className="text-[10px] font-bold text-stone-800 leading-tight mt-0.5">
                              + Add Photo
                            </span>
                            <span className="text-[8px] text-stone-500">Pick 1 or more</span>
                            <input
                              type="file"
                              accept="image/*,image/jpeg,image/png,image/webp,image/heic"
                              multiple
                              disabled={isUploadingPhotos}
                              onChange={(e) => {
                                handleAddPhotosToExistingProduct(p.id, e.target.files);
                                e.target.value = '';
                              }}
                              className="sr-only"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
          </div>
        )}

        {/* TAB 3: INVENTORY & ORDERS */}
        {adminActiveTab === 'inventory' && (
          <div className="space-y-6">
            {/* Section 4: Customer Preorders, CRM & Inventory Pipeline */}
            <section id="inventory" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs sm:p-6 space-y-5">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center text-[#fa9d26]">
                  <Truck className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold text-stone-900">
                  4. Preorders, Customer Info & Inventory Pipeline
                </h2>
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Record customer payments, track items from China to Nigeria, and manage order fulfillment.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl bg-stone-100 p-1 text-xs font-semibold text-stone-600">
                <button
                  type="button"
                  onClick={() => setAdminActiveSubTab('pipeline')}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    adminActiveSubTab === 'pipeline'
                      ? 'bg-white text-stone-900 shadow-2xs font-bold'
                      : 'hover:text-stone-900'
                  }`}
                >
                  Order Pipeline ({preorders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAdminActiveSubTab('customers')}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    adminActiveSubTab === 'customers'
                      ? 'bg-white text-stone-900 shadow-2xs font-bold'
                      : 'hover:text-stone-900'
                  }`}
                >
                  Customers ({customers.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAssigningToOrderId(null);
                  setShowCustomerModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#fa9d26] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#e68c1d] shadow-2xs transition"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>+ New Customer</span>
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* TAB 1: ORDER PIPELINE & INVENTORY TAKING                  */}
          {/* ========================================================= */}
          {adminActiveSubTab === 'pipeline' && (
            <div className="space-y-4">
              {/* Pipeline Status Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                {[
                  { id: 'all', label: 'All Orders', count: preorders.length, icon: '' },
                  { id: 'pending', label: 'Pending Payment', count: preorders.filter(p => !p.status || p.status === 'pending').length, icon: '' },
                  { id: 'paid', label: 'Paid', count: preorders.filter(p => p.status === 'paid').length, icon: '' },
                  { id: 'ordered', label: 'Ordered (China)', count: preorders.filter(p => p.status === 'ordered').length, icon: '' },
                  { id: 'shipped', label: 'Shipped (In Transit)', count: preorders.filter(p => p.status === 'shipped').length, icon: '' },
                  { id: 'ready_for_delivery', label: 'Ready in Nigeria', count: preorders.filter(p => p.status === 'ready_for_delivery').length, icon: '' },
                  { id: 'delivered', label: 'Delivered', count: preorders.filter(p => p.status === 'delivered').length, icon: '' },
                  { id: 'cancelled', label: 'Cancelled', count: preorders.filter(p => p.status === 'cancelled').length, icon: '' },
                ].map((tab) => {
                  const isActive = orderStatusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setOrderStatusFilter(tab.id)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition border ${
                        isActive
                          ? 'border-stone-900 bg-stone-900 text-white shadow-2xs'
                          : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                      <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        isActive ? 'bg-stone-700 text-white' : 'bg-stone-200 text-stone-700'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Filters & Search Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="Search by Order ID (#ORD-...), customer name, or phone..."
                    className="w-full rounded-xl border border-stone-200 bg-stone-50/50 pl-9 pr-3 py-2 text-xs focus:border-stone-900 focus:bg-white focus:outline-hidden"
                  />
                  {orderSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setOrderSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={orderCustomerFilter}
                    onChange={(e) => setOrderCustomerFilter(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-xs text-stone-700 focus:border-stone-900 focus:bg-white focus:outline-hidden"
                  >
                    <option value="all">Filter by Customer (All Customers)</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Order Cards List */}
              {(() => {
                const filteredOrders = preorders.filter((po) => {
                  const status = po.status || 'pending';
                  if (orderStatusFilter !== 'all' && status !== orderStatusFilter) return false;
                  if (orderCustomerFilter !== 'all' && po.customer_id !== orderCustomerFilter) return false;
                  if (orderSearchQuery.trim()) {
                    const q = orderSearchQuery.toLowerCase();
                    const matchId = (po.id || '').toLowerCase().includes(q);
                    const matchCust = (po.customer_name || '').toLowerCase().includes(q);
                    const matchPhone = (po.customer_phone || '').includes(q);
                    if (!matchId && !matchCust && !matchPhone) return false;
                  }
                  return true;
                });

                if (filteredOrders.length === 0) {
                  return (
                    <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/50 p-8 text-center space-y-2">
                      <p className="text-xs font-semibold text-stone-600">No orders found in this view.</p>
                      <p className="text-[11px] text-stone-400">
                        When customers submit an order or click WhatsApp checkout, their order will appear here automatically.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {filteredOrders.map((po) => {
                      const status = po.status || 'pending';
                      const isUpdating = updatingOrderId === po.id;
                      const pieces = po.total_pieces || (po.items?.length || 0);
                      const amount = Number(po.total_amount || 0);
                      const isAir = (po.shipping_method || 'air') === 'air';

                      // Status visual config
                      const statusStyles: Record<string, { label: string; bg: string; text: string; border: string; icon: string }> = {
                        pending: { label: 'Pending Payment', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', icon: '' },
                        paid: { label: 'Paid', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: '' },
                        ordered: { label: 'Ordered from China', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', icon: '' },
                        shipped: { label: 'Shipped (In Transit)', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', icon: '' },
                        ready_for_delivery: { label: 'Ready in Nigeria', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200', icon: '' },
                        delivered: { label: 'Delivered', bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-300', icon: '' },
                        cancelled: { label: 'Cancelled', bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200', icon: '' },
                      };
                      const currStyle = po.is_delayed && status === 'shipped'
                        ? { label: 'Delayed in Transit', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-300', icon: '' }
                        : (statusStyles[status] || statusStyles.pending);

                      return (
                        <div
                          key={po.id}
                          className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 shadow-2xs space-y-4 hover:border-stone-300 transition"
                        >
                          {/* Order Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-stone-100 pb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-extrabold text-stone-900 bg-stone-100 px-2 py-0.5 rounded-md">
                                #{po.id}
                              </span>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${currStyle.bg} ${currStyle.text} ${currStyle.border}`}>
                                <span>{currStyle.icon}</span>
                                <span>{currStyle.label}</span>
                              </span>
                              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
                                {po.mode || 'Wholesale'} • {isAir ? 'Air (3 wks)' : 'Sea (3 mos)'}
                              </span>
                            </div>

                            <div className="text-[11px] text-stone-400">
                              Placed: {po.created_at ? new Date(po.created_at).toLocaleString() : 'Recent'}
                            </div>
                          </div>

                          {/* Customer Information Section */}
                          <div className="rounded-xl border border-stone-200/70 bg-stone-50/70 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                                <User className="h-3.5 w-3.5 text-[#fa9d26]" />
                                <span>Customer Information:</span>
                              </div>

                              <div className="flex items-center gap-2">
                                {po.customer_name ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAssigningToOrderId(po.id);
                                      setShowCustomerModal(true);
                                    }}
                                    className="text-[11px] font-semibold text-amber-700 hover:underline"
                                  >
                                    Edit / Reassign
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAssigningToOrderId(po.id);
                                      setShowCustomerModal(true);
                                    }}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#b86200] hover:underline"
                                  >
                                    <UserPlus className="h-3 w-3" />
                                    <span>+ Add / Assign Customer</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {po.customer_name ? (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                                <div>
                                  <span className="text-[10px] text-stone-400 uppercase font-bold block">Name</span>
                                  <span className="font-bold text-stone-900">{po.customer_name}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-stone-400 uppercase font-bold block">Phone / WhatsApp</span>
                                  <a
                                    href={`https://wa.me/${(po.customer_phone || '').replace(/[^0-9]/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
                                  >
                                    <MessageCircle className="h-3 w-3" />
                                    <span>{po.customer_phone}</span>
                                  </a>
                                </div>
                                <div>
                                  <span className="text-[10px] text-stone-400 uppercase font-bold block">Delivery Address</span>
                                  <span className="text-stone-700">{po.customer_address || po.customer_city || 'Not provided yet'}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                                <select
                                  onChange={(e) => {
                                    const cust = customers.find((c) => c.id === e.target.value);
                                    if (cust) handleAssignCustomerToOrder(po.id, cust);
                                  }}
                                  defaultValue=""
                                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 focus:border-stone-900 focus:outline-hidden"
                                >
                                  <option value="" disabled>Select from existing customers...</option>
                                  {customers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} ({c.phone}) {c.state_city ? `- ${c.state_city}` : ''}
                                    </option>
                                  ))}
                                </select>
                                <span className="text-xs text-stone-400">or click &ldquo;+ Add / Assign Customer&rdquo; above</span>
                              </div>
                            )}
                          </div>

                          {/* Items & Financial Overview */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl bg-amber-50/40 border border-amber-100 p-3 text-xs">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-stone-400 block">Total Pieces</span>
                              <span className="font-extrabold text-stone-900">{pieces} pcs</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-stone-400 block">Product Total</span>
                              <span className="font-extrabold text-[#b86200]">₦{amount.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-stone-400 block">Est. Shipping</span>
                              <span className="font-semibold text-stone-700">₦{Number(po.est_shipping_fee || 0).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-stone-400 block">Confirmed Shipping</span>
                              <span className="font-extrabold text-purple-700">
                                {po.final_shipping_fee ? `₦${Number(po.final_shipping_fee).toLocaleString()}` : 'Pending Arrival'}
                              </span>
                            </div>
                          </div>

                          {/* Quick Items Visual Row */}
                          {po.items && po.items.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[10px] uppercase font-bold text-stone-400">Items Ordered:</span>
                              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                                {((po.items as Record<string, unknown>[]) || []).map((it: Record<string, unknown>, idx: number) => (
                                  <div
                                    key={idx}
                                    className="flex shrink-0 items-center gap-2 rounded-lg border border-stone-200 bg-white p-1.5 pr-3 shadow-2xs"
                                  >
                                    {it.selectedImage ? (
                                      <img
                                        src={it.selectedImage as string}
                                        alt={(it.title as string) || (it.name as string) || 'Item'}
                                        className="h-9 w-9 rounded-md object-cover border border-stone-100"
                                      />
                                    ) : (
                                      <div className="h-9 w-9 rounded-md bg-stone-100 flex items-center justify-center text-stone-400 text-xs">
                                        <Package className="h-4 w-4 text-stone-400" />
                                      </div>
                                    )}
                                    <div className="text-[11px] leading-tight">
                                      <div className="font-bold text-stone-900 line-clamp-1">{String(it.title || it.name || 'Item')}</div>
                                      <div className="text-stone-500 text-[10px]">
                                        {String(it.quantity || 1)} pcs {it.selectedColor ? `• ${String(it.selectedColor)}` : ''} {it.selectedSize ? `• ${String(it.selectedSize)}` : ''}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* China Reference & Nigeria Shipping Fee Inputs */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-stone-100 text-xs">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-stone-500 uppercase">
                                China Tracking / 1688 Order #:
                              </label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  defaultValue={po.china_order_ref || ''}
                                  placeholder="e.g. 1688-294029482 or tracking #"
                                  onBlur={(e) => {
                                    if (e.target.value !== (po.china_order_ref || '')) {
                                      handleUpdateOrderStatus(po.id, status, { china_order_ref: e.target.value });
                                    }
                                  }}
                                  className="w-full rounded-lg border border-stone-300 px-2.5 py-1 text-xs focus:border-stone-900 focus:outline-hidden"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-stone-500 uppercase">
                                Confirmed Nigeria Shipping Fee (₦):
                              </label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  defaultValue={po.final_shipping_fee || ''}
                                  placeholder="Exact fee when parcel lands in Nigeria"
                                  onBlur={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : null;
                                    if (val !== po.final_shipping_fee) {
                                      handleUpdateOrderStatus(po.id, status, { final_shipping_fee: val });
                                    }
                                  }}
                                  className="w-full rounded-lg border border-stone-300 px-2.5 py-1 text-xs focus:border-stone-900 focus:outline-hidden"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Shipment delay controls, available after shipment */}
                          {(status === 'shipped' || po.is_delayed) && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-xs font-bold text-amber-900">Customer tracking delay notice</p>
                                  <p className="text-[11px] text-amber-800">Edit the message and revised arrival date shown to the customer.</p>
                                </div>
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleUpdateOrderStatus(po.id, status, po.is_delayed
                                    ? { is_delayed: false, delay_reason: null, revised_arrival_date: null }
                                    : { is_delayed: true })}
                                  className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${po.is_delayed ? 'border border-stone-300 bg-white text-stone-700' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
                                >{po.is_delayed ? 'Clear delay notice' : 'Mark as delayed'}</button>
                              </div>
                              {po.is_delayed && <div className="grid gap-2 sm:grid-cols-2">
                                <input
                                  type="text"
                                  defaultValue={po.delay_reason || ''}
                                  placeholder="Customer-facing delay update"
                                  aria-label="Customer-facing delay update"
                                  onBlur={(e) => { if (e.target.value !== (po.delay_reason || '')) handleUpdateOrderStatus(po.id, status, { delay_reason: e.target.value || null }); }}
                                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                                />
                                <input
                                  type="date"
                                  defaultValue={po.revised_arrival_date || ''}
                                  aria-label="Revised estimated arrival date"
                                  onBlur={(e) => { if (e.target.value !== (po.revised_arrival_date || '')) handleUpdateOrderStatus(po.id, status, { revised_arrival_date: e.target.value || null }); }}
                                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                                />
                              </div>}
                            </div>
                          )}

                          {/* Status Stepper & Action Controls */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 border-t border-stone-100">
                            {/* Manual status dropdown */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-stone-600">Update Status:</span>
                              <select
                                value={status}
                                onChange={(e) => handleUpdateOrderStatus(po.id, e.target.value)}
                                disabled={isUpdating}
                                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800 focus:border-stone-900 focus:outline-hidden"
                              >
                                <option value="pending">Pending Payment</option>
                                {status === 'pending' && <option value="cancelled">Cancel Unpaid Order</option>}
                                <option value="paid">Paid (Payment Confirmed)</option>
                                <option value="ordered">Ordered from China</option>
                                <option value="shipped">Shipped (In Transit)</option>
                                <option value="ready_for_delivery">Ready in Nigeria</option>
                                <option value="delivered">Delivered</option>
                                {status === 'cancelled' && <option value="cancelled">Cancelled</option>}
                              </select>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Unpaid orders can be cancelled before fulfillment starts */}
                              {status === 'pending' && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => {
                                    if (window.confirm(`Cancel unpaid order #${po.id}?`)) {
                                      handleUpdateOrderStatus(po.id, 'cancelled');
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  <span>Cancel Unpaid Order</span>
                                </button>
                              )}

                              {/* One-click advance button */}
                              {status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderStatus(po.id, 'paid')}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs transition"
                                >
                                  <CreditCard className="h-3.5 w-3.5" />
                                  <span>Mark as Paid</span>
                                </button>
                              )}
                              {status === 'paid' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderStatus(po.id, 'ordered')}
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow-2xs transition"
                                >
                                  <span>Mark Ordered (China)</span>
                                </button>
                              )}
                              {status === 'ordered' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderStatus(po.id, 'shipped')}
                                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-2xs transition"
                                >
                                  <span>Mark Shipped</span>
                                </button>
                              )}
                              {status === 'shipped' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderStatus(po.id, 'ready_for_delivery')}
                                  className="inline-flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700 shadow-2xs transition"
                                >
                                  <span>Mark Ready in Nigeria</span>
                                </button>
                              )}
                              {status === 'ready_for_delivery' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderStatus(po.id, 'delivered')}
                                  className="inline-flex items-center gap-1 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-black shadow-2xs transition"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Mark Delivered</span>
                                </button>
                              )}

                              {/* WhatsApp Status Update Notification */}
                              <button
                                type="button"
                                onClick={() => handleSendCustomerWhatsAppUpdate(po)}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
                                title="Send WhatsApp status update to customer"
                              >
                                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                                <span>WhatsApp Update</span>
                              </button>

                              {/* View Catalog */}
                              <a
                                href={`/order?id=${po.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50 transition shadow-2xs"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-stone-500" />
                                <span>Catalog Sheet</span>
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: CUSTOMERS DIRECTORY                                */}
          {/* ========================================================= */}
          {adminActiveSubTab === 'customers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-700">
                  Registered Customers ({customers.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAssigningToOrderId(null);
                    setShowCustomerModal(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#fa9d26] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#e68c1d] shadow-2xs transition"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Add Customer</span>
                </button>
              </div>

              {customers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/50 p-8 text-center space-y-2">
                  <p className="text-xs font-semibold text-stone-600">No customers registered yet.</p>
                  <p className="text-[11px] text-stone-400">
                    Click &ldquo;+ Add Customer&rdquo; or assign customer information directly when reviewing preorders.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {customers.map((c) => {
                    const custOrders = preorders.filter((po) => po.customer_id === c.id || po.customer_phone === c.phone);
                    const totalSpent = custOrders.reduce((sum, po) => sum + Number(po.total_amount || 0), 0);

                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-stone-200 bg-stone-50/40 p-4 space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-xs font-bold text-stone-900">{c.name}</h4>
                            <a
                              href={`https://wa.me/${(c.phone || '').replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1 mt-0.5"
                            >
                              <Phone className="h-3 w-3" />
                              <span>{c.phone}</span>
                            </a>
                          </div>

                          <span className="rounded-full bg-stone-100 border border-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                            {custOrders.length} orders
                          </span>
                        </div>

                        {c.delivery_address && (
                          <div className="text-[11px] text-stone-600 flex items-start gap-1">
                            <MapPin className="h-3 w-3 text-stone-400 shrink-0 mt-0.5" />
                            <span>{c.delivery_address} {c.state_city ? `(${c.state_city})` : ''}</span>
                          </div>
                        )}

                        {c.instagram_handle && (
                          <div className="text-[11px] text-stone-500">
                            Instagram: <span className="font-semibold text-stone-800">@{c.instagram_handle.replace('@', '')}</span>
                          </div>
                        )}

                        {c.notes && (
                          <div className="text-[10px] text-stone-400 italic">
                            &ldquo;{c.notes}&rdquo;
                          </div>
                        )}

                        <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-xs">
                          <span className="font-bold text-[#b86200]">
                            ₦{totalSpent.toLocaleString()} spent
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setOrderCustomerFilter(c.id);
                              setAdminActiveSubTab('pipeline');
                            }}
                            className="text-[11px] font-bold text-amber-700 hover:underline"
                          >
                            View Orders ({custOrders.length}) →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
          </div>
        )}

        {/* ========================================================= */}
        {/* ADD / EDIT CUSTOMER MODAL                                 */}
        {/* ========================================================= */}
        {showCustomerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-950/60 backdrop-blur-xs overflow-y-auto">
            <div className="relative w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center text-[#fa9d26]">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">
                      {assigningToOrderId ? `Assign Customer to Order #${assigningToOrderId}` : 'Add New Customer'}
                    </h3>
                    <p className="text-[11px] text-stone-500">Save details for order tracking and fulfillment.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomerModal(false);
                    setAssigningToOrderId(null);
                  }}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700">Customer Full Name *</label>
                  <input
                    type="text"
                    required
                    value={custFormName}
                    onChange={(e) => setCustFormName(e.target.value)}
                    placeholder="e.g. Maryam Adeleke"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium focus:border-stone-900 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700">Phone / WhatsApp Number *</label>
                  <input
                    type="text"
                    required
                    value={custFormPhone}
                    onChange={(e) => setCustFormPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium focus:border-stone-900 focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700">State / City</label>
                    <input
                      type="text"
                      value={custFormCity}
                      onChange={(e) => setCustFormCity(e.target.value)}
                      placeholder="e.g. Lagos, Ikeja"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs focus:border-stone-900 focus:outline-hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700">Instagram Handle</label>
                    <input
                      type="text"
                      value={custFormInstagram}
                      onChange={(e) => setCustFormInstagram(e.target.value)}
                      placeholder="e.g. @maryam_style"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs focus:border-stone-900 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700">Delivery Street Address</label>
                  <textarea
                    rows={2}
                    value={custFormAddress}
                    onChange={(e) => setCustFormAddress(e.target.value)}
                    placeholder="Full street address for courier dispatch..."
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs focus:border-stone-900 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700">Admin Notes / Preferences</label>
                  <input
                    type="text"
                    value={custFormNotes}
                    onChange={(e) => setCustFormNotes(e.target.value)}
                    placeholder="e.g. Prefers GIG Logistics / Regular buyer"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs focus:border-stone-900 focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomerModal(false);
                      setAssigningToOrderId(null);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCustomer}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#fa9d26] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#e68c1d] shadow-2xs transition disabled:opacity-50"
                  >
                    {savingCustomer ? 'Saving...' : 'Save Customer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {editingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-950/60 backdrop-blur-xs overflow-y-auto">
            <div className="relative w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto space-y-5">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center text-[#fa9d26]">
                    <Pencil className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">Edit Published Product</h3>
                    <p className="text-[11px] text-stone-500">Update any details for this live product.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Edit Form */}
              <form onSubmit={handleSaveEditedProduct} className="space-y-4">
                
                {/* Product Name & Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700">Product Title / Name *</label>
                    <input
                      type="text"
                      required
                      value={editingProduct.name}
                      onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                      placeholder="e.g. iPhone 15 Liquid Silicone Case"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium focus:border-stone-900 focus:outline-hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700">Category</label>
                    <select
                      value={editingProduct.categoryId}
                      onChange={(e) => setEditingProduct({ ...editingProduct, categoryId: e.target.value })}
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs focus:border-stone-900 focus:outline-hidden bg-white"
                    >
                      <option value="">(No Category / General)</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pricing & MOQ Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700">Retail Price (₦) *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={editingProduct.retailPrice}
                      onChange={(e) => setEditingProduct({ ...editingProduct, retailPrice: e.target.value })}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-900 focus:border-stone-900 focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-amber-900">Wholesale Price (₦) *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={editingProduct.wholesalePrice}
                      onChange={(e) => setEditingProduct({ ...editingProduct, wholesalePrice: e.target.value })}
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-950 focus:border-stone-900 focus:outline-hidden"
                    />
                  </div>

                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-xs font-bold text-stone-700">Wholesale MOQ (pcs) *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={editingProduct.moq}
                      onChange={(e) => setEditingProduct({ ...editingProduct, moq: e.target.value })}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-900 focus:border-stone-900 focus:outline-hidden"
                    />
                  </div>

                  {/* MOQ Scope Selector */}
                  <div className="col-span-2 sm:col-span-3 pt-2 border-t border-stone-200/80">
                    <label className="text-[11px] font-bold text-stone-700 block mb-1.5">Wholesale MOQ Rule:</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingProduct({ ...editingProduct, moqScope: 'item' })}
                        className={`rounded-lg border p-2 text-left text-xs transition ${
                          editingProduct.moqScope === 'item'
                            ? 'border-[#fa9d26] bg-amber-50 text-amber-950 font-bold'
                            : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                        }`}
                      >
                        <span className="block font-semibold">Per Item (Default)</span>
                        <span className="text-[10px] text-stone-500 font-normal">This exact item has its own MOQ</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingProduct({ ...editingProduct, moqScope: 'category' })}
                        className={`rounded-lg border p-2 text-left text-xs transition ${
                          editingProduct.moqScope === 'category'
                            ? 'border-[#fa9d26] bg-amber-50 text-amber-950 font-bold'
                            : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                        }`}
                      >
                        <span className="block font-semibold">Whole Category</span>
                        <span className="text-[10px] text-stone-500 font-normal">Applies across the whole category</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Estimated Shipping Fees */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                      <Plane className="h-3.5 w-3.5 text-sky-600" />
                      Est. Air Shipping Fee (₦)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingProduct.estAirShipping}
                      onChange={(e) => setEditingProduct({ ...editingProduct, estAirShipping: e.target.value })}
                      placeholder="e.g. 3500 (blank if Sea Only)"
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs focus:border-stone-900 focus:outline-hidden"
                    />
                    <p className="text-[10px] text-stone-500">Air delivery within 3 weeks. Leave 0 or blank if item can only ship by sea.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                      <Ship className="h-3.5 w-3.5 text-blue-600" />
                      Est. Sea Shipping Fee (₦)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingProduct.estSeaShipping}
                      onChange={(e) => setEditingProduct({ ...editingProduct, estSeaShipping: e.target.value })}
                      placeholder="e.g. 1500 (blank if Air Only)"
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs focus:border-stone-900 focus:outline-hidden"
                    />
                    <p className="text-[10px] text-stone-500">Sea cargo delivery within 3 months. Leave 0 or blank if item can only ship by air.</p>
                  </div>
                </div>

                {/* Sizes & Colors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700">Available Sizes (optional)</label>
                    <input
                      type="text"
                      value={editingProduct.size}
                      onChange={(e) => setEditingProduct({ ...editingProduct, size: e.target.value })}
                      placeholder="e.g. iPhone 13, iPhone 14, iPhone 15 Pro Max (or S, M, L)"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs focus:border-stone-900 focus:outline-hidden"
                    />
                    <p className="text-[10px] text-stone-400">Separate by commas. Leave empty for items without size variants.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700">Available Colors (optional)</label>
                    <input
                      type="text"
                      value={editingProduct.colors}
                      onChange={(e) => setEditingProduct({ ...editingProduct, colors: e.target.value })}
                      placeholder="e.g. Black, White, Baby Pink, Lavender"
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs focus:border-stone-900 focus:outline-hidden"
                    />
                    <p className="text-[10px] text-stone-400">Separate by commas. Leave empty for items without colors.</p>
                  </div>
                </div>

                {/* Description / Notes */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700">Description / Specifications / Notes</label>
                  <textarea
                    rows={3}
                    value={editingProduct.description}
                    onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                    placeholder="Material, features, packaging details, or private notes..."
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-xs focus:border-stone-900 focus:outline-hidden"
                  />
                </div>

                {/* Manage Photos in Edit Modal */}
                <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/70 p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5 text-[#fa9d26]" />
                        Product Photos ({editingProduct.images.length})
                      </span>
                      <p className="text-[10px] text-stone-500">Click &ldquo;Main&rdquo; to set primary photo, or upload additional angles.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    {editingProduct.images.map((img, idx) => {
                      const isMain = img === editingProduct.imageUrl || (idx === 0 && !editingProduct.imageUrl);
                      return (
                        <div key={idx} className="relative group shrink-0">
                          <img
                            src={img}
                            alt={`Photo ${idx + 1}`}
                            onClick={() => handleSetMainPhotoInEditingProduct(img)}
                            className={`h-16 w-16 rounded-lg object-contain bg-white p-1 cursor-pointer transition ${
                              isMain
                                ? 'border-2 border-[#fa9d26] shadow-2xs'
                                : 'border border-stone-300 hover:border-[#fa9d26]'
                            }`}
                          />
                          {isMain ? (
                            <span className="absolute -top-1.5 -left-1.5 rounded-full bg-[#fa9d26] px-1.5 py-0.2 text-[9px] font-bold text-white shadow-2xs">
                              Main
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetMainPhotoInEditingProduct(img)}
                              className="absolute bottom-1 left-1 right-1 rounded bg-stone-900/80 px-1 py-0.5 text-[8px] font-bold text-white opacity-0 group-hover:opacity-100 transition text-center"
                            >
                              Make Main
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemovePhotoFromEditingProduct(img)}
                            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold hover:bg-red-700 shadow-2xs"
                            title="Remove photo"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}

                    {/* Upload new photo directly into edit modal */}
                    <label className="flex h-16 w-24 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-amber-300 bg-white hover:border-[#fa9d26] hover:bg-amber-100/50 transition text-center p-1">
                      <Plus className="h-4 w-4 text-stone-700" />
                      <span className="text-[10px] font-bold text-stone-800 leading-tight mt-0.5">
                        {uploadingEditPhoto ? 'Uploading…' : '+ Add Photo'}
                      </span>
                      <input
                        type="file"
                        accept="image/*,image/jpeg,image/png,image/webp,image/heic"
                        multiple
                        disabled={uploadingEditPhoto}
                        onChange={(e) => {
                          handleUploadPhotoToEditingProduct(e.target.files);
                          e.target.value = '';
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                {/* Modal Action Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    disabled={savingEdit}
                    className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#fa9d26] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#e68c1d] transition disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {savingEdit ? 'Saving Changes...' : 'Save Changes'}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
