(() => {
  const CFG = window.SHOP_CONFIG;
  const $ = (s, root = document) => root.querySelector(s);
  const money = n => n.toLocaleString('vi-VN') + 'đ';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DEMO = !CFG.apiUrl;
  const BANK_READY = Boolean(CFG.bank.bankId && CFG.bank.accountNo);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Giỏ hàng ---------- */
  const cart = [];
  function addToCart(item) {
    const same = cart.find(c => c.key === item.key);
    if (same) same.qty += item.qty; else cart.push(item);
    renderCart();
    const fab = $('#cartFab');
    fab.classList.remove('bump'); void fab.offsetWidth; fab.classList.add('bump');
    toast(`Đã thêm “${item.name}” vào giỏ`);
  }
  const cartTotal = () => cart.reduce((s, c) => s + c.price * c.qty, 0);
  function renderCart() {
    const count = cart.reduce((s, c) => s + c.qty, 0);
    $('#cartCount').textContent = count;
    $('#cartFab').classList.toggle('has-items', count > 0);
    $('#cartTotal').textContent = money(cartTotal());
    $('#checkoutBtn').disabled = !cart.length;
    $('#cartItems').innerHTML = cart.length ? cart.map((c, i) => `
      <div class="cart-row">
        <div><b>${esc(c.name)}</b><small>${esc(c.detail)}</small></div>
        <div class="qty"><button type="button" data-qty="${i}" data-d="-1" aria-label="Bớt">−</button><span>${c.qty}</span><button type="button" data-qty="${i}" data-d="1" aria-label="Thêm">+</button></div>
        <b class="line-price">${money(c.price * c.qty)}</b>
      </div>`).join('') : '<p class="empty">Giỏ còn trống. Thử quay nón mochi hoặc hun một mẻ lạp xưởng nhé.</p>';
  }
  $('#cartItems').addEventListener('click', e => {
    const b = e.target.closest('[data-qty]'); if (!b) return;
    const c = cart[+b.dataset.qty]; c.qty += +b.dataset.d;
    if (c.qty <= 0) cart.splice(+b.dataset.qty, 1);
    renderCart();
  });

  /* ---------- Lớp phủ: drawer & modal ---------- */
  const scrim = $('#scrim'), drawer = $('#cartDrawer'), modal = $('#orderModal');
  function openDrawer() { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.hidden = false; }
  function openModal(html) {
    closeDrawer(true);
    $('#modalBody').innerHTML = html; modal.hidden = false; scrim.hidden = false;
    document.body.classList.add('locked');
    requestAnimationFrame(() => modal.classList.add('open'));
  }
  function closeDrawer(keepScrim) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); if (!keepScrim) scrim.hidden = modal.hidden; }
  function closeModal() { modal.classList.remove('open'); modal.hidden = true; scrim.hidden = true; document.body.classList.remove('locked'); stopPayment(); }
  function closeAll() { closeDrawer(); if (!modal.hidden) closeModal(); }
  $('#cartFab').addEventListener('click', openDrawer);
  scrim.addEventListener('click', closeAll);
  document.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeAll(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

  /* ---------- Dịch vụ: đặt lịch ---------- */
  const isTest = new URLSearchParams(location.search).has('test');
  const service = id => CFG.services.find(s => s.id === id);
  document.querySelectorAll('.service-item[data-book]').forEach(el => {
    const s = service(el.dataset.book);
    if (s.testOnly && isTest) el.hidden = false;
    el.querySelector('.service-price').textContent = s.price ? `${s.unit} · từ ${money(s.price)}` : s.unit;
  });
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-book]'); if (!el) return;
    e.preventDefault(); openBooking(el.dataset.book);
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.service-item[data-book]')) { e.preventDefault(); openBooking(e.target.dataset.book); }
  });

  function customerFields(withAddress) {
    return `
      <div class="form-grid">
        <label>Họ tên<input name="name" required autocomplete="name" /></label>
        <label>Số điện thoại<input name="phone" required inputmode="tel" pattern="0[0-9]{9}" title="10 số, bắt đầu bằng 0" autocomplete="tel" /></label>
        <label class="full">Email <small>(nhận mail xác nhận)</small><input name="email" type="email" required autocomplete="email" /></label>
        ${withAddress ? '<label class="full">Địa chỉ giao hàng<input name="address" required autocomplete="street-address" /></label>' : ''}
        <label class="full">Ghi chú<textarea name="note" rows="2" placeholder="Không bắt buộc"></textarea></label>
      </div>`;
  }

  function openBooking(id, note = '') {
    const s = service(id);
    const today = new Date(); today.setDate(today.getDate() + 1);
    const minDate = today.toISOString().slice(0, 10);
    const paid = s.price > 0;
    openModal(`
      <form class="order-form" id="bookingForm" novalidate>
        <p class="eyebrow">${paid ? 'Đặt lịch · thanh toán ngay bằng QR' : 'Đặt lịch · báo giá sau'}</p>
        <h3>${esc(s.name)}</h3>
        <p class="sub">${esc(s.unit)}${paid ? ` — <b>${money(s.price)}</b>` : ''}</p>
        <label>Chọn ngày<input name="date" type="date" min="${minDate}" value="${minDate}" required /></label>
        <fieldset class="slots"><legend>Khung giờ</legend>
          ${CFG.timeSlots.map((t, i) => `<label class="slot"><input type="radio" name="time" value="${t}" ${i ? '' : 'checked'} /><span>${t}</span></label>`).join('')}
        </fieldset>
        ${customerFields(false)}
        <p class="form-error" aria-live="polite"></p>
        <button class="btn primary wide" type="submit">${paid ? 'Giữ chỗ &amp; lấy mã QR' : 'Đặt lịch'} <span>→</span></button>
        <p class="fine">${paid ? `Lịch được giữ ${CFG.holdMinutes} phút trong lúc chờ chuyển khoản.` : 'Thảo Duyên sẽ liên hệ trao đổi nhu cầu và báo giá trước buổi hẹn.'}</p>
      </form>`);
    $('#bookingForm').note.value = note;
    if (!DEMO) {
      $('#bookingForm').date.addEventListener('change', refreshSlots);
      refreshSlots();
    }
    $('#bookingForm').addEventListener('submit', e => {
      e.preventDefault();
      const data = readForm(e.target); if (!data) return;
      submitOrder({ type: 'booking', items: [{ id: s.id, name: s.name, detail: `${data.date} · ${data.time}`, price: s.price || 0, qty: 1 }], customer: data });
    });
  }

  // Làm mờ khung giờ đã có người giữ chỗ / đã đặt trong ngày đang chọn
  async function refreshSlots() {
    const form = $('#bookingForm'); if (!form) return;
    const date = form.date.value;
    let taken = [];
    try { taken = (await api.slots(date)).taken || []; } catch { return; }
    if (form !== $('#bookingForm') || form.date.value !== date) return;
    const radios = [...form.querySelectorAll('input[name=time]')];
    radios.forEach(r => { r.disabled = taken.includes(r.value); r.closest('.slot').title = r.disabled ? 'Đã có người đặt' : ''; });
    if (radios.find(r => r.checked)?.disabled) { const free = radios.find(r => !r.disabled); if (free) free.checked = true; }
    const full = radios.every(r => r.disabled);
    $('.form-error', form).textContent = full ? 'Ngày này đã kín lịch, bạn chọn ngày khác nhé.' : '';
    $('button[type=submit]', form).disabled = full;
  }

  function openCheckout() {
    if (!cart.length) return;
    openModal(`
      <form class="order-form" id="checkoutForm" novalidate>
        <p class="eyebrow">Đặt hàng · thanh toán ngay bằng QR</p>
        <h3>Thông tin nhận hàng</h3>
        <ul class="summary">${cart.map(c => `<li><span>${c.qty} × ${esc(c.name)} <small>${esc(c.detail)}</small></span><b>${money(c.price * c.qty)}</b></li>`).join('')}
          <li class="sum"><span>Tổng cộng</span><b>${money(cartTotal())}</b></li></ul>
        ${customerFields(true)}
        <p class="form-error" aria-live="polite"></p>
        <button class="btn primary wide" type="submit">Tạo đơn &amp; lấy mã QR <span>→</span></button>
      </form>`);
    $('#checkoutForm').addEventListener('submit', e => {
      e.preventDefault();
      const data = readForm(e.target); if (!data) return;
      submitOrder({ type: 'order', items: cart.map(c => ({ id: c.id, name: c.name, detail: c.detail, price: c.price, qty: c.qty })), customer: data }, () => { cart.length = 0; renderCart(); });
    });
  }
  $('#checkoutBtn').addEventListener('click', openCheckout);

  function readForm(form) {
    const err = $('.form-error', form);
    const bad = [...form.elements].find(el => el.willValidate && !el.checkValidity());
    if (bad) { err.textContent = `Kiểm tra lại: ${bad.closest('label')?.childNodes[0].textContent.trim() || 'thông tin'}`; bad.focus(); return null; }
    err.textContent = '';
    return Object.fromEntries(new FormData(form));
  }

  /* ---------- API: Apps Script khi có apiUrl, giả lập khi demo ---------- */
  const demoOrders = {};
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const api = {
    async create(order) {
      if (DEMO) {
        const code = 'TD' + Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
        const total = order.items.reduce((s, i) => s + i.price * i.qty, 0);
        demoOrders[code] = { status: 'pending', expiresAt: Date.now() + CFG.holdMinutes * 60000 };
        await new Promise(r => setTimeout(r, 600));
        return { ok: true, code, total, expiresAt: demoOrders[code].expiresAt };
      }
      const r = await fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'create', order }) });
      return r.json();
    },
    async status(code) {
      if (DEMO) {
        const o = demoOrders[code];
        if (o.status === 'pending' && Date.now() > o.expiresAt) o.status = 'cancelled';
        return { ok: true, status: o.status };
      }
      const r = await fetch(`${CFG.apiUrl}?action=status&code=${encodeURIComponent(code)}`);
      return r.json();
    },
    async slots(date) {
      const r = await fetch(`${CFG.apiUrl}?action=slots&date=${encodeURIComponent(date)}`);
      return r.json();
    }
  };

  async function submitOrder(order, onCreated) {
    const btn = $('#modalBody button[type=submit]');
    btn.disabled = true; btn.innerHTML = 'Đang giữ chỗ…';
    try {
      const res = await api.create(order);
      if (!res.ok) throw Object.assign(new Error(res.error || 'server'), { userMessage: res.message });
      onCreated?.();
      if (res.total > 0) showPayment(res, order); else showBooked(res, order);
    } catch (err) {
      btn.disabled = false; btn.innerHTML = 'Thử lại <span>→</span>';
      $('#modalBody .form-error').textContent = err.userMessage || 'Chưa gửi được đơn, bạn thử lại sau ít phút.';
      if (err.message === 'slot') refreshSlots();
    }
  }

  /* ---------- Đặt lịch không thu tiền trước: xác nhận ngay ---------- */
  function showBooked({ code }, order) {
    const c = order.customer;
    openModal(`
      <div class="order-form">
        <p class="eyebrow">Mã lịch <b>${code}</b></p>
        <h3>Đã nhận lịch của bạn!</h3>
        <p class="sub">${esc(order.items[0].name)} · <b>${prettyDate(c.date)} lúc ${esc(c.time)}</b></p>
        <div class="pay-status confirmed"><i></i><span>Thảo Duyên sẽ liên hệ qua số ${esc(c.phone)} để trao đổi nhu cầu và báo giá.</span></div>
        <p class="fine">Mail xác nhận đã gửi tới <b>${esc(c.email)}</b>. Cần đổi lịch, bạn nhắn Zalo 0369 787 972 nhé.</p>
      </div>`);
    confetti($('#modalBody .pay-status'));
  }

  /* ---------- Màn thanh toán QR ---------- */
  let countdownTimer, pollTimer;
  function stopPayment() { clearInterval(countdownTimer); clearInterval(pollTimer); }

  function qrUrl(total, code) {
    const b = BANK_READY ? CFG.bank : { bankId: 'VCB', accountNo: '0000000000', accountName: 'DEMO' };
    return `https://img.vietqr.io/image/${b.bankId}-${b.accountNo}-compact2.png?amount=${total}&addInfo=${code}&accountName=${encodeURIComponent(b.accountName)}`;
  }

  function showPayment({ code, total, expiresAt }, order) {
    const b = CFG.bank;
    const copyRow = (label, value, shown = value) => `<div><dt>${label}</dt><dd><span>${esc(shown)}</span>${value ? `<button type="button" class="copy" data-copy="${esc(value)}">Chép</button>` : ''}</dd></div>`;
    openModal(`
      <div class="pay" id="payView">
        <div class="pay-qr ${BANK_READY ? '' : 'demo'}">
          <img src="${qrUrl(total, code)}" alt="Mã QR chuyển khoản ${money(total)}, nội dung ${code}" width="300" height="300" />
          ${BANK_READY ? '' : '<span class="demo-stamp">DEMO<small>chưa có tài khoản thật</small></span>'}
        </div>
        <div class="pay-info">
          <p class="eyebrow">Đơn <b>${code}</b> · ${order.type === 'booking' ? 'đang giữ lịch' : 'đang giữ hàng'}</p>
          <h3>Quét mã để thanh toán</h3>
          <dl>
            ${copyRow('Ngân hàng', '', BANK_READY ? (b.bankName || b.bankId) : '— chờ thông tin —')}
            ${copyRow('Số tài khoản', BANK_READY ? b.accountNo : '', BANK_READY ? b.accountNo : '— chờ thông tin —')}
            ${copyRow('Chủ tài khoản', '', BANK_READY ? b.accountName : '— chờ thông tin —')}
            ${copyRow('Số tiền', String(total), money(total))}
            ${copyRow('Nội dung CK', code)}
          </dl>
          <div class="countdown"><span>Giữ chỗ còn</span><b id="countdown">--:--</b></div>
          <div class="pay-status waiting" id="payStatus"><i></i><span>Đang chờ Thảo Duyên xác nhận đã nhận tiền…</span></div>
          ${DEMO ? `<button type="button" class="demo-confirm" id="demoConfirm">Giả lập: Thảo Duyên bấm “Đã nhận tiền” trên Telegram</button>` : ''}
          <p class="fine">Nhớ giữ nguyên nội dung chuyển khoản <b>${code}</b> để đơn được khớp nhanh. Sau khi xác nhận, mail sẽ gửi tới <b>${esc(order.customer.email)}</b>.</p>
        </div>
      </div>`);

    $('#payView').addEventListener('click', e => {
      const c = e.target.closest('[data-copy]'); if (!c) return;
      navigator.clipboard?.writeText(c.dataset.copy); c.textContent = 'Đã chép'; setTimeout(() => c.textContent = 'Chép', 1500);
    });
    $('#demoConfirm')?.addEventListener('click', () => { demoOrders[code].status = 'confirmed'; checkStatus(); });

    const tick = () => {
      const left = Math.max(0, expiresAt - Date.now());
      $('#countdown').textContent = `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
      if (!left) checkStatus();
    };
    async function checkStatus() {
      try {
        const { status } = await api.status(code);
        if (status === 'confirmed') setStatus('confirmed');
        else if (status === 'cancelled' || status === 'expired') setStatus('cancelled');
      } catch { /* mạng chập chờn: lần poll sau thử lại */ }
    }
    function setStatus(s) {
      stopPayment();
      const box = $('#payStatus');
      box.className = `pay-status ${s}`;
      box.querySelector('span').innerHTML = s === 'confirmed'
        ? `Đã nhận tiền! ${order.type === 'booking' ? 'Lịch của bạn đã được xác nhận' : 'Đơn đã được xác nhận'} — mail đang trên đường tới hộp thư.`
        : 'Hết 30 phút giữ chỗ nên đơn đã tự hủy. Nếu bạn đã chuyển khoản, nhắn Zalo 0369 787 972 nhé.';
      $('.countdown').classList.add('done');
      $('#demoConfirm')?.remove();
      if (s === 'confirmed') confetti($('.pay-qr'));
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
    if (!DEMO) pollTimer = setInterval(checkStatus, 5000);
  }

  function confetti(host) {
    if (reduceMotion) return;
    const colors = CFG.mochiFlavors.map(f => f.color);
    for (let i = 0; i < 36; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      p.style.cssText = `--x:${(Math.random() - .5) * 340}px;--y:${-120 - Math.random() * 200}px;--r:${Math.random() * 720}deg;background:${colors[i % colors.length]};animation-delay:${Math.random() * 120}ms`;
      host.appendChild(p);
      setTimeout(() => p.remove(), 1600);
    }
  }

  /* ---------- Chiếc nón kỳ diệu (mochi) ---------- */
  const flavors = CFG.mochiFlavors, N = flavors.length, SLICE = 360 / N, R = 190;
  const wheel = $('#mochiWheel');
  const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [Math.cos(a) * r, Math.sin(a) * r].map(v => v.toFixed(2)); };
  wheel.innerHTML = `<g id="wheelSpin">${flavors.map((f, i) => {
    const [x1, y1] = pt(i * SLICE, R), [x2, y2] = pt((i + 1) * SLICE, R), mid = i * SLICE + SLICE / 2;
    const [bx, by] = pt(mid, 150);
    return `<g class="slice" data-i="${i}" tabindex="-1">
      <path d="M0 0L${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}Z" fill="${f.color}" />
      <ellipse cx="${bx}" cy="${by}" rx="15" ry="13" fill="rgba(255,255,255,.35)" />
      <text transform="rotate(${mid}) translate(0 -96) rotate(90)" fill="${f.light ? '#fff6ec' : '#2a211c'}">${esc(f.name)}</text>
    </g>`;
  }).join('')}<circle r="${R}" fill="none" stroke="#20201d" stroke-width="3" /></g>`;
  const spinG = $('#wheelSpin');
  let rotation = 0, spinning = false, current = null, mode = 'spin';
  let boxSize = CFG.mochiBoxSizes[0];
  const box = [];

  function rotateTo(i, turns, ms) {
    spinning = true;
    const target = 360 - (i * SLICE + SLICE / 2) + (Math.random() - .5) * SLICE * .6;
    const base = rotation - (rotation % 360);
    rotation = base + turns * 360 + target; // luôn quay thuận chiều, turns ≥ 1
    spinG.style.transition = reduceMotion ? 'none' : `transform ${ms}ms cubic-bezier(.12,.75,.12,1)`;
    spinG.style.transform = `rotate(${rotation}deg)`;
    $('#wheelResult').textContent = mode === 'spin' ? 'Nón đang quay…' : 'Đang xoay tới vị bạn chọn…';
    document.querySelector('.wheel-stage').classList.add('spinning');
    setTimeout(() => land(i), reduceMotion ? 0 : ms);
  }
  function land(i) {
    spinning = false; current = i;
    document.querySelector('.wheel-stage').classList.remove('spinning');
    wheel.querySelectorAll('.slice').forEach(s => s.classList.toggle('won', +s.dataset.i === i));
    const f = flavors[i];
    $('#wheelResult').innerHTML = `<i style="background:${f.color}"></i> Vị <b>${esc(f.name)}</b>${mode === 'spin' ? ' — nón đã chọn rồi đó!' : ''}`;
    $('#addFlavor').disabled = box.length >= boxSize;
  }
  const spin = () => { if (!spinning) rotateTo(Math.floor(Math.random() * N), 5, 4200); };
  $('#spinBtn').addEventListener('click', spin);
  $('#hubBtn').addEventListener('click', spin);
  wheel.addEventListener('click', e => {
    const s = e.target.closest('.slice'); if (!s || spinning) return;
    if (mode === 'spin') return spin();
    rotateTo(+s.dataset.i, 1, 1300);
  });
  document.querySelectorAll('.mode-switch button').forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('.mode-switch button').forEach(x => x.classList.toggle('active', x === b));
    $('.wheel-stage').classList.toggle('pick-mode', mode === 'pick');
    $('#spinBtn').hidden = mode === 'pick';
    $('#hubBtn').textContent = mode === 'pick' ? 'CHẠM VỊ' : 'QUAY';
    if (!current && current !== 0) $('#wheelResult').textContent = mode === 'pick' ? 'Chạm vào miếng mochi bạn thích trên nón.' : 'Nón đang chờ bạn quay…';
  }));

  function renderBox() {
    $('#boxSizes').innerHTML = CFG.mochiBoxSizes.map(n =>
      `<button type="button" data-size="${n}" class="${n === boxSize ? 'active' : ''}"><b>${n}</b> viên<small>${money(n * CFG.mochiPrice)}</small></button>`).join('');
    $('#boxSlots').style.setProperty('--cols', boxSize / 2);
    $('#boxSlots').innerHTML = Array.from({ length: boxSize }, (_, i) => box[i] !== undefined
      ? `<span class="ball" style="background:${flavors[box[i]].color}" title="${esc(flavors[box[i]].name)}"></span>`
      : '<span class="ball empty"></span>').join('');
    $('#boxCount').textContent = `${box.length} / ${boxSize} viên`;
    $('#boxPrice').textContent = money(boxSize * CFG.mochiPrice);
    const left = boxSize - box.length;
    $('#addBox').disabled = left > 0;
    $('#addBox').textContent = left > 0 ? `Còn thiếu ${left} viên` : 'Thêm hộp vào giỏ';
    $('#addFlavor').disabled = current === null || left <= 0;
    if (left <= 0) $('#wheelResult').innerHTML = `Hộp ${boxSize} viên đã đầy — thêm vào giỏ thôi!`;
  }
  $('#boxSizes').addEventListener('click', e => {
    const b = e.target.closest('[data-size]'); if (!b) return;
    boxSize = +b.dataset.size;
    if (box.length > boxSize) { box.length = boxSize; toast(`Hộp ${boxSize} viên — đã bớt những viên dư`); }
    renderBox();
  });
  $('#addFlavor').addEventListener('click', () => { if (current === null || box.length >= boxSize) return; box.push(current); renderBox(); });
  $('#clearBox').addEventListener('click', () => { box.length = 0; renderBox(); });
  $('#addBox').addEventListener('click', () => {
    if (box.length < boxSize) return;
    const counts = {};
    box.forEach(i => counts[flavors[i].name] = (counts[flavors[i].name] || 0) + 1);
    const detail = Object.entries(counts).map(([n, c]) => `${c} ${n}`).join(', ');
    addToCart({ key: 'mochi:' + detail, id: `mochi-box-${boxSize}`, name: `Hộp mochi ${boxSize} viên`, detail, price: boxSize * CFG.mochiPrice, qty: 1 });
    box.length = 0; renderBox();
  });
  renderBox();

  /* ---------- Hun khói lạp xưởng ---------- */
  const house = $('#smokehouse'), smokeLayer = $('#smokeLayer'), smokeBtn = $('#smokeBtn');
  const FULL_MS = 4500;
  let smoke = 0, holding = false, lastT = 0, puffAcc = 0;
  const stages = [
    [0, 'Lạp xưởng còn tươi, chưa ám chút khói nào.'],
    [.01, 'Lửa bén rồi… khói bắt đầu bốc lên gác bếp.'],
    [.35, 'Thịt se mặt, mỡ trong dần, mùi mắc khén thơm lừng.'],
    [.7, 'Màu đỏ nâu đã lên — giữ thêm chút nữa thôi!'],
    [1, 'Chín khói chuẩn gác bếp! Mẻ này sẵn sàng gửi về phố.']
  ];
  function puff() {
    const p = document.createElement('span');
    p.className = 'puff';
    p.style.setProperty('--dx', `${(Math.random() - .5) * 80}px`);
    p.style.left = `${35 + Math.random() * 30}%`;
    p.style.setProperty('--s', (0.6 + Math.random() * .9).toFixed(2));
    smokeLayer.appendChild(p);
    setTimeout(() => p.remove(), 2600);
  }
  function frame(t) {
    const dt = lastT ? t - lastT : 16; lastT = t;
    if (holding && smoke < 1) smoke = Math.min(1, smoke + dt / FULL_MS);
    house.style.setProperty('--cook', smoke.toFixed(3));
    $('#smokeBar').style.width = `${smoke * 100}%`;
    $('#smokePct').textContent = `${Math.round(smoke * 100)}%`;
    $('#smokeStatus').textContent = stages.filter(([v]) => smoke >= v).pop()[1];
    if (holding && !reduceMotion) { puffAcc += dt; while (puffAcc > 110) { puff(); puffAcc -= 110; } }
    if (smoke >= 1 && !house.classList.contains('done')) {
      house.classList.add('done'); smokeBtn.innerHTML = 'Hun mẻ mới <span>↺</span>';
      $('#productList').classList.add('unlocked');
      stopHold();
    }
    if (holding) requestAnimationFrame(frame); else lastT = 0;
  }
  function startHold(e) {
    e?.preventDefault();
    if (house.classList.contains('done')) {
      smoke = 0; house.classList.remove('done'); smokeBtn.innerHTML = 'Giữ để hun khói <span>🔥</span>';
      frame(performance.now()); return;
    }
    if (holding) return;
    holding = true; house.classList.add('burning'); smokeBtn.classList.add('pressed');
    requestAnimationFrame(frame);
  }
  function stopHold() { holding = false; house.classList.remove('burning'); smokeBtn.classList.remove('pressed'); }
  smokeBtn.addEventListener('pointerdown', startHold);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => smokeBtn.addEventListener(ev, stopHold));
  smokeBtn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) startHold(e); });
  smokeBtn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stopHold(); });
  smokeBtn.addEventListener('contextmenu', e => e.preventDefault());

  $('#productList').innerHTML = CFG.products.map(p => `
    <div class="product">
      <div><b>${esc(p.name)}</b><small>${esc(p.unit)}</small></div>
      <span>${money(p.price)}</span>
      <button type="button" class="btn ghost small" data-product="${p.id}">Thêm +</button>
    </div>`).join('');
  $('#productList').addEventListener('click', e => {
    const b = e.target.closest('[data-product]'); if (!b) return;
    const p = CFG.products.find(x => x.id === b.dataset.product);
    addToCart({ key: p.id, id: p.id, name: p.name, detail: p.unit, price: p.price, qty: 1 });
  });

  /* ---------- Thiệp cưới: xem trước trực tiếp ---------- */
  const stage = $('#inviteStage'), envelope = $('#envelope');
  const weddingDate = $('#weddingDate');
  const inThreeMonths = new Date(); inThreeMonths.setMonth(inThreeMonths.getMonth() + 3);
  weddingDate.value = inThreeMonths.toISOString().slice(0, 10);
  const prettyDate = v => v ? new Date(v + 'T00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Ngày lành tháng tốt';
  function renderInvite() {
    $('#pvBride').textContent = $('#brideName').value.trim() || 'Cô dâu';
    $('#pvGroom').textContent = $('#groomName').value.trim() || 'Chú rể';
    $('#pvDate').textContent = prettyDate(weddingDate.value);
  }
  ['#brideName', '#groomName', '#weddingDate'].forEach(s => $(s).addEventListener('input', () => {
    renderInvite();
    if (!stage.classList.contains('open')) toggleEnvelope(true);
  }));
  function toggleEnvelope(force) {
    const open = stage.classList.toggle('open', force);
    $('#envHint').textContent = open ? 'Chạm lần nữa để cất thiệp vào phong bì' : 'Chạm vào phong bì để mở thiệp';
  }
  envelope.addEventListener('click', () => toggleEnvelope());
  document.querySelectorAll('.theme-pick button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.theme-pick button').forEach(x => x.classList.toggle('active', x === b));
    stage.dataset.theme = b.dataset.theme;
  }));
  if (service('thiep-cuoi').price) $('#weddingPrice').textContent = `từ ${money(service('thiep-cuoi').price)}`;
  $('#weddingBook').addEventListener('click', () => {
    const theme = $('.theme-pick .active').textContent;
    openBooking('thiep-cuoi', `Thiệp ${$('#pvBride').textContent} & ${$('#pvGroom').textContent}, cưới ${prettyDate(weddingDate.value)}, tông ${theme}`);
  });
  renderInvite();

  /* ---------- AI Agent: mô phỏng giao việc ---------- */
  const TASKS = {
    'tin-nhan': { rate: .8, steps: ['Đọc 37 tin nhắn mới trên Fanpage & Zalo', 'Phân loại: hỏi giá · đặt hàng · góp ý', 'Soạn câu trả lời đúng giọng thương hiệu', 'Chuyển 3 ca khó sang bạn duyệt', 'Khách được trả lời trong chưa tới 2 phút'] },
    'dang-bai': { rate: .7, steps: ['Lấy ý tưởng từ lịch nội dung tháng', 'Viết caption & hashtag cho 12 bài', 'Tạo ảnh AI theo bộ nhận diện', 'Đặt lịch đăng Facebook · Instagram · TikTok', 'Gửi báo cáo tương tác mỗi sáng thứ Hai'] },
    'don-hang': { rate: .75, steps: ['Gom đơn từ website, Zalo, Messenger', 'Ghi vào Google Sheet, khớp tồn kho', 'Nhắc khách chưa chuyển khoản', 'Tạo phiếu giao cho shipper', 'Báo doanh thu cuối ngày qua Telegram'] }
  };
  let task = 'tin-nhan', runId = 0;
  const hoursRange = $('#hoursRange');
  const savedPerMonth = () => Math.round(+hoursRange.value * TASKS[task].rate * 4.3);
  function renderSteps(done = -1, active = -1) {
    $('#agentSteps').innerHTML = TASKS[task].steps.map((s, i) =>
      `<li class="${i <= done ? 'done' : i === active ? 'active' : ''}"><i></i>${esc(s)}</li>`).join('');
  }
  function resetAgent() { runId++; renderSteps(); $('#savedHours').textContent = '— giờ'; $('#runAgent').disabled = false; }
  document.querySelectorAll('.task-pick button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.task-pick button').forEach(x => x.classList.toggle('active', x === b));
    task = b.dataset.task; resetAgent();
  }));
  hoursRange.addEventListener('input', () => {
    $('#hoursVal').textContent = `${hoursRange.value} giờ`;
    if ($('#agentSteps .done:last-child')) $('#savedHours').textContent = `${savedPerMonth()} giờ`;
  });
  $('#runAgent').addEventListener('click', async () => {
    const id = ++runId, steps = TASKS[task].steps.length, wait = ms => new Promise(r => setTimeout(r, reduceMotion ? 0 : ms));
    $('#runAgent').disabled = true;
    for (let i = 0; i < steps; i++) {
      renderSteps(i - 1, i); await wait(650);
      if (id !== runId) return;
    }
    renderSteps(steps - 1);
    const target = savedPerMonth();
    for (let n = 0; n <= target; n += Math.max(1, Math.ceil(target / 20))) { $('#savedHours').textContent = `${n} giờ`; await wait(35); if (id !== runId) return; }
    $('#savedHours').textContent = `${target} giờ`;
    $('#runAgent').disabled = false; $('#runAgent').innerHTML = 'Chạy lại <span>↻</span>';
  });
  $('#agentBook').addEventListener('click', () => {
    const name = $('.task-pick .active').textContent;
    openBooking('ai-agent', `Muốn tự động hoá: ${name} (~${hoursRange.value} giờ/tuần)`);
  });
  renderSteps();

  /* ---------- 4 trải nghiệm dạng tab: bấm là đổi ngay tại chỗ ---------- */
  const playNav = $('.play-nav');
  const tabs = [...playNav.querySelectorAll('a')];
  const panels = [...document.querySelectorAll('.play-panel')];
  function showPlay(id, scroll) {
    const panel = panels.find(p => p.id === id);
    if (!panel) return false;
    panels.forEach(p => { p.hidden = p !== panel; p.classList.toggle('active', p === panel); });
    tabs.forEach(t => {
      const on = t.hash === '#' + id;
      t.classList.toggle('active', on); t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
    });
    if (scroll || playNav.getBoundingClientRect().top < 0)
      playNav.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    return true;
  }
  // Mọi link tới một trải nghiệm (tab, món treo ở đầu trang, menu) đều mở đúng tab
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || !showPlay(a.hash.slice(1), !a.closest('.play-nav'))) return;
    e.preventDefault();
    history.replaceState(null, '', a.hash);
  });
  playNav.addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = tabs[(tabs.indexOf(document.activeElement) + step + tabs.length) % tabs.length];
    next.focus(); showPlay(next.hash.slice(1)); history.replaceState(null, '', next.hash);
  });
  if (!showPlay(location.hash.slice(1), true)) showPlay(panels[0].id);

  renderCart();
})();
