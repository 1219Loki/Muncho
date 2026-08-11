// ==========================================================================
// app.js — wires DOM events to api.js / storage.js / ui.js. This is the only
// module that holds mutable app state.
// ==========================================================================
import * as api from './api.js';
import * as store from './storage.js';
import * as ui from './ui.js';
import { debounce, attachRipple, observeReveal } from './helpers.js';

/* ---------------- DOM refs ---------------- */
const els = {
  header: document.querySelector('.site-header'),
  themeToggle: document.getElementById('theme-toggle'),
  favNavBtn: document.getElementById('fav-nav-btn'),
  favCountBadge: document.getElementById('fav-count-badge'),

  searchInput: document.getElementById('search-input'),
  searchBtn: document.getElementById('search-btn'),
  suggestions: document.getElementById('search-suggestions'),
  chipRow: document.getElementById('ingredient-chips'),

  mealSection: document.getElementById('meal-results-section'),
  mealGrid: document.getElementById('meal'),
  resultsCount: document.getElementById('results-count'),

  categoryStrip: document.getElementById('category-strip'),
  rotd: document.getElementById('recipe-of-day'),
  surpriseBtn: document.getElementById('surprise-btn'),

  drawerScrim: document.getElementById('drawer-scrim'),
  drawer: document.getElementById('recipe-drawer'),
  drawerContent: document.getElementById('recipe-drawer-content'),
  drawerCloseBtn: document.getElementById('recipe-close-btn'),

  toastStack: document.getElementById('toast-stack'),
  backToTop: document.getElementById('back-to-top'),
};

const POPULAR_INGREDIENTS = ['Chicken', 'Rice', 'Egg', 'Paneer', 'Beef', 'Fish', 'Pasta', 'Cheese'];

/* ---------------- state ---------------- */
let state = {
  rawResults: null, // enriched meal objects from the last search
  activeTerm: '',
};

/* ==========================================================================
   Init
   ========================================================================== */
function init() {
  initTheme();
  renderChips();
  wireSearch();
  wireGridClicks();
  wireDrawer();
  wireHeader();
  wireBackToTop();
  document.querySelectorAll('.btn-ghost, .btn-primary').forEach(attachRipple);

  loadCategoryStrip();
  loadRecipeOfDay();
  updateFavCount();
  observeReveal();
}

/* ==========================================================================
   Theme (dark / light, remembered)
   ========================================================================== */
function initTheme() {
  const saved = store.getTheme();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  els.themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));

  els.themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.setTheme(next);
    els.themeToggle.setAttribute('aria-pressed', String(next === 'dark'));
  });
}

/* ==========================================================================
   Ingredient chips + diet tags
   ========================================================================== */
function renderChips() {
  els.chipRow.innerHTML = POPULAR_INGREDIENTS.map((i) => `<button class="chip" data-ingredient="${i}">${i}</button>`).join('');
  els.chipRow.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    els.searchInput.value = chip.dataset.ingredient;
    runSearch(chip.dataset.ingredient);
  });
}

/* ==========================================================================
   Search: enter key, button, debounce-as-you-type suggestions
   ========================================================================== */
function wireSearch() {
  els.searchBtn.addEventListener('click', () => runSearch(els.searchInput.value));

  els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch(els.searchInput.value);
    }
  });

  const showSuggestions = debounce(() => {
    const val = els.searchInput.value.trim().toLowerCase();
    const recent = store.getRecentSearches();
    const popular = POPULAR_INGREDIENTS.filter((i) => i.toLowerCase().includes(val));
    const recentFiltered = val ? recent.filter((t) => t.toLowerCase().includes(val)) : recent;
    const popularFiltered = val ? popular : [];
    ui.renderSuggestions(els.suggestions, { recent: recentFiltered, popular: popularFiltered });
    // The suggestions dropdown and the popular-ingredient chip row occupy the
    // same space below the search bar — showing both at once causes them to
    // visually collide. Hide the chips while the dropdown has content.
    els.chipRow.classList.toggle('is-suppressed', recentFiltered.length > 0 || popularFiltered.length > 0);
  }, 150);

  els.searchInput.addEventListener('focus', showSuggestions);
  els.searchInput.addEventListener('input', showSuggestions);

  els.suggestions.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.remove-recent');
    if (removeBtn) {
      e.stopPropagation();
      store.removeRecentSearch(removeBtn.dataset.remove);
      showSuggestions();
      return;
    }
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    els.searchInput.value = item.dataset.term;
    els.suggestions.classList.add('hidden');
    els.chipRow.classList.remove('is-suppressed');
    runSearch(item.dataset.term);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.hero-search')) {
      els.suggestions.classList.add('hidden');
      els.chipRow.classList.remove('is-suppressed');
    }
  });
}

async function runSearch(termRaw) {
  const term = (termRaw || '').trim();
  if (!term) {
    ui.showToast(els.toastStack, 'Type an ingredient to search', { type: 'error', icon: 'fa-triangle-exclamation' });
    return;
  }
  const ingredients = term.split(',').map((t) => t.trim()).filter(Boolean);

  els.suggestions.classList.add('hidden');
  els.chipRow.classList.remove('is-suppressed');
  state.activeTerm = term;

  els.mealSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setSearchLoading(true);
  ui.renderSkeletons(els.mealGrid, 6);
  els.resultsCount.textContent = '';

  try {
    const basic = await api.filterByIngredients(ingredients);
    if (!basic) {
      state.rawResults = [];
      ui.renderEmptyState(els.mealGrid, {
        icon: 'fa-magnifying-glass',
        title: ingredients.length > 1 ? `No recipes found for any of “${ingredients.join(', ')}”` : `No recipes found for “${term}”`,
        text: 'Try a different ingredient, or pick one of the popular ingredients below.',
      });
      ui.renderResultsCount(els.resultsCount, null);
    } else {
      store.addRecentSearch(term);
      // enrichMeals fetches fresh full-detail objects via lookupMeal, which
      // don't carry the matchCount/matchTotal ranking info — re-attach it
      // afterwards by meal ID so the "matches X/Y ingredients" badge works.
      const matchInfo = new Map(basic.map((m) => [m.idMeal, { matchCount: m.matchCount, matchTotal: m.matchTotal }]));
      const enriched = await api.enrichMeals(basic);
      const withMatchInfo = enriched.map((m) => ({ ...m, ...(matchInfo.get(m.idMeal) || {}) }));
      const translated = await api.translateMealNames(withMatchInfo);
      state.rawResults = translated;
      applyFiltersAndRender();
    }
  } catch (err) {
    console.error('Meal search failed:', err);
    ui.renderEmptyState(els.mealGrid, {
      icon: 'fa-plug-circle-xmark',
      title: 'Something went wrong',
      text: "We couldn't reach the recipe service. Check your connection and try again.",
      actionLabel: 'Retry search',
      actionId: 'retry-search-btn',
    });
    els.mealGrid.querySelector('#retry-search-btn')?.addEventListener('click', () => runSearch(term));
    ui.renderResultsCount(els.resultsCount, null);
  } finally {
    setSearchLoading(false);
  }
}

function setSearchLoading(isLoading) {
  els.searchBtn.classList.toggle('is-loading', isLoading);
  els.searchBtn.disabled = isLoading;
}

/* ==========================================================================
   Rendering search/browse results
   ========================================================================== */
function applyFiltersAndRender() {
  if (!state.rawResults) return;
  const list = state.rawResults;

  if (!list.length) {
    ui.renderEmptyState(els.mealGrid, {
      icon: 'fa-magnifying-glass',
      title: 'No recipes found',
      text: 'Try a different ingredient, or pick one of the popular ingredients below.',
    });
  } else {
    ui.renderMealCards(els.mealGrid, list);
    observeReveal(els.mealGrid);
  }
  ui.renderResultsCount(els.resultsCount, list.length, state.activeTerm);
}

/* ==========================================================================
   Grid clicks — open recipe, toggle favorite
   ========================================================================== */
function wireGridClicks() {
  els.mealGrid.addEventListener('click', (e) => handleGridClick(e));
  els.mealGrid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('meal-card')) openRecipe(e.target.dataset.id);
  });
}

function handleGridClick(e) {
  const favBtn = e.target.closest('.fav-btn');
  if (favBtn) {
    e.preventDefault();
    e.stopPropagation();
    toggleFavoriteById(favBtn.dataset.favId, els.mealGrid);
    return;
  }
  const recipeLink = e.target.closest('[data-recipe-id]');
  if (recipeLink) {
    e.preventDefault();
    openRecipe(recipeLink.dataset.recipeId);
    return;
  }
  const card = e.target.closest('.meal-card');
  if (card) openRecipe(card.dataset.id);
}

function toggleFavoriteById(id, gridEl) {
  const meal = (state.rawResults || []).find((m) => m.idMeal === id) || store.getFavorites().find((m) => m.idMeal === id);
  if (!meal) return;
  const nowFav = store.toggleFavorite(meal);
  ui.updateCardFavoriteUI(gridEl, id, nowFav);
  updateFavCount();
  ui.showToast(els.toastStack, nowFav ? 'Saved to favorites' : 'Removed from favorites', {
    icon: nowFav ? 'fa-heart' : 'fa-heart-crack',
  });
  if (!nowFav && gridEl === els.favoritesGrid) renderFavoritesView();
}

function updateFavCount() {
  const n = store.getFavorites().length;
  els.favCountBadge.textContent = n;
  els.favCountBadge.style.display = n ? 'grid' : 'none';
}

/* ==========================================================================
   Recipe drawer
   ========================================================================== */
async function openRecipe(id) {
  if (!id) return;
  document.body.style.overflow = 'hidden';
  els.drawerScrim.classList.add('is-open');
  els.drawer.classList.add('is-open');
  els.drawerContent.innerHTML = `
    <div class="skeleton-media" style="height:280px;"></div>
    <div class="drawer-body">
      <div class="skeleton-line w-40"></div>
      <div class="skeleton-line w-70"></div>
      <div class="skeleton-line w-70"></div>
    </div>`;

  try {
    const cached = (state.rawResults || []).find((m) => m.idMeal === id && m.strInstructions);
    let meal = cached || (await api.lookupMeal(id));
    if (!meal) throw new Error('not found');
    if (!meal.strMealDisplay) meal = { ...meal, strMealDisplay: await api.translateToEnglish(meal.strMeal) };
    ui.renderRecipeDrawer(els.drawerContent, meal);
    wireDrawerActions(meal);
  } catch (err) {
    console.error('Loading recipe drawer failed:', err);
    els.drawerContent.innerHTML = `
      <div class="drawer-body" style="padding-top:var(--space-8);">
        <div class="state-block">
          <div class="state-icon"><i class="fas fa-face-frown"></i></div>
          <h3>Couldn't load this recipe</h3>
          <p>Please close this panel and try again.</p>
        </div>
      </div>`;
  }
}

function closeRecipe() {
  els.drawerScrim.classList.remove('is-open');
  els.drawer.classList.remove('is-open');
  document.body.style.overflow = '';
}

function wireDrawer() {
  els.drawerCloseBtn.addEventListener('click', closeRecipe);
  els.drawerScrim.addEventListener('click', closeRecipe);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.drawer.classList.contains('is-open')) closeRecipe();
  });
}

function wireDrawerActions(meal) {
  const favBtn = document.getElementById('drawer-fav-btn');
  favBtn?.addEventListener('click', () => {
    const nowFav = store.toggleFavorite(meal);
    favBtn.classList.toggle('is-fav', nowFav);
    favBtn.innerHTML = `<i class="fa-heart ${nowFav ? 'fas' : 'far'}"></i> ${nowFav ? 'Saved' : 'Save recipe'}`;
    updateFavCount();
    ui.showToast(els.toastStack, nowFav ? 'Saved to favorites' : 'Removed from favorites', { icon: 'fa-heart' });
    if (state.rawResults) {
      const btn = els.mealGrid.querySelector(`.fav-btn[data-fav-id="${meal.idMeal}"]`);
      if (btn) ui.updateCardFavoriteUI(els.mealGrid, meal.idMeal, nowFav);
    }
  });

  document.getElementById('drawer-copy-btn')?.addEventListener('click', async () => {
    const text = buildPlainTextRecipe(meal);
    try {
      await navigator.clipboard.writeText(text);
      ui.showToast(els.toastStack, 'Recipe copied to clipboard', { icon: 'fa-copy' });
    } catch {
      ui.showToast(els.toastStack, 'Could not copy — try selecting the text manually', { type: 'error', icon: 'fa-triangle-exclamation' });
    }
  });

  document.getElementById('drawer-share-btn')?.addEventListener('click', async () => {
    const shareData = { title: meal.strMeal, text: `Check out this recipe for ${meal.strMeal}!`, url: meal.strSource || location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        ui.showToast(els.toastStack, 'Link copied to clipboard', { icon: 'fa-link' });
      } catch {
        ui.showToast(els.toastStack, 'Sharing is not supported on this browser', { type: 'error', icon: 'fa-triangle-exclamation' });
      }
    }
  });
}

function buildPlainTextRecipe(meal) {
  const lines = [meal.strMeal, ''];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (name && name.trim()) lines.push(`- ${measure ? measure.trim() + ' ' : ''}${name.trim()}`);
  }
  lines.push('', 'Instructions:', meal.strInstructions || '');
  return lines.join('\n');
}

/* ==========================================================================
   Header (theme handled above) — favorites nav
   ========================================================================== */
function wireHeader() {
  els.favNavBtn.addEventListener('click', () => {
    document.getElementById('favorites-section').scrollIntoView({ behavior: 'smooth' });
    renderFavoritesView();
  });
}

function renderFavoritesView() {
  const grid = document.getElementById('favorites-grid');
  els.favoritesGrid = grid;
  ui.renderFavoritesGrid(grid, store.getFavorites());
  grid.removeEventListener('click', favoritesGridHandler);
  grid.addEventListener('click', favoritesGridHandler);
  observeReveal(grid);
}
function favoritesGridHandler(e) {
  const favBtn = e.target.closest('.fav-btn');
  if (favBtn) {
    e.preventDefault();
    const id = favBtn.dataset.favId;
    store.toggleFavorite({ idMeal: id });
    updateFavCount();
    renderFavoritesView();
    ui.showToast(els.toastStack, 'Removed from favorites', { icon: 'fa-heart-crack' });
    return;
  }
  const recipeLink = e.target.closest('[data-recipe-id]');
  if (recipeLink) { e.preventDefault(); openRecipe(recipeLink.dataset.recipeId); return; }
  const card = e.target.closest('.meal-card');
  if (card) openRecipe(card.dataset.id);
}

/* ==========================================================================
   Categories strip + Recipe of the Day + Surprise Me
   ========================================================================== */
async function loadCategoryStrip() {
  try {
    const categories = await api.getCategories();
    ui.renderCategoryStrip(els.categoryStrip, categories);
    els.categoryStrip.addEventListener('click', (e) => {
      const card = e.target.closest('.category-card');
      if (!card) return;
      state.activeTerm = '';
      searchByCategoryOnly(card.dataset.category);
    });
    observeReveal(els.categoryStrip);
  } catch (err) {
    console.error('Loading categories failed:', err);
    els.categoryStrip.innerHTML = `<p class="results-count">Categories are unavailable right now.</p>`;
  }
}

async function searchByCategoryOnly(category) {
  els.mealSection.scrollIntoView({ behavior: 'smooth' });
  ui.renderSkeletons(els.mealGrid, 6);
  els.resultsCount.textContent = '';
  try {
    const basic = await api.filterByCategory(category);
    const enriched = await api.enrichMeals(basic.slice(0, 24));
    const translated = await api.translateMealNames(enriched);
    state.rawResults = translated;
    applyFiltersAndRender();
  } catch (err) {
    console.error('Category browse failed:', err);
    ui.renderEmptyState(els.mealGrid, { icon: 'fa-plug-circle-xmark', title: 'Something went wrong', text: 'Please try again in a moment.' });
  }
}

async function loadRecipeOfDay() {
  try {
    let meal = store.getCachedRecipeOfDay();
    if (!meal) {
      meal = await api.getRandomMeal();
      meal.strMealDisplay = await api.translateToEnglish(meal.strMeal);
      store.setCachedRecipeOfDay(meal);
    }
    ui.renderRecipeOfDay(els.rotd, meal);
    document.getElementById('rotd-view-btn')?.addEventListener('click', (e) => openRecipe(e.currentTarget.dataset.id));
  } catch (err) {
    console.error('Loading recipe of the day failed:', err);
    els.rotd.innerHTML = `<p class="results-count">Recipe of the day is unavailable right now.</p>`;
  }
}

els.surpriseBtn?.addEventListener('click', async () => {
  els.surpriseBtn.classList.add('is-loading');
  try {
    const meal = await api.getRandomMeal();
    openRecipe(meal.idMeal);
    state.rawResults = [...(state.rawResults || []), meal];
  } catch (err) {
    console.error('Surprise me failed:', err);
    ui.showToast(els.toastStack, "Couldn't fetch a surprise recipe", { type: 'error', icon: 'fa-triangle-exclamation' });
  } finally {
    els.surpriseBtn.classList.remove('is-loading');
  }
});

/* ==========================================================================
   Back to top
   ========================================================================== */
function wireBackToTop() {
  window.addEventListener(
    'scroll',
    debounce(() => {
      els.backToTop.classList.toggle('is-visible', window.scrollY > 600);
    }, 80)
  );
  els.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ==========================================================================
   Go
   ========================================================================== */
document.addEventListener('DOMContentLoaded', init);
