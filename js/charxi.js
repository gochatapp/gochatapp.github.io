/**
 * Character XI Landing Page Interactive Scripts
 * Handles the platform hint, the top ticker (cloned into a seamless marquee), the
 * mobile nav, the fake rate-plan modal (with live compound-interest math), the FAQ
 * accordion and one small confetti easter egg in the footer.
 */

// Canonical download destination — every download CTA points at the ChatGo Releases page.
const RELEASES_URL = 'https://github.com/mystupidchatapps/chatgo-releases/releases';

// Illustrative assumption used by the plan modal's compound-interest row.
const ANNUAL_RATE = 0.08;
const MONTHLY_RATE = ANNUAL_RATE / 12;

document.addEventListener('DOMContentLoaded', () => {
  initPlatformHint();
  initTicker();
  initMobileNav();
  initPlanModal();
  initFaqAccordion();
  initEasterEgg();
  initCopyrightYear();
});

/* ---------------------------------------------------------------------------
   Formatting helpers
   --------------------------------------------------------------------------- */

/**
 * Format a number as US dollars, rounded to whole dollars by default.
 * @param {number} value
 * @param {number} [decimals=0]
 * @returns {string}
 */
function money(value, decimals = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/**
 * Future value of a fixed monthly contribution, compounded monthly.
 * @param {number} monthly
 * @param {number} months
 * @returns {number}
 */
function futureValue(monthly, months) {
  if (months <= 0) return 0;
  if (MONTHLY_RATE === 0) return monthly * months;
  return monthly * ((Math.pow(1 + MONTHLY_RATE, months) - 1) / MONTHLY_RATE);
}

/* ---------------------------------------------------------------------------
   1. Platform hint — the CTA reads "your OS", so detection only sharpens the
      tooltip / accessible name instead of hard-coding a platform in the label
   --------------------------------------------------------------------------- */
function initPlatformHint() {
  const cta = document.getElementById('hero-download');
  if (!cta) return;

  const ua = window.navigator.userAgent.toLowerCase();
  const platform = (window.navigator.platform || '').toLowerCase();

  let osDisplayName = '';

  if (ua.includes('android')) {
    osDisplayName = 'Android';
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    osDisplayName = 'iOS (or a laptop)';
  } else if (ua.includes('linux') || platform.includes('linux')) {
    osDisplayName = 'Linux';
  } else if (ua.includes('mac') || platform.includes('mac')) {
    osDisplayName = 'macOS';
  } else if (ua.includes('win') || platform.includes('win')) {
    osDisplayName = 'Windows';
  }

  if (!osDisplayName) return;

  cta.title = `Looks like ${osDisplayName} — every build is on the releases page.`;
  cta.setAttribute(
    'aria-label',
    `Download Character XI for ${osDisplayName} (free, no account) — opens the releases page in a new tab`
  );
}

/* ---------------------------------------------------------------------------
   2. Top ticker — the billboard that is not allowed to sit still
   The markup ships one set of headlines. This clones that set until the strip
   is wider than the viewport (ultra-wide monitors included) and tells the CSS
   how far one whole set is, so the loop is seamless and never runs dry.
   --------------------------------------------------------------------------- */
function initTicker() {
  const ticker = document.querySelector('.ticker');
  if (!ticker) return;

  const track = ticker.querySelector('.ticker__track');
  if (!track || !track.children.length) return;

  // Remember the authored set; every rebuild starts from just these items.
  const originals = Array.from(track.children);
  let lastSignature = '';

  const build = () => {
    const setWidth = originals.reduce(
      (total, item) => total + item.getBoundingClientRect().width,
      0
    );
    if (!setWidth) return;

    // One spare set beyond the viewport keeps the strip covered at any offset.
    const copies = Math.max(2, Math.ceil(window.innerWidth / setWidth) + 1);

    // Fonts land after DOMContentLoaded and fire a second build; skipping the
    // no-op keeps the loop from restarting (i.e. snapping back to the start).
    const signature = `${copies}:${Math.round(setWidth)}`;
    if (signature === lastSignature) return;
    lastSignature = signature;

    Array.from(track.children).forEach((child) => {
      if (!originals.includes(child)) child.remove();
    });

    for (let i = 1; i < copies; i += 1) {
      originals.forEach((item) => {
        const clone = item.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      });
    }

    // One set = one loop. A percentage keeps it resolution independent.
    track.style.setProperty('--ticker-shift', `-${(100 / copies).toFixed(4)}%`);

    // Only animate once the copies exist, otherwise the banner would tear.
    ticker.classList.add('is-ready');
  };

  build();

  // Web fonts land after DOMContentLoaded; re-measure once they are here.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(build).catch(() => {});
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(build, 250);
  });

  // Hover and focus already pause it in CSS; a click/tap gives touch the same
  // control (and satisfies "let me stop that thing" without opening settings).
  ticker.addEventListener('click', () => {
    ticker.classList.toggle('is-paused');
  });
}

/* ---------------------------------------------------------------------------
   3. Mobile navigation
   --------------------------------------------------------------------------- */
function initMobileNav() {
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('nav-menu');
  if (!toggle || !menu) return;

  const closeMenu = () => {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains('is-open')) closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) closeMenu();
  });
}


/* ---------------------------------------------------------------------------
   4. Fake rate-plan modal — the reveal
   --------------------------------------------------------------------------- */
function initPlanModal() {
  const modal = document.getElementById('plan-modal');
  if (!modal) return;

  const card = modal.querySelector('.modal__card');
  const closeBtn = modal.querySelector('.modal__close');
  const plans = document.querySelectorAll('.plan[data-plan-price]');

  const fields = {
    tier: document.getElementById('modal-tier'),
    title: document.getElementById('modal-title'),
    price: document.getElementById('modal-price'),
    ten: document.getElementById('modal-ten'),
    twenty: document.getElementById('modal-twenty'),
    future: document.getElementById('modal-future'),
    tenHint: document.getElementById('modal-ten-hint'),
    twentyHint: document.getElementById('modal-twenty-hint')
  };

  let lastFocused = null;

  const openModal = (plan) => {
    const price = parseFloat(plan.getAttribute('data-plan-price')) || 5;
    const tier = plan.getAttribute('data-plan-tier') || 'Rate plan';

    if (fields.tier) fields.tier.textContent = tier;
    if (fields.title) fields.title.textContent = money(price) + ' / month, forever';
    if (fields.price) fields.price.textContent = money(price, 2) + ' / mo';
    // 10 years = 120 monthly payments, 20 years = 240. Show the multiplication so the
    // number can be audited instead of taken on faith.
    if (fields.ten) fields.ten.textContent = money(price * 120);
    if (fields.twenty) fields.twenty.textContent = money(price * 240);
    if (fields.future) fields.future.textContent = money(futureValue(price, 240));
    if (fields.tenHint) fields.tenHint.textContent = money(price) + '/mo × 120 months';
    if (fields.twentyHint) fields.twentyHint.textContent = money(price) + '/mo × 240 months';

    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  };

  const closeModal = () => {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  };

  plans.forEach((plan) => {
    plan.addEventListener('click', () => openModal(plan));
    plan.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        openModal(plan);
      }
    });
  });

  modal.querySelectorAll('[data-modal-close]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  // Keep Tab focus inside the dialog while it is open.
  if (card) {
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;

      const focusable = card.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }
}


/* ---------------------------------------------------------------------------
   5. FAQ accordion
   --------------------------------------------------------------------------- */
function initFaqAccordion() {
  const items = document.querySelectorAll('.faq__item');
  if (!items.length) return;

  items.forEach((item) => {
    const trigger = item.querySelector('.faq__trigger');
    if (!trigger) return;

    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');

      // One open answer at a time keeps the page from turning into a wall of text.
      items.forEach((other) => {
        other.classList.remove('is-open');
        const otherTrigger = other.querySelector('.faq__trigger');
        if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ---------------------------------------------------------------------------
   6. Footer easter egg — the cheapest bankruptcy in legal history
   --------------------------------------------------------------------------- */
function initEasterEgg() {
  const button = document.getElementById('easter-btn');
  if (!button) return;

  const originalMarkup = button.innerHTML;
  let busy = false;

  button.addEventListener('click', () => {
    if (busy) return;
    busy = true;

    launchConfetti();

    button.innerHTML = '<span aria-hidden="true">✓</span> Filed. Payment not required.';
    window.setTimeout(() => {
      button.innerHTML = originalMarkup;
      busy = false;
    }, 3200);
  });
}

/**
 * Sprinkle a few emoji down the viewport. Deliberately cheap and short-lived.
 */
function launchConfetti() {
  const layer = document.getElementById('confetti-layer');
  if (!layer) return;

  const glyphs = ['💸', '📉', '🧾', '⚖️', '💵', '🏦', '🪙'];
  const prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = prefersReducedMotion ? 6 : 26;

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti';
    piece.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.setProperty('--fall', (2 + Math.random() * 1.8).toFixed(2) + 's');
    piece.style.animationDelay = (Math.random() * 0.6).toFixed(2) + 's';
    piece.style.fontSize = (1 + Math.random() * 1.1).toFixed(2) + 'rem';
    layer.appendChild(piece);

    window.setTimeout(() => piece.remove(), 4800);
  }
}

/* ---------------------------------------------------------------------------
   7. Footer year
   --------------------------------------------------------------------------- */
function initCopyrightYear() {
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
}
