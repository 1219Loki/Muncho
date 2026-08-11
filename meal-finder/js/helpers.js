// ==========================================================================
// helpers.js — generic, reusable utility functions (no DOM state, no API)
// ==========================================================================

/** Debounce: delay calling fn until `wait` ms after the last call */
export function debounce(fn, wait = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Escape user-supplied text before injecting into innerHTML */
export function escapeHTML(str = '') {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Capitalize the first letter of a string */
export function capitalize(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * MealDB's list/filter responses don't include prep time or rating.
 * Rather than inventing random numbers on every render (which would flicker
 * on re-render), derive a stable pseudo-value from the meal id so the same
 * meal always shows the same badge. Clearly an estimate, not real API data.
 */
export function pseudoCookTime(id) {
  const n = Number(id) || 0;
  const options = [15, 20, 25, 30, 35, 40, 45, 55];
  return options[n % options.length];
}
export function pseudoRating(id) {
  const n = Number(id) || 0;
  return (3.6 + ((n * 37) % 14) / 10).toFixed(1); // 3.6 – 5.0
}

/** Simple ripple effect for .btn elements */
export function attachRipple(el) {
  el.addEventListener('click', (e) => {
    const rect = el.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    ripple.className = 'ripple-el';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 620);
  });
}

/** Sets up an IntersectionObserver that adds .is-visible to .reveal elements */
export function observeReveal(root = document) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  root.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => io.observe(el));
  return io;
}

/** Format seconds/date helpers */
export function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
