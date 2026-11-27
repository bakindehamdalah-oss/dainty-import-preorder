export type ShippingMethod = 'air' | 'sea';

export type ShippingBatchInfo = {
  batchName: string;
  dispatchSchedule: string;
  timeline: string;
  summary: string;
  nextBatchName: string;
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function getShippingBatch(method: ShippingMethod, dateOrStr?: Date | string | null): ShippingBatchInfo {
  let d: Date;
  if (dateOrStr instanceof Date) {
    d = dateOrStr;
  } else if (typeof dateOrStr === 'string' && dateOrStr) {
    d = new Date(dateOrStr);
  } else {
    d = new Date('2026-11-27T00:00:00.000Z');
  }

  const mIndex = d.getMonth();
  const curMonth = MONTH_NAMES[mIndex];
  const nextMonth = MONTH_NAMES[(mIndex + 1) % 12];
  const day = d.getDate();

  if (method === 'air') {
    if (day <= 15) {
      return {
        batchName: `${curMonth} Batch A`,
        dispatchSchedule: 'Mid-Month Dispatch',
        timeline: 'Within 3 weeks from dispatch',
        summary: `${curMonth} Batch A (Mid-month dispatch · within 3 weeks)`,
        nextBatchName: `${curMonth} Batch B`,
      };
    } else {
      return {
        batchName: `${curMonth} Batch B`,
        dispatchSchedule: 'Month-End Dispatch',
        timeline: 'Within 3 weeks from dispatch',
        summary: `${curMonth} Batch B (Month-end dispatch · within 3 weeks)`,
        nextBatchName: `${nextMonth} Batch A`,
      };
    }
  } else {
    // Sea Cargo: dispatches every month-end
    return {
      batchName: `${curMonth} Sea Batch`,
      dispatchSchedule: 'Month-End Dispatch',
      timeline: 'Within 3 months from dispatch',
      summary: `${curMonth} Sea Batch (Month-end dispatch · within 3 months)`,
      nextBatchName: `${nextMonth} Sea Batch`,
    };
  }
}

export function getNextBatchName(currentBatch: string, method?: ShippingMethod): string {
  const isSea = method === 'sea' || currentBatch.toLowerCase().includes('sea');

  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const month = MONTH_NAMES[i];
    const nextMonth = MONTH_NAMES[(i + 1) % 12];

    if (isSea) {
      if (currentBatch.toLowerCase().includes(month.toLowerCase())) {
        return `${nextMonth} Sea Batch`;
      }
    } else {
      if (currentBatch.includes(`${month} Batch A`)) {
        return `${month} Batch B`;
      }
      if (currentBatch.includes(`${month} Batch B`)) {
        return `${nextMonth} Batch A`;
      }
    }
  }

  const fallback = getShippingBatch(isSea ? 'sea' : 'air');
  return fallback.nextBatchName;
}
