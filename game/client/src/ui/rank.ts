// Your local ranked rating (Phase 6 M5, DECISIONS D-124): kept in this browser (no accounts), sent when you join a
// Ranked room's lobby, and replaced by the server's new value at the match end. Its tier and badge are ours
// (data/presentation/ranks.json): a small shape in the tier's colour, the tier's name and the number.
import { loadPresentationData, RATING_MAX, RATING_MIN, RATING_START } from "@redmond/shared";

const RATING_KEY = "redmond.rating";

/** This browser's rating (a new player's when none is kept, or storage is blocked). */
export function storedRating(): number {
  try {
    const raw = localStorage.getItem(RATING_KEY);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) ? Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(v))) : RATING_START;
  } catch {
    return RATING_START;
  }
}

export function saveRating(rating: number): void {
  try {
    localStorage.setItem(RATING_KEY, String(Math.round(rating)));
  } catch {
    // not kept; the match end still showed it
  }
}

/** The tier a rating is in: the highest whose lowest rating it reaches. */
export function tierOf(rating: number) {
  const tiers = loadPresentationData().ranks.tiers;
  let t = tiers[0];
  for (const x of tiers) if (rating >= x.min) t = x;
  return t;
}

const SHAPES: Record<ReturnType<typeof tierOf>["shape"], string> = {
  circle: '<circle cx="8" cy="8" r="6"/>',
  square: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/>',
  diamond: '<path d="M8 1.5 14.5 8 8 14.5 1.5 8Z"/>',
  hexagon: '<path d="M8 1.5 13.6 4.75v6.5L8 14.5 2.4 11.25v-6.5Z"/>',
  star: '<path d="M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.4l-4.2 2.4 1-4.6L1.3 6l4.7-.5Z"/>',
};

/** A rating as a badge: the tier's shape and name, and the number (`withNumber` false: the badge alone). */
export function rankBadge(rating: number, withNumber = true): string {
  const t = tierOf(rating);
  return `<span class="rank" title="${t.name}: local ranked ${rating}"><svg viewBox="0 0 16 16" width="14" height="14" fill="${t.color}" aria-hidden="true">${SHAPES[t.shape]}</svg>${t.name}${withNumber ? ` <b>${rating}</b>` : ""}</span>`;
}

/** A rating change in words: "1000 → 1016 (+16)". */
export const ratingChange = (from: number, to: number) => `${from} → ${to} (${to >= from ? "+" : ""}${to - from})`;
