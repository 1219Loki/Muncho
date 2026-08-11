// ==========================================================================
// storage.js — all localStorage reads/writes live here so the rest of the
// app never touches `localStorage` directly.
// ==========================================================================
import { todayKey } from './helpers.js';

const KEYS = {
  FAVORITES: 'mf_favorites',
  RECENT: 'mf_recent_searches',
  THEME: 'mf_theme',
  ROTD: 'mf_recipe_of_the_day',
  TRANSLATIONS: 'mf_translations',
};

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — fail silently, app still works in-memory */
  }
}

/* ---------------- favorites ---------------- */
export function getFavorites() {
  return safeGet(KEYS.FAVORITES, []);
}
export function isFavorite(id) {
  return getFavorites().some((m) => m.idMeal === id);
}
export function toggleFavorite(meal) {
  const favs = getFavorites();
  const idx = favs.findIndex((m) => m.idMeal === meal.idMeal);
  if (idx > -1) {
    favs.splice(idx, 1);
    safeSet(KEYS.FAVORITES, favs);
    return false;
  }
  favs.unshift({
    idMeal: meal.idMeal,
    strMeal: meal.strMeal,
    strMealDisplay: meal.strMealDisplay || meal.strMeal,
    strMealThumb: meal.strMealThumb,
  });
  safeSet(KEYS.FAVORITES, favs);
  return true;
}

/* ---------------- recent searches ---------------- */
export function getRecentSearches() {
  return safeGet(KEYS.RECENT, []);
}
export function addRecentSearch(term) {
  const clean = term.trim();
  if (!clean) return;
  let list = getRecentSearches().filter((t) => t.toLowerCase() !== clean.toLowerCase());
  list.unshift(clean);
  list = list.slice(0, 10);
  safeSet(KEYS.RECENT, list);
}
export function removeRecentSearch(term) {
  const list = getRecentSearches().filter((t) => t !== term);
  safeSet(KEYS.RECENT, list);
}

/* ---------------- theme ---------------- */
export function getTheme() {
  return safeGet(KEYS.THEME, null);
}
export function setTheme(theme) {
  safeSet(KEYS.THEME, theme);
}

/* ---------------- recipe of the day (cached per calendar day) ---------------- */
export function getCachedRecipeOfDay() {
  const cached = safeGet(KEYS.ROTD, null);
  if (cached && cached.date === todayKey()) return cached.meal;
  return null;
}
export function setCachedRecipeOfDay(meal) {
  safeSet(KEYS.ROTD, { date: todayKey(), meal });
}

/* ---------------- translation cache ----------------
   Dish names come back from TheMealDB in their original language
   (e.g. "Æbleskiver", "Kapsalon"). We translate them to English on first
   load and cache the result here, keyed by the original name, so the same
   dish never needs to be re-translated on a later visit or search. */
export function getCachedTranslation(original) {
  const map = safeGet(KEYS.TRANSLATIONS, {});
  return map[original] || null;
}
export function setCachedTranslation(original, translated) {
  const map = safeGet(KEYS.TRANSLATIONS, {});
  map[original] = translated;
  safeSet(KEYS.TRANSLATIONS, map);
}
