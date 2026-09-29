/**
 * POST /api/lead — заявка с формы сайта → сообщение владельцу KOR.TEAM в Telegram.
 *
 * Секреты только в переменных окружения Vercel, в клиентский код они не попадают:
 *   TELEGRAM_BOT_TOKEN  токен бота от @BotFather
 *   TELEGRAM_CHAT_ID    id чата владельца (он должен один раз нажать /start у бота)
 *
 * Ответы: 200 {ok:true} — доставлено (или это повтор уже доставленной заявки);
 * любой другой статус — заявка НЕ доставлена, клиент обязан показать ошибку.
 *
 * Защита от спама и повторов:
 *   - только POST с Origin сайта, только JSON, тело до 8 КБ;
 *   - honeypot-поле и минимальное время заполнения (боту отвечаем 200, но ничего не шлём);
 *   - серверная валидация полей, ссылки в имени/марке/услуге запрещены;
 *   - повтор той же отправки (submissionId) и того же содержимого за 10 минут
 *     не дублирует сообщение, а подтверждает уже доставленное;
 *   - не больше 3 заявок в час на один телефон и 30 заявок за 10 минут на весь сайт.
 *   IP не используем: все посетители из России приходят через прокси на VPS
 *   с одним и тем же адресом.
 */
import { createHash } from 'node:crypto';
import { getCache } from '@vercel/functions';

const MAX_BODY_BYTES = 8 * 1024;
const MIN_FILL_MS = 1200;
const PHONE_LIMIT = { max: 3, ttl: 60 * 60 };
const SITE_LIMIT = { max: 30, windowSec: 10 * 60 };
const CONTENT_DEDUPE_TTL = 10 * 60;
const TELEGRAM_TIMEOUT_MS = 8000;

const MODES = { book: 'Записаться', calc: 'Рассчитать стоимость' };

// сайт, основной алиас на Vercel и превью-деплои только этой команды
const PROD_ORIGIN = /^https:\/\/(www\.)?korteam36\.ru$|^https:\/\/auto-glushak(\.vercel\.app|-(git-)?[a-z0-9-]+-banana-studio-s-projects\.vercel\.app)$/;
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// \b в JS не работает с кириллицей, поэтому границы домена заданы явно
const URL_RE = /(https?:\/\/|www\.|[a-zа-яё0-9-]+\.(ru|рф|su|com|net|org|info|biz|xyz|top|site|online|shop|store|link|click|io)(?![a-zа-яё0-9]))/giu;

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

const fail = (status, error, message, extra) => json(status, { ok: false, error, message, ...extra });

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (PROD_ORIGIN.test(origin)) return true;
  return process.env.VERCEL_ENV !== 'production' && DEV_ORIGIN.test(origin);
}

const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max + 1) : '');
const countLinks = (s) => (s.match(URL_RE) || []).length;

function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10 && d[0] === '9') d = '7' + d;
  return /^7\d{10}$/.test(d) ? d : null;
}

const formatPhone = (d) => `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;

function validate(body) {
  const errors = {};
  const name = text(body.name, 60);
  const car = text(body.car, 80);
  const service = text(body.service, 60);
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1001) : '';
  const phone = normalizePhone(body.phone);
  const mode = MODES[body.mode] ? body.mode : null;

  if (name.length < 2 || name.length > 60) errors.name = 'Укажите имя — от 2 до 60 символов.';
  else if (countLinks(name)) errors.name = 'В имени не должно быть ссылок.';
  if (!phone) errors.phone = 'Введите номер полностью: +7 и 10 цифр.';
  if (!mode) errors.mode = 'Неизвестный тип заявки.';
  if (car.length > 80 || countLinks(car)) errors.car = 'Проверьте поле «Автомобиль».';
  if (service.length > 60 || countLinks(service)) errors.service = 'Проверьте выбранную услугу.';
  if (comment.length > 1000) errors.comment = 'Комментарий длиннее 1000 символов.';
  else if (countLinks(comment) > 2) errors.comment = 'В комментарии слишком много ссылок.';

  let date = '';
  if (body.date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.date));
    const t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    if (!m || Number.isNaN(t) || t < today - 86400000 || t > today + 366 * 86400000) errors.date = 'Проверьте дату.';
    else date = `${m[3]}.${m[2]}.${m[1]}`;
  }

  const submissionId = /^[A-Za-z0-9-]{8,64}$/.test(String(body.submissionId || '')) ? body.submissionId : null;
  if (!submissionId) errors.submissionId = 'Обновите страницу и попробуйте ещё раз.';

  let page = '';
  try {
    const u = new URL(String(body.page || ''));
    if (u.protocol === 'https:' || u.protocol === 'http:') page = u.href.slice(0, 300);
  } catch {}

  return { errors, lead: { name, phone, mode, car, service, comment, date, submissionId, page } };
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildMessage(lead, receivedAt) {
  const when = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(receivedAt);
  const row = (label, value) => (value ? `<b>${label}:</b> ${escapeHtml(value)}` : null);
  return [
    `🔔 <b>Новая заявка с сайта KOR.TEAM</b>`,
    '',
    row('Тип', MODES[lead.mode]),
    row('Имя', lead.name),
    row('Телефон', formatPhone(lead.phone)),
    row('Услуга', lead.service || 'не выбрана'),
    row('Автомобиль', lead.car),
    row('Удобный день', lead.date),
    row('Комментарий', lead.comment),
    '',
    row('Получена', `${when} (МСК)`),
    row('Страница', lead.page || 'не передана'),
  ].filter((l) => l !== null).join('\n');
}

async function sendTelegram(token, chatId, message) {
  const base = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true };
    // в лог — только код и описание от Telegram, без токена и данных клиента;
    // клиенту — лишь категория, чтобы причину было видно даже без доступа к логам
    const desc = String(data.description || '');
    const code =
      res.status === 401 || res.status === 404 ? 'telegram_bad_token'
      : /chat not found/i.test(desc) ? 'telegram_chat_not_found'
      : res.status === 403 ? 'telegram_forbidden'
      : res.status === 429 ? 'telegram_rate_limited'
      : 'telegram_error';
    return { ok: false, code, reason: `telegram ${res.status}: ${desc || 'no description'}` };
  } catch (e) {
    return {
      ok: false,
      code: e.name === 'AbortError' ? 'telegram_timeout' : 'telegram_unreachable',
      reason: e.name === 'AbortError' ? 'telegram timeout' : `telegram network error: ${e.name}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Runtime Cache: общий для инстансов функции в регионе; вне Vercel — память процесса.
// Любой сбой кеша не должен ронять доставку заявки: лучше дубль, чем потерянный клиент.
function cacheClient() {
  const cache = getCache({ namespace: 'kt-lead' });
  const safe = (fn, fallback) => async (...args) => {
    try { return await fn(...args); } catch (e) { console.warn('[lead] cache unavailable:', e?.name || e); return fallback; }
  };
  return {
    get: safe((k) => cache.get(k), undefined),
    set: safe((k, v, ttl) => cache.set(k, v, { ttl, name: 'lead-guard' }), undefined),
    del: safe((k) => cache.delete(k), undefined),
  };
}

export async function POST(request) {
  if (!isAllowedOrigin(request.headers.get('origin'))) {
    return fail(403, 'forbidden_origin', 'Заявку можно отправить только с сайта.');
  }
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return fail(415, 'bad_content_type', 'Неверный формат запроса.');
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return fail(413, 'too_large', 'Слишком большой запрос.');
  let body;
  try { body = JSON.parse(raw); } catch { return fail(400, 'bad_json', 'Неверный формат запроса.'); }
  if (!body || typeof body !== 'object') return fail(400, 'bad_json', 'Неверный формат запроса.');

  // Боты: honeypot заполнен или форма отправлена мгновенно. Отвечаем «успехом», ничего не шлём.
  if (body.botcheck || (typeof body.elapsedMs === 'number' && body.elapsedMs < MIN_FILL_MS)) {
    console.info('[lead] dropped as bot:', body.botcheck ? 'honeypot' : 'too fast');
    return json(200, { ok: true });
  }

  const { errors, lead } = validate(body);
  if (Object.keys(errors).length) return fail(422, 'validation', 'Проверьте поля формы.', { fields: errors });

  // trim: при вставке в панель Vercel легко захватить пробел или перенос строки
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) {
    console.error('[lead] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set');
    return fail(503, 'not_configured', 'Приём заявок временно не работает.');
  }

  const cache = cacheClient();
  const sidKey = `sid:${lead.submissionId}`;
  const contentKey = `content:${createHash('sha256').update([lead.phone, lead.mode, lead.service, lead.date, lead.comment, lead.name.toLowerCase()].join('|')).digest('hex')}`;
  const phoneKey = `phone:${lead.phone}`;
  const siteKey = `site:${Math.floor(Date.now() / 1000 / SITE_LIMIT.windowSec)}`;

  // Повтор той же отправки (двойной клик, повтор после обрыва связи) или того же содержимого.
  const sidState = await cache.get(sidKey);
  if (sidState === 'sent') return json(200, { ok: true, duplicate: true });
  if (sidState === 'pending') return fail(409, 'in_progress', 'Заявка уже отправляется — подождите пару секунд.');
  if (await cache.get(contentKey)) return json(200, { ok: true, duplicate: true });

  const phoneCount = Number(await cache.get(phoneKey)) || 0;
  const siteCount = Number(await cache.get(siteKey)) || 0;
  if (phoneCount >= PHONE_LIMIT.max || siteCount >= SITE_LIMIT.max) {
    console.warn('[lead] rate limited:', phoneCount >= PHONE_LIMIT.max ? 'phone' : 'site');
    return fail(429, 'rate_limited', 'Слишком много заявок подряд. Позвоните нам или напишите в Telegram.');
  }

  await cache.set(sidKey, 'pending', 120);
  const sent = await sendTelegram(token, chatId, buildMessage(lead, new Date()));
  if (!sent.ok) {
    await cache.del(sidKey);
    console.error('[lead] delivery failed:', sent.reason);
    return fail(502, 'delivery_failed', 'Не удалось отправить заявку.', { reason: sent.code });
  }

  await Promise.all([
    cache.set(sidKey, 'sent', 24 * 60 * 60),
    cache.set(contentKey, 1, CONTENT_DEDUPE_TTL),
    cache.set(phoneKey, phoneCount + 1, PHONE_LIMIT.ttl),
    cache.set(siteKey, siteCount + 1, SITE_LIMIT.windowSec),
  ]);
  console.info('[lead] delivered');
  return json(200, { ok: true });
}

export function GET() {
  return json(405, { ok: false, error: 'method_not_allowed', message: 'Используйте POST.' }, { Allow: 'POST' });
}
