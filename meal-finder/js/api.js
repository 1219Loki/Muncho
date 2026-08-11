// ==========================================================================
// api.js — every call to TheMealDB lives here. Endpoints are unchanged from
// the original project (filter.php / lookup.php); a few read-only endpoints
// (categories.php, list.php?a=list, random.php) are added to power the new
// filters, categories strip and "Recipe of the Day" / "Surprise Me" features.
// A translation helper is added below so every dish name displays in
// English, since TheMealDB doesn't provide a separate translated-name field.
// ==========================================================================
import { getCachedTranslation, setCachedTranslation } from './storage.js';

const BASE = 'https://www.themealdb.com/api/json/v1/1';
const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

/** Search meals by a single ingredient — same endpoint the original app used */
export async function filterByIngredient(ingredient) {
  const data = await getJSON(`${BASE}/filter.php?i=${encodeURIComponent(ingredient)}`);
  return data.meals || null;
}

/**
 * Search meals using several ingredients, ranked by how many of them each
 * recipe contains. TheMealDB's free V1 tier only supports one ingredient
 * per filter.php call — true multi-ingredient filtering is a paid V2
 * feature — so this runs a filter.php call per ingredient in parallel and
 * merges the results client-side.
 *
 * Deliberately NOT a strict "must contain every ingredient" filter: with a
 * database this size, requiring an exact match on 3+ named ingredients at
 * once returns nothing almost every time, even when each ingredient
 * individually has plenty of recipes. Instead every meal that matches at
 * least one ingredient is returned, tagged with `matchCount` /
 * `matchTotal`, and sorted best-match-first — closer to how "what can I
 * make with what I have" should actually behave.
 */
export async function filterByIngredients(ingredients) {
  const list = ingredients.map((i) => i.trim()).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return filterByIngredient(list[0]);

  const results = await Promise.all(list.map((i) => filterByIngredient(i).catch(() => null)));

  const scoreMap = new Map(); // idMeal -> { meal, matchCount }
  results.forEach((set) => {
    if (!set) return;
    set.forEach((meal) => {
      const existing = scoreMap.get(meal.idMeal);
      if (existing) existing.matchCount += 1;
      else scoreMap.set(meal.idMeal, { meal, matchCount: 1 });
    });
  });
  if (scoreMap.size === 0) return null;

  return Array.from(scoreMap.values())
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 30) // cap enrichment calls to a reasonable number, best matches first
    .map(({ meal, matchCount }) => ({ ...meal, matchCount, matchTotal: list.length }));
}

/** Full detail for one meal (ingredients, instructions, video, category, area…) */
export async function lookupMeal(id) {
  const data = await getJSON(`${BASE}/lookup.php?i=${encodeURIComponent(id)}`);
  return data.meals ? data.meals[0] : null;
}

/** Enrich a list of {idMeal, strMeal, strMealThumb} with full details, in parallel.
 *  Used so we can show category / area badges and support client-side filters,
 *  since filter.php alone doesn't return that info. Failures for a single
 *  meal don't break the whole batch. */
export async function enrichMeals(meals) {
  const results = await Promise.all(
    meals.map((m) =>
      lookupMeal(m.idMeal).catch(() => null)
    )
  );
  return results.filter(Boolean);
}

/** All categories, for the "Popular Categories" strip and the category filter */
export async function getCategories() {
  const data = await getJSON(`${BASE}/categories.php`);
  return data.categories || [];
}

/** One random meal — powers "Surprise Me" and Recipe of the Day */
export async function getRandomMeal() {
  const data = await getJSON(`${BASE}/random.php`);
  return data.meals ? data.meals[0] : null;
}

/** Meals in a given category — used to seed the "Trending" section */
export async function filterByCategory(category) {
  const data = await getJSON(`${BASE}/filter.php?c=${encodeURIComponent(category)}`);
  return data.meals || [];
}

/**
 * Translate a single dish name to English (auto-detects the source
 * language). Results are cached in localStorage so a name is only ever
 * translated once. If the translation call fails for any reason — offline,
 * blocked, rate-limited — this silently falls back to the original name
 * rather than showing an error, since the name is still usable either way.
 */
export async function translateToEnglish(text) {
  if (!text) return text;
  const cached = getCachedTranslation(text);
  if (cached) return cached;

  try {
    const url = `${TRANSLATE_URL}?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('translation request failed');
    const data = await res.json();
    const translated = (data[0] || []).map((chunk) => chunk[0]).join('').trim();
    const clean = translated || text;
    setCachedTranslation(text, clean);
    return clean;
  } catch {
    return text;
  }
}

/** Adds a `strMealDisplay` field (English name) to every meal in a list,
 *  in parallel. Falls back to the original `strMeal` per-item on failure. */
export async function translateMealNames(meals) {
  return Promise.all(
    meals.map(async (m) => ({ ...m, strMealDisplay: await translateToEnglish(m.strMeal) }))
  );
}
