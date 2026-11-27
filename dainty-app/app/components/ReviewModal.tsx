'use client';

import React, { useEffect, useState } from 'react';
import { Check, MessageCircle, Package, Star, X } from 'lucide-react';
import {
  buildReviewWhatsAppUrl,
  getReviewKey,
  ProductReview,
  saveProductReview,
} from '../../lib/reviews';

type ReviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string;
  productId: string;
  productTitle: string;
  selectedColor?: string | null;
  selectedSize?: string | null;
  selectedImage?: string | null;
  whatsappNumber?: string | null;
  initialReview?: ProductReview | null;
  onReviewSaved?: (review: ProductReview) => void;
};

const QUICK_TAGS = [
  'Great Quality 🔥',
  'True to Size 👌',
  'Fast Shipping 🚀',
  'Affordable 💰',
  '100% Recommended ✨',
  'Matches Pictures 📸',
];

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent!',
};

export default function ReviewModal({
  isOpen,
  onClose,
  orderId,
  productId,
  productTitle,
  selectedColor,
  selectedSize,
  selectedImage,
  whatsappNumber,
  initialReview,
  onReviewSaved,
}: ReviewModalProps) {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [customerName, setCustomerName] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (initialReview) {
      setRating(initialReview.rating || 5);
      setCustomerName(initialReview.customerName || '');
      setComment(initialReview.comment || '');
      setSelectedTags(initialReview.tags || []);
    } else {
      setRating(5);
      setComment('');
      setSelectedTags([]);
      if (typeof window !== 'undefined') {
        const cachedName = localStorage.getItem('dainty_customer_name') || '';
        setCustomerName(cachedName);
      }
    }
    setSavedSuccess(false);
  }, [isOpen, initialReview]);

  if (!isOpen) return null;

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleSaveReview(andShareWhatsApp = false) {
    if (!comment.trim() && selectedTags.length === 0) {
      alert('Please add a comment or select at least one tag for your review.');
      return;
    }

    setIsSaving(true);
    const finalComment = comment.trim() || selectedTags.join(', ');
    const finalName = customerName.trim() || 'Preorder Customer';

    if (typeof window !== 'undefined' && customerName.trim()) {
      localStorage.setItem('dainty_customer_name', customerName.trim());
    }

    const review: ProductReview = {
      id: initialReview?.id || `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      orderId,
      productId,
      productTitle,
      selectedColor: selectedColor || null,
      selectedSize: selectedSize || null,
      selectedImage: selectedImage || null,
      rating,
      customerName: finalName,
      comment: finalComment,
      tags: selectedTags,
      createdAt: new Date().toISOString(),
    };

    await saveProductReview(review);
    setIsSaving(false);
    setSavedSuccess(true);
    if (onReviewSaved) onReviewSaved(review);

    if (andShareWhatsApp) {
      const waUrl = buildReviewWhatsAppUrl(review, whatsappNumber);
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  }

  const currentDisplayRating = hoverRating || rating;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs transition"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-stone-900">
            Review Item
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Share your feedback on this purchased item
          </p>
        </div>

        {/* Product Summary */}
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-stone-50 p-3 border border-stone-100">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white border border-stone-200">
            {selectedImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedImage}
                alt={productTitle}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-stone-400">
                <Package className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-stone-900 line-clamp-1">
              {productTitle}
            </h3>
            <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-stone-500">
              {selectedColor && <span>Color: {selectedColor}</span>}
              {selectedColor && selectedSize && <span>•</span>}
              {selectedSize && <span>Size: {selectedSize}</span>}
            </div>
            {orderId && (
              <p className="mt-0.5 font-mono text-[10px] text-stone-400">
                Order #{orderId}
              </p>
            )}
          </div>
        </div>

        {/* Star Rating */}
        <div className="mt-4 text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-stone-600">
            Your Overall Rating
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="p-1 transition transform hover:scale-115 active:scale-95"
                title={`${star} Star`}
              >
                <Star
                  className={`h-7 w-7 transition ${
                    star <= currentDisplayRating
                      ? 'fill-amber-400 text-amber-400 drop-shadow-xs'
                      : 'fill-stone-100 text-stone-300'
                  }`}
                />
              </button>
            ))}
          </div>
          <div className="mt-1 text-xs font-bold text-amber-800">
            {RATING_LABELS[currentDisplayRating] || 'Great!'}
          </div>
        </div>

        {/* Quick Feedback Tags */}
        <div className="mt-4">
          <label className="block text-xs font-bold text-stone-700">
            Quick Feedback Tags
          </label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {QUICK_TAGS.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition active:scale-95 ${
                    active
                      ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-transparent'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Name Input */}
        <div className="mt-4">
          <label className="block text-xs font-bold text-stone-700">
            Your Name / Nickname <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Dami, Chioma, or Anonymous"
            className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs focus:border-[#fa9d26] focus:bg-white focus:outline-none transition"
          />
        </div>

        {/* Comment Textarea */}
        <div className="mt-3">
          <label className="block text-xs font-bold text-stone-700">
            Written Review
          </label>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us what you liked about this item (quality, sizing, packaging)..."
            className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-xs focus:border-[#fa9d26] focus:bg-white focus:outline-none transition resize-none"
          />
        </div>

        {/* Success Alert */}
        {savedSuccess && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-300 p-2.5 text-xs font-bold text-emerald-800">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>Thank you! Your review has been saved successfully.</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-2">
          {/* Share on WhatsApp Button */}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSaveReview(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#20ba59] transition active:scale-95 disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4 fill-white shrink-0" />
            <span>Send Review to WhatsApp</span>
          </button>

          {/* Save Locally / Submit */}
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSaveReview(false)}
            className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 transition active:scale-95 disabled:opacity-50"
          >
            <span>{isSaving ? 'Saving...' : 'Save Review on Website'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
