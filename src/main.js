import '@fontsource-variable/unbounded';
import '@fontsource-variable/onest';
import './style.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const mm = gsap.matchMedia();

const unsplash = (id, w, h) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&q=72&w=${w}${h ? `&h=${h}` : ''}`;

/* ==========================================================================
   Плавный скролл
   ========================================================================== */

let lenis = null;

function initLenis() {
  if (reduceMotion) return;
  lenis = new Lenis({ duration: 1.15, smoothWheel: true, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function scrollToTarget(target, offset = -72) {
  if (lenis) lenis.scrollTo(target, { offset, duration: 1.4 });
  else {
    const y = target.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
}

function initAnchors() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    if (hash === '#') return e.preventDefault();
    const target = $(hash);
    if (!target) return;
    e.preventDefault();

    if (link.dataset.mode) setRequestMode(link.dataset.mode);
    if (link.dataset.service) pickService(link.dataset.service);

    closeMenu();
    scrollToTarget(target);
    if (hash === '#request') {
      setTimeout(() => $('input[name="name"]')?.focus({ preventScroll: true }), 1500);
    }
  });
}

/* ==========================================================================
   Загрузка и выход hero
   ========================================================================== */

function heroIntro() {
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.fromTo('[data-hero-media] img', { scale: 1.28 }, { scale: 1, duration: 2.4, ease: 'power3.out' }, 0)
    .from('.hero__title .line > span', { yPercent: 112, duration: 1.4, stagger: 0.11 }, 0.15)
    .from('[data-hero-fade]', { y: 30, autoAlpha: 0, duration: 1.2, stagger: 0.1 }, 0.7)
    .from('[data-nav]', { autoAlpha: 0, duration: 1.4, ease: 'power2.out' }, 0.8)
    .from('[data-hero-specs]', { scaleX: 0, transformOrigin: 'left center', duration: 1.2, ease: 'power3.inOut', clearProps: 'transform' }, 0.7)
    .from('[data-hero-specs] > div', { y: 24, autoAlpha: 0, duration: 1, stagger: 0.08 }, 1.1);

  const counter = $('[data-count]');
  if (counter) {
    const end = Number(counter.dataset.count);
    const state = { v: 0 };
    tl.to(state, {
      v: end,
      duration: 2,
      ease: 'power2.out',
      onUpdate: () => (counter.textContent = Math.round(state.v).toLocaleString('ru-RU')),
    }, 1.1);
  }
  return tl;
}

function initLoader() {
  const loader = $('.loader');
  if (reduceMotion) {
    loader?.remove();
    const counter = $('[data-count]');
    if (counter) counter.textContent = Number(counter.dataset.count).toLocaleString('ru-RU');
    return;
  }

  document.documentElement.classList.add('is-locked');
  lenis?.stop();
  window.scrollTo(0, 0);

  const heroImg = $('[data-hero-media] img');
  const imgReady = new Promise((res) => {
    if (heroImg.complete) res();
    else {
      heroImg.addEventListener('load', res, { once: true });
      heroImg.addEventListener('error', res, { once: true });
    }
  });
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  const cap = new Promise((res) => setTimeout(res, 3500));
  const assets = Promise.race([Promise.all([imgReady, fontsReady]), cap]);

  const count = $('[data-loader-count]');
  const bar = $('.loader__bar span');
  const state = { v: 0 };
  const paint = () => {
    count.textContent = String(Math.round(state.v)).padStart(3, '0');
    bar.style.transform = `scaleX(${state.v / 100})`;
  };

  // до 80% идём сами, остаток — когда реально готовы картинка и шрифты
  const warmup = gsap.to(state, { v: 80, duration: 1.1, ease: 'power2.out', onUpdate: paint });

  assets.then(() => {
    warmup.kill();
    gsap.timeline()
      .to(state, { v: 100, duration: 0.5, ease: 'power2.inOut', onUpdate: paint })
      .to('.loader__inner', { y: -40, autoAlpha: 0, duration: 0.6, ease: 'power3.in' }, '+=0.1')
      .to(loader, { yPercent: -100, duration: 1.1, ease: 'expo.inOut' }, '-=0.15')
      .add(() => {
        document.documentElement.classList.remove('is-locked');
        lenis?.start();
      }, '-=0.5')
      .add(heroIntro(), '-=0.85')
      .add(() => {
        loader.remove();
        ScrollTrigger.refresh();
      });
  });
}

/* ==========================================================================
   Навигация и меню
   ========================================================================== */

const menu = $('[data-menu]');
const burger = $('[data-burger]');

function closeMenu() {
  if (!menu.classList.contains('is-open')) return;
  menu.classList.remove('is-open');
  menu.setAttribute('aria-hidden', 'true');
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Открыть меню');
  document.documentElement.classList.remove('is-locked');
  lenis?.start();
}

function openMenu() {
  menu.classList.add('is-open');
  menu.setAttribute('aria-hidden', 'false');
  burger.setAttribute('aria-expanded', 'true');
  burger.setAttribute('aria-label', 'Закрыть меню');
  document.documentElement.classList.add('is-locked');
  lenis?.stop();
}

function initNav() {
  const nav = $('[data-nav]');
  const dock = $('[data-dock]');
  let lastY = window.scrollY;
  let requestInView = false;

  burger.addEventListener('click', () => (menu.classList.contains('is-open') ? closeMenu() : openMenu()));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());
  window.matchMedia('(min-width: 1181px)').addEventListener('change', closeMenu);

  new IntersectionObserver(([entry]) => {
    requestInView = entry.isIntersecting;
    update();
  }, { threshold: 0.15 }).observe($('#request'));

  function update() {
    const y = window.scrollY;
    const down = y > lastY;
    nav.classList.toggle('is-solid', y > 40);
    if (Math.abs(y - lastY) > 6) {
      nav.classList.toggle('is-hidden', down && y > 300 && !menu.classList.contains('is-open'));
      lastY = y;
    }
    dock.classList.toggle('is-visible', y > window.innerHeight * 0.75 && !requestInView);
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
}

/* ==========================================================================
   Скролл-анимации
   ========================================================================== */

function initGallery() {
  // Создаём первым: пин меняет высоту страницы, остальные триггеры считаются после него
  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    const track = $('[data-gallery-track]');
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);

    const slide = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: '[data-gallery-pin]',
        pin: true,
        scrub: 0.8,
        start: 'top top',
        end: () => `+=${distance()}`,
        invalidateOnRefresh: true,
        anticipatePin: 1,
      },
    });

    $$('.car__img img', track).forEach((img) => {
      if (finePointer) {
        const car = img.closest('.car');
        car.addEventListener('pointerenter', () => gsap.to(img, { scale: 1.06, duration: 1.2, ease: 'expo.out', overwrite: 'auto' }));
        car.addEventListener('pointerleave', () => gsap.to(img, { scale: 1, duration: 1.2, ease: 'expo.out', overwrite: 'auto' }));
      }
      gsap.fromTo(img, { xPercent: 6 }, {
        xPercent: -6,
        ease: 'none',
        scrollTrigger: {
          trigger: img.parentElement,
          containerAnimation: slide,
          start: 'left right',
          end: 'right left',
          scrub: true,
        },
      });
    });
  });
}

function initReveals() {
  if (reduceMotion) return;

  // Крупные заголовки: строки выезжают из-под маски
  $$('[data-lines]').forEach((el) => {
    gsap.from($$('.line > span', el), {
      yPercent: 112,
      duration: 1.3,
      ease: 'expo.out',
      stagger: 0.1,
      scrollTrigger: { trigger: el, start: 'top 86%' },
    });
  });

  ScrollTrigger.batch('[data-fade]', {
    start: 'top 90%',
    once: true,
    onEnter: (els) => gsap.to(els, { y: 0, autoAlpha: 1, duration: 1.1, ease: 'power3.out', stagger: 0.09, overwrite: true }),
  });
  gsap.set('[data-fade]:not([data-hero-fade])', { y: 28, autoAlpha: 0 });

  // Фото открываются шторкой снизу вверх
  $$('[data-clip]').forEach((el) => {
    const img = $('img', el);
    gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 82%' } })
      .fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.inOut' })
      .fromTo(img, { scale: 1.3 }, { scale: 1, duration: 1.9, ease: 'power3.out' }, 0.1);
  });

  // Параллакс внутри рамок
  $$('[data-parallax]').forEach((img) => {
    const amount = Number(img.dataset.parallax) || 10;
    gsap.fromTo(img, { yPercent: -amount / 2 }, {
      yPercent: amount / 2,
      ease: 'none',
      scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  // Hero уходит медленнее страницы
  gsap.to('[data-hero-media]', {
    yPercent: 10,
    ease: 'none',
    scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.to('.hero__content', {
    yPercent: -14,
    autoAlpha: 0.15,
    ease: 'none',
    scrollTrigger: { trigger: '[data-hero]', start: '35% top', end: 'bottom top', scrub: true },
  });

  // Строки услуг
  gsap.from('.service > a', {
    y: 40,
    autoAlpha: 0,
    duration: 1,
    ease: 'power3.out',
    stagger: 0.08,
    scrollTrigger: { trigger: '[data-services]', start: 'top 82%' },
  });

  // Карточки отзывов въезжают сбоку
  gsap.from('.review', {
    x: 120,
    autoAlpha: 0,
    duration: 1.3,
    ease: 'expo.out',
    stagger: 0.09,
    clearProps: 'all', // иначе inline-transform GSAP перебьёт hover-подъём карточки из CSS
    scrollTrigger: { trigger: '[data-reviews]', start: 'top 85%' },
  });

  // Финальный блок раскрывается из рамки в полный экран
  gsap.fromTo('[data-final-frame]',
    { clipPath: 'inset(12% 8% 0% 8%)' },
    {
      clipPath: 'inset(0% 0% 0% 0%)',
      ease: 'none',
      scrollTrigger: { trigger: '[data-final]', start: 'top 92%', end: 'top 12%', scrub: true },
    });

  // Вордмарк в подвале
  gsap.from('[data-footer-word] span', {
    yPercent: 105,
    duration: 1.4,
    ease: 'expo.out',
    stagger: 0.06,
    scrollTrigger: { trigger: '[data-footer-word]', start: 'top 96%' },
  });
}

function initMarquee() {
  if (reduceMotion) return;
  const track = $('[data-marquee-track]');
  const loop = gsap.to(track, { xPercent: -50, duration: 32, ease: 'none', repeat: -1 });
  const skew = gsap.quickTo(track, 'skewX', { duration: 0.5, ease: 'power3.out' });

  let settle;
  lenis?.on('scroll', ({ velocity }) => {
    const v = gsap.utils.clamp(-40, 40, velocity);
    loop.timeScale(1 + Math.abs(v) * 0.22);
    skew(v * -0.18);
    clearTimeout(settle);
    settle = setTimeout(() => {
      gsap.to(loop, { timeScale: 1, duration: 0.8, overwrite: true });
      skew(0);
    }, 80);
  });
}

function initProcess() {
  const rail = $('.process__rail');
  const fill = $('[data-pipe-fill]');
  const steps = $$('[data-step]');
  const vertical = () => window.matchMedia('(max-width: 1024px)').matches;

  const paint = (p) => {
    const isV = vertical();
    fill.style.transform = isV ? `scaleY(${p})` : `scaleX(${p})`;
    steps.forEach((step) => {
      const at = isV ? step.offsetTop / rail.offsetHeight : step.offsetLeft / rail.offsetWidth;
      step.classList.toggle('is-on', p >= at + 0.015 || (at === 0 && p > 0.01));
    });
  };

  if (reduceMotion) return paint(1);

  ScrollTrigger.create({
    trigger: rail,
    start: 'top 78%',
    end: 'bottom 62%',
    scrub: 0.6,
    onUpdate: (self) => paint(self.progress),
    onRefresh: (self) => paint(self.progress),
  });
}

/* ==========================================================================
   Интерактив
   ========================================================================== */

function initMagnetic() {
  if (!finePointer || reduceMotion) return;
  $$('[data-magnetic]').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
    const y = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - (r.left + r.width / 2)) * 0.22);
      y((e.clientY - (r.top + r.height / 2)) * 0.3);
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)', overwrite: true });
    });
  });
}

function initServiceThumbs() {
  // фото внутри строки — для планшетов и телефонов (на десктопе скрыто стилями)
  $$('.service').forEach((li) => {
    const thumb = document.createElement('span');
    thumb.className = 'service__thumb';
    thumb.setAttribute('data-clip', '');
    const img = new Image();
    img.loading = 'lazy';
    img.alt = '';
    img.src = li.dataset.img;
    img.dataset.parallax = '10';
    thumb.append(img);
    $('a', li).prepend(thumb);
  });
}

function initServicesPreview() {
  if (!finePointer) return;
  const list = $('[data-services]');
  const preview = $('[data-services-preview]');
  const items = $$('.service', list);

  mm.add('(min-width: 1280px)', () => {
    items.forEach((li) => (new Image().src = li.dataset.img));
    const img = new Image();
    img.alt = '';
    img.src = items[0].dataset.img;
    preview.append(img);

    gsap.set(preview, { xPercent: -50, yPercent: -50, scale: 0.6, rotation: -4 });
    const x = gsap.quickTo(preview, 'x', { duration: 0.7, ease: 'power3.out' });
    const y = gsap.quickTo(preview, 'y', { duration: 0.7, ease: 'power3.out' });
    const tilt = gsap.quickTo(preview, 'rotation', { duration: 0.8, ease: 'power3.out' });
    let lastX = 0;
    let active = null;

    // превью сидит в пустом слоте строки и лишь немного тянется за курсором
    const anchor = (e) => {
      const name = $('.service__name', active).getBoundingClientRect();
      const text = $('.service__text', active).getBoundingClientRect();
      const row = active.getBoundingClientRect();
      const cx = (name.right + text.left) / 2;
      const cy = row.top + row.height / 2;
      return [cx + (e.clientX - cx) * 0.05, cy + (e.clientY - cy) * 0.35];
    };
    const move = (e) => {
      if (!active) return;
      const [tx, ty] = anchor(e);
      x(tx);
      y(ty);
      tilt(gsap.utils.clamp(-7, 7, (e.clientX - lastX) * 0.35));
      lastX = e.clientX;
    };
    const show = (li, e) => {
      const wasHidden = !active;
      active = li;
      if (wasHidden) {
        // первое появление — сразу в слоте, без перелёта через экран
        const [tx, ty] = anchor(e);
        gsap.set(preview, { x: tx, y: ty });
        lastX = e.clientX;
      }
      if (img.getAttribute('src') !== li.dataset.img || wasHidden) {
        img.src = li.dataset.img;
        gsap.fromTo(img, { scale: 1.3 }, { scale: 1.12, duration: 0.9, ease: 'power3.out' });
      }
      gsap.to(preview, { opacity: 1, scale: 1, duration: 0.6, ease: 'expo.out', overwrite: 'auto' });
    };
    const hide = () => {
      active = null;
      gsap.to(preview, { opacity: 0, scale: 0.6, duration: 0.45, ease: 'power3.in', overwrite: 'auto' });
    };

    const enters = items.map((li) => {
      const fn = (e) => show(li, e);
      li.addEventListener('pointerenter', fn);
      return [li, fn];
    });
    list.addEventListener('pointermove', move);
    list.addEventListener('pointerleave', hide);
    // при прокрутке курсор «уезжает» со строки без события — прячем
    const onScroll = () => !list.matches(':hover') && hide();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      enters.forEach(([li, fn]) => li.removeEventListener('pointerenter', fn));
      list.removeEventListener('pointermove', move);
      list.removeEventListener('pointerleave', hide);
      window.removeEventListener('scroll', onScroll);
      gsap.set(preview, { opacity: 0 });
      img.remove();
    };
  });
}

const CASES = [
  {
    before: 'photo-1785448212806-3ef61c26f395',
    after: 'photo-1777173649680-45b71ee019d5',
    altBefore: 'До: заводская овальная насадка',
    altAfter: 'После: сдвоенные титановые насадки с побежалостью',
    name: 'Титановые насадки вместо заводских',
    text: 'Срезали штатные овальные насадки, вварили сдвоенные титановые Ø 90 мм. Посадку выставили по вырезу диффузора с зазором 8 мм по кругу.',
    time: '3 часа',
    mat: 'Титан Grade 2',
    price: '14 000 ₽',
  },
  {
    before: 'photo-1679621167140-69a9c8c1b87e',
    after: 'photo-1607282061628-106a47943a5f',
    altBefore: 'До: старый глушитель из чёрной стали',
    altAfter: 'После: новые трубы из нержавейки с аккуратными швами',
    name: 'Нержавейка вместо прогоревшей банки',
    text: 'Задняя банка прогорела по шву, трубы — в заломах после прошлого ремонта. Собрали заднюю часть заново: труба Ø 63 мм, гибы на дорне, прямоточная банка.',
    time: '1 день',
    mat: 'AISI 304, TIG',
    price: '38 000 ₽',
  },
  {
    before: 'photo-1765903916132-7d2fa8ad4c66',
    after: 'photo-1572435759312-848041b1d659',
    altBefore: 'До: заводская система, вид снизу',
    altAfter: 'После: четыре патрубка в карбоновом диффузоре',
    name: 'Система с заслонками от катализатора',
    text: 'Заводской выхлоп душил мотор после чип-тюнинга. Сделали систему целиком: даунпайп, X-пайп, две банки с электрозаслонками и раздвоение на четыре патрубка.',
    time: '4 дня',
    mat: 'AISI 304, карбон',
    price: '185 000 ₽',
  },
];

function initCompare() {
  const box = $('[data-compare]');
  const range = $('[data-compare-range]');
  const before = $('[data-compare-before]');
  const after = $('[data-compare-after]');
  const state = { p: 50 };

  const set = (p) => {
    state.p = gsap.utils.clamp(0, 100, p);
    box.style.setProperty('--pos', `${state.p}%`);
    range.value = String(Math.round(state.p));
  };
  const fromEvent = (e) => {
    const r = box.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * 100;
  };

  let dragging = false;
  box.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    box.classList.add('is-dragging');
    box.setPointerCapture(e.pointerId);
    gsap.killTweensOf(state);
    gsap.to(state, { p: fromEvent(e), duration: 0.35, ease: 'power3.out', onUpdate: () => set(state.p) });
  });
  box.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    gsap.killTweensOf(state);
    set(fromEvent(e));
  });
  const stop = () => {
    dragging = false;
    box.classList.remove('is-dragging');
  };
  box.addEventListener('pointerup', stop);
  box.addEventListener('pointercancel', stop);
  range.addEventListener('input', () => set(Number(range.value)));

  // при появлении шторка сама показывает, что её можно двигать
  if (!reduceMotion) {
    set(96);
    ScrollTrigger.create({
      trigger: box,
      start: 'top 70%',
      once: true,
      onEnter: () => gsap.to(state, { p: 50, duration: 1.8, ease: 'expo.inOut', onUpdate: () => set(state.p) }),
    });
    gsap.from(box, {
      clipPath: 'inset(0% 0% 100% 0%)',
      duration: 1.5,
      ease: 'expo.inOut',
      scrollTrigger: { trigger: box, start: 'top 85%' },
      clearProps: 'clipPath',
    });
  }

  // Переключение кейсов
  const tabs = $$('[data-works-tabs] button');
  const info = $('[data-works-info]');
  const fields = {
    name: $('[data-works-name]'),
    text: $('[data-works-text]'),
    time: $('[data-works-time]'),
    mat: $('[data-works-mat]'),
    price: $('[data-works-price]'),
  };
  CASES.forEach((c) => {
    new Image().src = unsplash(c.before, 1600, 1000);
    new Image().src = unsplash(c.after, 1600, 1000);
  });

  let current = 0;
  const swap = (i) => {
    const c = CASES[i];
    before.src = unsplash(c.before, 1600, 1000);
    after.src = unsplash(c.after, 1600, 1000);
    before.alt = c.altBefore;
    after.alt = c.altAfter;
    Object.keys(fields).forEach((k) => (fields[k].textContent = c[k]));
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      if (i === current) return;
      current = i;
      tabs.forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
      if (reduceMotion) return swap(i);

      gsap.killTweensOf(state);
      gsap.timeline()
        .to([before, after], { scale: 1.06, autoAlpha: 0, duration: 0.4, ease: 'power2.in' })
        .to(info.children, { y: -12, autoAlpha: 0, duration: 0.3, stagger: 0.03, ease: 'power2.in' }, 0)
        .add(() => swap(i))
        .set(state, { p: 88, onComplete: () => set(88) })
        .to([before, after], { scale: 1, autoAlpha: 1, duration: 0.9, ease: 'power3.out' }, '+=0.05')
        .fromTo(info.children, { y: 16 }, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.05, ease: 'power3.out' }, '<')
        .to(state, { p: 50, duration: 1.3, ease: 'expo.inOut', onUpdate: () => set(state.p) }, '<0.1');
    });
  });
}

function initReviews() {
  const vp = $('[data-reviews]');
  const prev = $('[data-reviews-prev]');
  const next = $('[data-reviews-next]');
  const step = () => ($('.review', vp).offsetWidth + 24) * (window.innerWidth > 1100 ? 2 : 1);

  const sync = () => {
    prev.disabled = vp.scrollLeft < 8;
    next.disabled = vp.scrollLeft > vp.scrollWidth - vp.clientWidth - 8;
  };
  prev.addEventListener('click', () => vp.scrollBy({ left: -step(), behavior: reduceMotion ? 'auto' : 'smooth' }));
  next.addEventListener('click', () => vp.scrollBy({ left: step(), behavior: reduceMotion ? 'auto' : 'smooth' }));
  vp.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();

  // перетаскивание мышью
  let startX = 0;
  let startLeft = 0;
  let down = false;
  vp.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true;
    startX = e.clientX;
    startLeft = vp.scrollLeft;
  });
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) vp.classList.add('is-dragging');
    vp.scrollLeft = startLeft - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    vp.classList.remove('is-dragging');
  });
}

/* ==========================================================================
   Форма заявки
   ========================================================================== */

const MODES = {
  book: { submit: 'Записаться', done: 'Вы записаны' },
  calc: { submit: 'Рассчитать стоимость', done: 'Заявка на расчёт принята' },
};
let requestMode = 'book';

function setRequestMode(mode) {
  if (!MODES[mode]) return;
  requestMode = mode;
  $$('[data-mode-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.modeTab === mode)));
  $$('[data-only]').forEach((f) => (f.hidden = f.dataset.only !== mode));
  $('[data-submit-label]').textContent = MODES[mode].submit;
}

function pickService(value) {
  const radio = $$('input[name="service"]').find((r) => r.value === value);
  if (radio) radio.checked = true;
}

function formatPhone(raw) {
  let d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d[0] === '8') d = '7' + d.slice(1);
  if (d[0] !== '7') d = '7' + d;
  d = d.slice(0, 11);
  let out = '+7';
  if (d.length > 1) out += ' ' + d.slice(1, 4);
  if (d.length > 4) out += ' ' + d.slice(4, 7);
  if (d.length > 7) out += '-' + d.slice(7, 9);
  if (d.length > 9) out += '-' + d.slice(9, 11);
  return out;
}

function initRequest() {
  const form = $('[data-request-form]');
  const done = $('[data-request-done]');
  const tabs = $('[data-request-tabs]');
  const phone = $('[data-phone]');
  const phoneError = $('[data-error-phone]');
  const dateInput = $('input[name="date"]');

  dateInput.min = new Date().toISOString().slice(0, 10);

  $$('[data-mode-tab]').forEach((t) => t.addEventListener('click', () => setRequestMode(t.dataset.modeTab)));

  phone.addEventListener('input', () => {
    phone.value = formatPhone(phone.value);
    phone.closest('.field').classList.remove('is-invalid');
    phoneError.hidden = true;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.elements.name;
    const nameOk = name.value.trim().length > 1;
    const phoneOk = phone.value.replace(/\D/g, '').length === 11;

    name.closest('.field').classList.toggle('is-invalid', !nameOk);
    phone.closest('.field').classList.toggle('is-invalid', !phoneOk);
    phoneError.hidden = phoneOk;
    if (!nameOk) return name.focus();
    if (!phoneOk) return phone.focus();

    // TODO: отправка на сервер / в CRM / в Telegram-бот. Сейчас заявка никуда не уходит.
    console.info('[demo] заявка', { mode: requestMode, ...Object.fromEntries(new FormData(form)) });

    $('[data-done-title]').textContent = MODES[requestMode].done;
    form.hidden = true;
    tabs.hidden = true;
    done.hidden = false;
    done.focus({ preventScroll: true });
    if (!reduceMotion) {
      gsap.from(done.children, { y: 24, autoAlpha: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' });
    }
  });

  $('[data-request-reset]').addEventListener('click', () => {
    form.reset();
    form.hidden = false;
    tabs.hidden = false;
    done.hidden = true;
    setRequestMode(requestMode);
  });
}

/* ==========================================================================
   Старт
   ========================================================================== */

if (reduceMotion) document.documentElement.classList.add('no-motion');

initLenis();
initServiceThumbs();
initAnchors();
initNav();
initGallery();
initReveals();
initMarquee();
initProcess();
initMagnetic();
initServicesPreview();
initCompare();
initReviews();
initRequest();
initLoader();

document.fonts?.ready.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());
