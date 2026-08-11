// ==========================================================================
// ui.js — pure(ish) rendering functions. Each function takes data + a DOM
// node and paints it. No fetch calls live here.
// ==========================================================================
import { escapeHTML, pseudoCookTime, pseudoRating, attachRipple } from './helpers.js';
import { isFavorite } from './storage.js';

/* ---------------- skeleton loading cards ---------------- */
export function renderSkeletons(container, count = 6) {
  container.classList.remove('notFound');
  container.innerHTML = Array.from({ length: count })
    .map(
      () => `
      <div class="skeleton-card anim-fadeIn">
        <div class="skeleton-media"></div>
        <div class="skeleton-line w-70"></div>
        <div class="skeleton-line w-40"></div>
      </div>`
    )
    .join('');
}

/* ---------------- empty / error / no-results states ---------------- */
export function renderEmptyState(container, { icon, title, text, actionLabel, actionId }) {
  container.classList.add('notFound');
  container.innerHTML = `
    <div class="state-block anim-slideUp">
      <div class="state-icon"><i class="fas ${icon}"></i></div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(text)}</p>
      ${actionLabel ? `<button class="btn btn-primary" id="${actionId}">${escapeHTML(actionLabel)}</button>` : ''}
    </div>`;
  if (actionLabel) attachRipple(container.querySelector(`#${actionId}`));
}

/* ---------------- meal grid ---------------- */
export function renderMealCards(container, meals) {
  container.classList.remove('notFound');
  container.innerHTML = meals.map(mealCardHTML).join('');
  container.querySelectorAll('.meal-card').forEach((el) => el.classList.add('reveal'));
  container.querySelectorAll('.btn, .fav-btn').forEach(attachRipple);
}

function mealCardHTML(meal) {
  const fav = isFavorite(meal.idMeal);
  const time = pseudoCookTime(meal.idMeal);
  const rating = pseudoRating(meal.idMeal);
  const category = meal.strCategory || '';
  const area = meal.strArea || '';
  const displayName = meal.strMealDisplay || meal.strMeal;
  const showOriginal = displayName.toLowerCase() !== meal.strMeal.toLowerCase();
  return `
    <article class="meal-card" data-id="${meal.idMeal}" tabindex="0" role="button" aria-label="View recipe for ${escapeHTML(displayName)}">
      <div class="meal-card-media">
        <img src="${meal.strMealThumb}" alt="${escapeHTML(displayName)}" loading="lazy">
        <div class="badge-row">
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${category ? `<span class="badge badge-category">${escapeHTML(category)}</span>` : ''}
            ${area ? `<span class="badge">${escapeHTML(area)}</span>` : ''}
          </div>
          <button class="fav-btn btn-icon${fav ? ' is-fav' : ''}" data-fav-id="${meal.idMeal}" aria-label="${fav ? 'Remove from favorites' : 'Save to favorites'}" aria-pressed="${fav}">
            <i class="fa-heart ${fav ? 'fas' : 'far'}"></i>
          </button>
        </div>
      </div>
      <div class="meal-card-body">
        <h3>${escapeHTML(displayName)}</h3>
        ${showOriginal ? `<p class="meal-card-original">${escapeHTML(meal.strMeal)}</p>` : ''}
        <div class="meal-card-meta">
          <span><i class="far fa-clock"></i> ~${time} min</span>
          <span><i class="fas fa-star"></i> ${rating}</span>
          ${meal.matchTotal > 1 ? `<span class="match-badge"><i class="fas fa-check"></i> ${meal.matchCount}/${meal.matchTotal} ingredients</span>` : ''}
        </div>
        <a href="#" class="recipe-btn" data-recipe-id="${meal.idMeal}">Get Recipe <i class="fas fa-arrow-right"></i></a>
      </div>
    </article>`;
}

/** Toggle a single card's heart icon in place (used after favoriting, so we
 *  don't have to re-render the whole grid and lose scroll position). */
export function updateCardFavoriteUI(container, id, favNow) {
  const btn = container.querySelector(`.fav-btn[data-fav-id="${id}"]`);
  if (!btn) return;
  btn.classList.toggle('is-fav', favNow);
  btn.classList.add('pop');
  btn.setAttribute('aria-pressed', String(favNow));
  const icon = btn.querySelector('i');
  icon.className = `fa-heart ${favNow ? 'fas' : 'far'}`;
  setTimeout(() => btn.classList.remove('pop'), 460);
}

/* ---------------- results count ---------------- */
export function renderResultsCount(el, n, term) {
  if (n === null) { el.textContent = ''; return; }
  el.textContent = `${n} recipe${n === 1 ? '' : 's'} found${term ? ` for “${escapeHTML(term)}”` : ''}`;
}

/* ---------------- recipe drawer ---------------- */
export function renderRecipeDrawer(contentEl, meal) {
  const ingredients = getIngredientList(meal);
  const ytId = extractYouTubeId(meal.strYoutube);
  const fav = isFavorite(meal.idMeal);
  const displayName = meal.strMealDisplay || meal.strMeal;
  const showOriginal = displayName.toLowerCase() !== meal.strMeal.toLowerCase();

  contentEl.innerHTML = `
    <div class="drawer-hero">
      <img src="${meal.strMealThumb}" alt="${escapeHTML(displayName)}">
    </div>
    <div class="drawer-body">
      <div class="recipe-tags">
        ${meal.strCategory ? `<span class="badge badge-category">${escapeHTML(meal.strCategory)}</span>` : ''}
        ${meal.strArea ? `<span class="badge">${escapeHTML(meal.strArea)} cuisine</span>` : ''}
        ${(meal.strTags || '').split(',').filter(Boolean).map((t) => `<span class="badge">${escapeHTML(t.trim())}</span>`).join('')}
      </div>
      <h2 class="recipe-title">${escapeHTML(displayName)}</h2>
      ${showOriginal ? `<p class="recipe-original-name">Original name: ${escapeHTML(meal.strMeal)}</p>` : ''}
      ${meal.strSource ? `<p class="recipe-source">Source: <a href="${meal.strSource}" target="_blank" rel="noopener">${escapeHTML(new URL(meal.strSource).hostname)}</a></p>` : '<p class="recipe-source">Recipe courtesy of TheMealDB</p>'}

      <div class="drawer-toolbar">
        <button class="btn btn-ghost${fav ? ' is-fav' : ''}" id="drawer-fav-btn" data-id="${meal.idMeal}">
          <i class="fa-heart ${fav ? 'fas' : 'far'}"></i> ${fav ? 'Saved' : 'Save recipe'}
        </button>
        <button class="btn btn-ghost" id="drawer-copy-btn"><i class="far fa-copy"></i> Copy recipe</button>
        <button class="btn btn-ghost" id="drawer-share-btn"><i class="fas fa-share-nodes"></i> Share</button>
      </div>

      <div class="drawer-section">
        <h4><i class="fas fa-carrot"></i> Ingredients</h4>
        <table class="ingredients-table">
          ${ingredients
            .map(
              (i) => `
            <tr>
              <td><img class="ing-thumb" src="https://www.themealdb.com/images/ingredients/${encodeURIComponent(i.name)}-small.png" alt="" loading="lazy">${escapeHTML(i.name)}</td>
              <td>${escapeHTML(i.measure)}</td>
            </tr>`
            )
            .join('')}
        </table>
      </div>

      <div class="drawer-section">
        <h4><i class="fas fa-list-ol"></i> Instructions</h4>
        <div class="recipe-instructions">${formatInstructions(meal.strInstructions)}</div>
      </div>

      <div class="drawer-section">
        <h4><i class="fab fa-youtube"></i> Video</h4>
        ${
          ytId
            ? `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${ytId}" title="Recipe video" allowfullscreen loading="lazy"></iframe></div>`
            : `<div class="no-video">No video available for this recipe.</div>`
        }
      </div>
    </div>
  `;
  contentEl.querySelectorAll('.btn').forEach(attachRipple);
}

function getIngredientList(meal) {
  const list = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (name && name.trim()) list.push({ name: name.trim(), measure: (measure || '').trim() || '—' });
  }
  return list;
}

function formatInstructions(text = '') {
  return text
    .split(/\r?\n+/)
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHTML(line.trim())}</p>`)
    .join('');
}

function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

/* ---------------- toasts ---------------- */
export function showToast(stackEl, message, { type = 'default', icon = 'fa-circle-check' } = {}) {
  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' toast-error' : ''}`;
  toast.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHTML(message)}</span>`;
  stackEl.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 220ms ease, transform 220ms ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px) scale(.96)';
    setTimeout(() => toast.remove(), 240);
  }, 2600);
}

/* ---------------- search suggestions dropdown ---------------- */
export function renderSuggestions(el, { recent = [], popular = [] }) {
  if (!recent.length && !popular.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    ${
      recent.length
        ? `<div class="suggestion-group-label">Recent searches</div>
           ${recent
             .map(
               (t) => `
             <div class="suggestion-item" data-term="${escapeHTML(t)}">
               <i class="fas fa-clock-rotate-left"></i><span>${escapeHTML(t)}</span>
               <i class="fas fa-xmark remove-recent" data-remove="${escapeHTML(t)}" aria-label="Remove"></i>
             </div>`
             )
             .join('')}`
        : ''
    }
    ${
      popular.length
        ? `<div class="suggestion-group-label">Popular ingredients</div>
           ${popular
             .map(
               (t) => `
             <div class="suggestion-item" data-term="${escapeHTML(t)}">
               <i class="fas fa-fire"></i><span>${escapeHTML(t)}</span>
             </div>`
             )
             .join('')}`
        : ''
    }
  `;
}

/* ---------------- categories strip ---------------- */
export function renderCategoryStrip(container, categories) {
  container.innerHTML = categories
    .slice(0, 12)
    .map(
      (c) => `
      <button class="category-card reveal" data-category="${escapeHTML(c.strCategory)}">
        <img src="${c.strCategoryThumb}" alt="${escapeHTML(c.strCategory)}" loading="lazy">
        <span>${escapeHTML(c.strCategory)}</span>
      </button>`
    )
    .join('');
}

/* ---------------- recipe of the day ---------------- */
export function renderRecipeOfDay(container, meal) {
  const displayName = meal.strMealDisplay || meal.strMeal;
  container.innerHTML = `
    <div class="rotd-media"><img src="${meal.strMealThumb}" alt="${escapeHTML(displayName)}" loading="lazy"></div>
    <div class="rotd-content">
      <span class="eyebrow"><i class="fas fa-sparkles"></i> Recipe of the day</span>
      <h3>${escapeHTML(displayName)}</h3>
      <button class="btn btn-ghost" id="rotd-view-btn" data-id="${meal.idMeal}">View recipe <i class="fas fa-arrow-right"></i></button>
    </div>`;
  attachRipple(container.querySelector('#rotd-view-btn'));
}

/* ---------------- favorites drawer/grid ---------------- */
export function renderFavoritesGrid(container, favorites) {
  if (!favorites.length) {
    renderEmptyState(container, {
      icon: 'fa-heart-crack',
      title: 'No favorites yet',
      text: 'Tap the heart on any recipe to save it here for later.',
    });
    return;
  }
  container.classList.remove('notFound');
  container.innerHTML = favorites
    .map((m) => {
      const displayName = m.strMealDisplay || m.strMeal;
      return `
    <article class="meal-card reveal" data-id="${m.idMeal}" tabindex="0" role="button">
      <div class="meal-card-media">
        <img src="${m.strMealThumb}" alt="${escapeHTML(displayName)}" loading="lazy">
        <div class="badge-row">
          <span></span>
          <button class="fav-btn btn-icon is-fav" data-fav-id="${m.idMeal}" aria-label="Remove from favorites"><i class="fas fa-heart"></i></button>
        </div>
      </div>
      <div class="meal-card-body">
        <h3>${escapeHTML(displayName)}</h3>
        <a href="#" class="recipe-btn" data-recipe-id="${m.idMeal}">Get Recipe <i class="fas fa-arrow-right"></i></a>
      </div>
    </article>`;
    })
    .join('');
  container.querySelectorAll('.btn, .fav-btn').forEach(attachRipple);
}
