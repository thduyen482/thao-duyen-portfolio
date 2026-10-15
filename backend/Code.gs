/**
 * Backend thanh toán cho website Thảo Duyên — chạy trên Google Apps Script.
 * - Lưu đơn vào Google Sheet, giữ chỗ 30 phút rồi tự huỷ.
 * - Báo đơn mới qua Telegram kèm nút "Đã nhận tiền" (chỉ OWNER_ID bấm được).
 * - Bấm nút → đơn "đã xác nhận" + gửi mail xác nhận cho khách.
 *
 * Bí mật KHÔNG viết vào file này. Đặt trong Project Settings → Script properties:
 *   BOT_TOKEN   token bot lấy từ @BotFather
 *   OWNER_ID    ID Telegram của chủ shop
 *   WEBAPP_URL  link .../exec sau khi Deploy dạng Web app
 *   ALLOW_TEST  "true" để nhận dịch vụ thử 2.000đ (xoá đi sau khi thử xong)
 * Rồi chạy hàm setup() một lần.
 */

// ===== Bảng giá: phải khớp shop-config.js (web chỉ hiển thị, giá tính ở đây) =====
// Dịch vụ price 0 = đặt lịch miễn phí, báo giá sau: xác nhận ngay, không cần chuyển khoản.
const PRICES = {
  'ai-visual': { name: 'AI Visual & Canva', price: 0, booking: true },
  'thiep-cuoi': { name: 'Thiệp cưới online', price: 0, booking: true },
  'content-seo': { name: 'Content Branding & SEO', price: 0, booking: true },
  'ai-agent': { name: 'Giải pháp AI Agent', price: 0, booking: true },
  'test-2k': { name: 'Dịch vụ thử thanh toán', price: 2000, booking: true, testOnly: true },
  'lap-xuong-500': { name: 'Lạp xưởng gác bếp 500g', price: 250000 },
  'lap-xuong-1kg': { name: 'Lạp xưởng gác bếp 1kg', price: 480000 },
  'mien-dong-500': { name: 'Miến dong Bắc Kạn 500g', price: 55000 }
};
const MOCHI_PRICE = 15000;
const MOCHI_SIZES = [6, 8, 10, 12];
const TIME_SLOTS = ['09:00', '10:30', '14:00', '15:30', '19:30'];
const HOLD_MINUTES = 30;
const MAX_PENDING_PER_PHONE = 3;
const TZ = 'Asia/Ho_Chi_Minh';
const ZALO = '0369 787 972';
const SHEET_NAME = 'Don';
const COLS = ['code', 'status', 'createdAt', 'expiresAt', 'type', 'total', 'name', 'phone', 'email', 'address',
  'date', 'time', 'items', 'note', 'tgMessageId', 'confirmedAt'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WEEKDAYS = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

/* ---------- Tiện ích ---------- */
const prop = k => PropertiesService.getScriptProperties().getProperty(k);
const json = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
const h = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
const fmt = (ms, pattern) => Utilities.formatDate(new Date(ms), TZ, pattern || 'yyyy-MM-dd HH:mm:ss');
const today = () => fmt(Date.now(), 'yyyy-MM-dd');
const prettyDate = d => {
  const date = new Date(d + 'T12:00:00+07:00');
  return `${WEEKDAYS[+Utilities.formatDate(date, TZ, 'u')]}, ${Utilities.formatDate(date, TZ, 'dd/MM/yyyy')}`;
};
// Lỗi có message tiếng Việt để web hiện thẳng cho khách
function fail(code, message) { const e = new Error(code); e.code = code; e.userMessage = message; throw e; }
function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function tg(method, payload) {
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${prop('BOT_TOKEN')}/${method}`, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const body = JSON.parse(res.getContentText());
  if (!body.ok) console.error(`Telegram ${method}: ${body.description}`);
  return body;
}

/* ---------- Sheet ---------- */
function sheet() { return SpreadsheetApp.openById(prop('SHEET_ID')).getSheetByName(SHEET_NAME); }
function allOrders() {
  return sheet().getDataRange().getValues().slice(1).map((r, i) => {
    const o = { row: i + 2 };
    COLS.forEach((c, j) => o[c] = String(r[j]));
    o.expiresAt = Number(o.expiresAt);
    o.total = Number(o.total);
    return o;
  });
}
const findOrder = code => allOrders().find(o => o.code === code);
// Dấu ' đầu chuỗi: Sheet giữ nguyên dạng chữ (số 0 đầu SĐT, ngày) và không chạy công thức khách gõ vào
const cell = v => typeof v === 'string' && v ? "'" + v : v;
function setFields(o, fields) {
  const sh = sheet();
  Object.keys(fields).forEach(k => { sh.getRange(o.row, COLS.indexOf(k) + 1).setValue(cell(fields[k])); o[k] = fields[k]; });
}
// Đơn còn giữ chỗ: đã xác nhận, hoặc đang chờ và chưa quá hạn
const isLive = (o, now) => o.status === 'confirmed' || (o.status === 'pending' && o.expiresAt > now);

/* ---------- Web app ---------- */
function doGet(e) {
  const p = e.parameter || {};
  try {
    if (p.action === 'status') return json(getStatus(p.code));
    if (p.action === 'slots') return json({ ok: true, taken: takenSlots(p.date) });
    if (p.action === 'chat') return json({ ok: true, on: chatOn(), perVisitor: CHAT_PER_VISITOR }); // Chat.gs
    return json({ ok: true, service: 'thao-duyen-shop' });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server' });
  }
}

function doPost(e) {
  // Telegram gọi vào với ?tg=<TG_SECRET>. Không return gì để Apps Script đáp thẳng 200, Telegram khỏi gửi lặp.
  if (e.parameter && e.parameter.tg) {
    if (e.parameter.tg === prop('TG_SECRET')) handleTelegram(JSON.parse(e.postData.contents));
    return;
  }
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'create') return json(createOrder(body.order));
    if (body.action === 'chat') return json(chat(body));
    return json({ ok: false, error: 'unknown action' });
  } catch (err) {
    if (!err.code) console.error(err);
    return json({ ok: false, error: err.code || 'server', message: err.userMessage || '' });
  }
}

/* ---------- Tạo đơn ---------- */
function normalizeItem(it, type) {
  const id = String(it && it.id || '');
  const qty = Math.floor(Number(it && it.qty));
  if (!(qty >= 1 && qty <= 50)) fail('invalid', 'Số lượng không hợp lệ.');
  const box = id.match(/^mochi-box-(\d+)$/);
  if (box && MOCHI_SIZES.indexOf(+box[1]) >= 0)
    return { id, name: `Hộp mochi ${box[1]} viên`, detail: clean(it.detail, 200), price: +box[1] * MOCHI_PRICE, qty };
  const p = PRICES[id];
  if (!p || (p.testOnly && prop('ALLOW_TEST') !== 'true')) fail('invalid', 'Sản phẩm/dịch vụ này hiện không nhận đặt.');
  if (Boolean(p.booking) !== (type === 'booking')) fail('invalid', 'Đơn hàng không hợp lệ.');
  return { id, name: p.name, detail: type === 'booking' ? '' : clean(it.detail, 200), price: p.price, qty };
}

function createOrder(order) {
  if (!order || !Array.isArray(order.items) || !order.items.length || order.items.length > 30) fail('invalid', 'Đơn hàng không hợp lệ.');
  const type = order.type === 'booking' ? 'booking' : 'order';
  const c = order.customer || {};
  const o = {
    status: 'pending', type,
    name: clean(c.name, 80), phone: clean(c.phone, 15).replace(/\s/g, ''), email: clean(c.email, 120),
    address: type === 'order' ? clean(c.address, 250) : '', note: clean(c.note, 500),
    date: '', time: '', tgMessageId: '', confirmedAt: ''
  };
  if (!o.name) fail('invalid', 'Bạn điền giúp họ tên nhé.');
  if (!/^0\d{9}$/.test(o.phone)) fail('invalid', 'Số điện thoại cần 10 số, bắt đầu bằng 0.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) fail('invalid', 'Email chưa đúng định dạng.');
  const items = order.items.map(it => normalizeItem(it, type));
  if (type === 'booking') {
    if (items.length !== 1) fail('invalid', 'Mỗi lần đặt một lịch thôi nhé.');
    items[0].qty = 1;
    o.date = String(c.date || ''); o.time = String(c.time || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || o.date <= today()) fail('invalid', 'Ngày hẹn cần từ ngày mai trở đi.');
    if (TIME_SLOTS.indexOf(o.time) < 0) fail('invalid', 'Khung giờ không hợp lệ.');
  } else if (!o.address) fail('invalid', 'Bạn điền giúp địa chỉ giao hàng nhé.');
  o.items = JSON.stringify(items);
  o.total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const free = o.total === 0; // đặt lịch báo giá sau: xác nhận luôn
  if (free) { o.status = 'confirmed'; o.confirmedAt = fmt(Date.now()); }

  withLock(() => {
    const now = Date.now(), orders = allOrders(), live = orders.filter(x => isLive(x, now));
    if (type === 'booking' && live.some(x => x.type === 'booking' && x.date === o.date && x.time === o.time))
      fail('slot', 'Khung giờ này vừa có người giữ chỗ, bạn chọn giờ khác giúp mình nhé.');
    if (live.filter(x => x.status === 'pending' && x.phone === o.phone).length >= MAX_PENDING_PER_PHONE)
      fail('limit', 'Bạn đang có vài đơn chờ thanh toán, hoàn tất bớt rồi đặt tiếp nhé.');
    if (free && live.filter(x => x.total === 0 && x.phone === o.phone && x.date >= today()).length >= MAX_PENDING_PER_PHONE)
      fail('limit', 'Bạn đã có vài lịch hẹn sắp tới rồi, nhắn Zalo ' + ZALO + ' nếu cần đặt thêm nhé.');
    const used = new Set(orders.map(x => x.code));
    do o.code = 'TD' + Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    while (used.has(o.code));
    o.createdAt = fmt(now);
    o.expiresAt = now + HOLD_MINUTES * 60000;
    const sh = sheet();
    sh.appendRow(COLS.map(k => cell(o[k])));
    o.row = sh.getLastRow();
  });

  const sent = tg('sendMessage', free
    ? { chat_id: prop('OWNER_ID'), text: orderText(o, '📞 Lịch đã tự xác nhận và mail đã gửi khách. Nhớ liên hệ khách để trao đổi và báo giá.'), parse_mode: 'HTML' }
    : {
      chat_id: prop('OWNER_ID'), text: orderText(o), parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '✅ Đã nhận tiền', callback_data: 'paid:' + o.code }]] }
    });
  if (!sent.ok) {
    setFields(o, { status: 'error' });
    fail('telegram', 'Chưa gửi được đơn, bạn thử lại sau ít phút.');
  }
  setFields(o, { tgMessageId: String(sent.result.message_id) });
  if (free) try { sendConfirmation(o); } catch (err) { console.error(err); }
  return { ok: true, code: o.code, total: o.total, expiresAt: o.expiresAt };
}

function orderText(o, footer) {
  const items = JSON.parse(o.items);
  const L = [
    `${o.type === 'booking' ? '🆕 <b>LỊCH MỚI</b>' : '🛍 <b>ĐƠN HÀNG MỚI</b>'} · <code>${o.code}</code>`,
    o.total ? `💰 <b>${money(o.total)}</b> · nội dung CK: <code>${o.code}</code>` : '💬 Báo giá sau'
  ];
  if (o.type === 'booking') L.push(`📅 ${prettyDate(o.date)} · ${o.time}`);
  items.forEach(i => L.push(`• ${i.qty} × ${h(i.name)}${i.detail ? ' — ' + h(i.detail) : ''}`));
  L.push('', `👤 ${h(o.name)} · ${h(o.phone)}`, `✉️ ${h(o.email)}`);
  if (o.address) L.push(`📍 ${h(o.address)}`);
  if (o.note) L.push(`📝 ${h(o.note)}`);
  L.push('', footer || `⏳ Giữ chỗ đến ${fmt(o.expiresAt, 'HH:mm')}. Kiểm tra BIDV thấy tiền về đúng số tiền và nội dung thì bấm nút.`);
  return L.join('\n');
}
// Sửa lại tin nhắn đơn; không gửi reply_markup nên nút biến mất
function updateTelegram(o, footer) {
  if (o.tgMessageId) tg('editMessageText', { chat_id: prop('OWNER_ID'), message_id: Number(o.tgMessageId), text: orderText(o, footer), parse_mode: 'HTML' });
}

/* ---------- Trạng thái, khung giờ, tự huỷ ---------- */
function cancelOrder(o) {
  setFields(o, { status: 'cancelled' });
  updateTelegram(o, `⌛ <b>ĐÃ TỰ HUỶ</b> — quá ${HOLD_MINUTES} phút chưa xác nhận nhận tiền.`);
}

function getStatus(code) {
  if (!/^TD[A-Z0-9]{6}$/.test(String(code))) return { ok: false, error: 'invalid' };
  let o = findOrder(code);
  if (!o) return { ok: false, error: 'not found' };
  if (o.status === 'pending' && Date.now() > o.expiresAt) withLock(() => {
    o = findOrder(code);
    if (o.status === 'pending' && Date.now() > o.expiresAt) cancelOrder(o);
  });
  return { ok: true, status: o.status, expiresAt: o.expiresAt };
}

function takenSlots(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return [];
  const now = Date.now();
  return allOrders().filter(o => o.type === 'booking' && o.date === date && isLive(o, now)).map(o => o.time);
}

// Chạy tự động 5 phút/lần (setup() tạo trigger)
function cancelExpired() {
  withLock(() => {
    const now = Date.now();
    allOrders().filter(o => o.status === 'pending' && o.expiresAt <= now).forEach(cancelOrder);
  });
}

/* ---------- Telegram ---------- */
function handleTelegram(u) {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('u' + u.update_id)) return; // Telegram gửi lặp thì bỏ qua
    cache.put('u' + u.update_id, '1', 21600);
    if (u.callback_query) return onPaidButton(u.callback_query);
    const m = u.message;
    if (m && m.text && /^\/(start|id)\b/.test(m.text))
      tg('sendMessage', { chat_id: m.chat.id, text: `Xin chào! ID Telegram của bạn là ${m.from.id}.` });
  } catch (err) {
    console.error(err);
  }
}

function onPaidButton(q) {
  const answer = (text, alert) => tg('answerCallbackQuery', { callback_query_id: q.id, text, show_alert: Boolean(alert) });
  if (String(q.from.id) !== String(prop('OWNER_ID'))) return answer('Chỉ Thảo Duyên mới bấm được nút này.', true);
  const m = /^paid:(TD[A-Z0-9]{6})$/.exec(q.data || '');
  if (!m) return answer('Nút không hợp lệ.');

  let o, problem = '';
  withLock(() => {
    o = findOrder(m[1]);
    if (!o) problem = 'Không tìm thấy đơn này.';
    else if (o.status === 'confirmed') problem = 'Đơn này đã xác nhận rồi.';
    else if (o.status !== 'pending' || Date.now() > o.expiresAt) {
      if (o.status === 'pending') cancelOrder(o);
      problem = `Đơn đã quá ${HOLD_MINUTES} phút nên đã tự huỷ. Nếu khách đã chuyển tiền, hãy liên hệ khách.`;
    } else setFields(o, { status: 'confirmed', confirmedAt: fmt(Date.now()) });
  });
  if (problem) return answer(problem, true);

  let mailed = true;
  try { sendConfirmation(o); } catch (err) { mailed = false; console.error(err); }
  updateTelegram(o, `✅ <b>ĐÃ XÁC NHẬN</b> lúc ${fmt(Date.now(), 'HH:mm dd/MM')} — ${mailed ? `đã gửi mail tới ${h(o.email)}` : '⚠️ gửi mail lỗi, hãy báo khách giúp'}.`);
  answer(mailed ? 'Đã xác nhận, mail đã gửi cho khách ✅' : 'Đã xác nhận nhưng gửi mail bị lỗi.', !mailed);
}

/* ---------- Mail xác nhận ---------- */
function sendConfirmation(o) {
  const items = JSON.parse(o.items);
  const booking = o.type === 'booking';
  const what = booking ? 'lịch hẹn' : 'đơn hàng';
  const paid = o.total > 0;
  const rows = items.map(i => `<tr><td style="padding:8px 0">${i.qty} × ${h(i.name)}${i.detail ? `<br><small style="color:#7a6a5f">${h(i.detail)}</small>` : ''}</td><td align="right" style="padding:8px 0">${paid ? money(i.price * i.qty) : ''}</td></tr>`).join('');
  const where = booking ? `Lịch hẹn: <b>${prettyDate(o.date)} lúc ${o.time}</b>` : `Giao tới: ${h(o.address)}`;
  const next = !paid
    ? `Thảo Duyên sẽ liên hệ bạn qua số ${h(o.phone)} để trao đổi nhu cầu và báo giá trước buổi hẹn.`
    : booking ? `Thảo Duyên sẽ liên hệ bạn qua số ${h(o.phone)} trước buổi hẹn.`
    : 'Thảo Duyên sẽ báo bạn khi hàng được gửi đi.';
  const intro = paid
    ? `Thảo Duyên đã nhận được <b>${money(o.total)}</b> và ${what} của bạn đã được <b>xác nhận</b>.`
    : `Thảo Duyên đã nhận ${what} của bạn và giữ chỗ cho bạn rồi nhé.`;
  const total = paid ? `
      <tr><td style="padding:8px 0;border-top:1px solid #e3d8c9"><b>Tổng đã thanh toán</b></td><td align="right" style="border-top:1px solid #e3d8c9"><b>${money(o.total)}</b></td></tr>` : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#2b211c;line-height:1.6">
    <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:26px">Cảm ơn ${h(o.name)}!</h2>
    <p>${intro}</p>
    <p style="background:#f6efe4;padding:14px 18px;border-radius:12px">Mã đơn: <b>${o.code}</b><br>${where}</p>
    <table width="100%" style="border-collapse:collapse;border-top:1px solid #e3d8c9;border-bottom:1px solid #e3d8c9">${rows}${total}</table>
    <p>${next} Cần đổi lịch hay hỏi gì, bạn nhắn Zalo ${ZALO} nhé.</p>
    <p>— Thảo Duyên</p></div>`;
  const plain = `Cảm ơn ${o.name}! ` + (paid ? `Thảo Duyên đã nhận ${money(o.total)} và ${what} ${o.code} đã được xác nhận.` : `Thảo Duyên đã nhận ${what} ${o.code}, sẽ liên hệ báo giá.`) +
    (booking ? ` Lịch hẹn: ${prettyDate(o.date)} lúc ${o.time}.` : '') + ` Cần hỗ trợ: Zalo ${ZALO}.`;
  MailApp.sendEmail({ to: o.email, subject: `[Thảo Duyên] Xác nhận ${what} ${o.code}`, body: plain, htmlBody: html, name: 'Thảo Duyên' });
}

/* ---------- Cài đặt: chạy setup() một lần sau khi Deploy ---------- */
function setup() {
  const p = PropertiesService.getScriptProperties();
  ['BOT_TOKEN', 'OWNER_ID', 'WEBAPP_URL'].forEach(k => { if (!p.getProperty(k)) throw new Error('Thiếu Script property: ' + k); });
  const url = p.getProperty('WEBAPP_URL').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) throw new Error('WEBAPP_URL phải là link dạng https://script.google.com/macros/s/.../exec');

  let ss = p.getProperty('SHEET_ID') ? SpreadsheetApp.openById(p.getProperty('SHEET_ID')) : null;
  if (!ss) { ss = SpreadsheetApp.create('Đơn hàng — website Thảo Duyên'); p.setProperty('SHEET_ID', ss.getId()); }
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.getSheets()[0].setName(SHEET_NAME);
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }

  if (!p.getProperty('TG_SECRET')) p.setProperty('TG_SECRET', Utilities.getUuid().replace(/-/g, ''));
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'cancelExpired').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('cancelExpired').timeBased().everyMinutes(5).create();

  const hook = tg('setWebhook', { url: `${url}?tg=${p.getProperty('TG_SECRET')}`, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
  if (!hook.ok) throw new Error('Không nối được webhook Telegram: ' + hook.description);
  const hi = tg('sendMessage', { chat_id: p.getProperty('OWNER_ID'), text: `🔗 Bot đã nối với website Thảo Duyên.\nĐơn hàng lưu ở Google Sheet: ${ss.getUrl()}` });
  if (!hi.ok) throw new Error('Bot chưa nhắn được cho bạn (' + hi.description + '). Mở bot trên Telegram, bấm Start rồi chạy lại setup.');
  console.log('Xong! Sheet đơn hàng: ' + ss.getUrl());
}

// Xem Telegram có báo lỗi gì khi gọi vào web app không
function checkWebhook() {
  const info = tg('getWebhookInfo', {}).result || {};
  delete info.url; // có chứa TG_SECRET
  console.log(JSON.stringify(info, null, 2));
}
