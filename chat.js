/* Ô chat hỏi đáp về Thảo Duyên. Trả lời từ backend (backend/Chat.gs), chỉ hiện khi trợ lý đã bật. */
(() => {
  const CFG = window.SHOP_CONFIG || {};
  const DEMO = !CFG.apiUrl;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ZALO = '0369 787 972';
  const SUGGEST = ['Thảo Duyên có kinh nghiệm gì?', 'AI Agent giúp được gì cho shop?', 'Mochi có những vị nào?', 'Mình muốn hẹn trao đổi'];
  const ACTIONS = { book: ['#dich-vu', 'Đặt lịch hẹn ↗'], order: ['#hun-khoi', 'Đặt hàng ↗'] };

  let visitor = localStorage.getItem('td-visitor');
  if (!visitor) { visitor = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('td-visitor', visitor); }
  let history = [];
  try { history = JSON.parse(sessionStorage.getItem('td-chat') || '[]'); } catch (e) { history = []; }
  let busy = false;

  const root = document.createElement('div');
  root.className = 'chat';
  root.hidden = true;
  root.innerHTML = `
    <button class="chat-fab" type="button" aria-expanded="false" aria-controls="chatPanel"><i></i>Hỏi về Duyên</button>
    <section class="chat-panel" id="chatPanel" aria-label="Hỏi đáp về Thảo Duyên" hidden>
      <header class="chat-head"><div><b>Trợ lý của Thảo Duyên</b><small>Trả lời theo hồ sơ Thảo Duyên đã duyệt</small></div><button class="icon-btn" type="button" data-chat-close aria-label="Đóng">×</button></header>
      <div class="chat-log" aria-live="polite"></div>
      <div class="chat-suggest"></div>
      <form class="chat-form"><input name="q" maxlength="300" autocomplete="off" placeholder="Hỏi về kinh nghiệm, dịch vụ…" aria-label="Câu hỏi" /><button type="submit" aria-label="Gửi">↑</button></form>
      <p class="chat-note">AI có thể sai — thông tin chính xác nhất là nhắn Zalo ${ZALO}.</p>
    </section>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const fab = $('.chat-fab'), panel = $('.chat-panel'), log = $('.chat-log'), form = $('.chat-form'), input = form.q, note = $('.chat-note');

  function bubble(role, text, actions) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.innerHTML = `<p>${esc(text).replace(/\n/g, '<br>')}</p>` +
      (actions && actions.length ? `<div class="msg-actions">${actions.filter(a => ACTIONS[a]).map(a => `<a href="${ACTIONS[a][0]}" data-chat-go>${ACTIONS[a][1]}</a>`).join('')}</div>` : '');
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  function render() {
    log.innerHTML = '';
    bubble('assistant', 'Chào bạn 👋 Mình trả lời được các câu hỏi về kinh nghiệm, dịch vụ và sản phẩm của Thảo Duyên. Bạn muốn biết gì?');
    history.forEach(m => bubble(m.role, m.text, m.actions));
    $('.chat-suggest').innerHTML = history.length ? '' : SUGGEST.map(s => `<button type="button">${esc(s)}</button>`).join('');
  }
  const save = () => sessionStorage.setItem('td-chat', JSON.stringify(history.slice(-20)));

  function toggle(open) {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', open);
    root.classList.toggle('open', open);
    if (open) { log.scrollTop = log.scrollHeight; input.focus(); }
  }

  async function ask(text) {
    text = text.trim().slice(0, 300);
    if (!text || busy) return;
    busy = true;
    form.classList.add('busy');
    $('.chat-suggest').innerHTML = '';
    history.push({ role: 'user', text });
    bubble('user', text);
    const typing = bubble('assistant typing', '…');
    let res;
    try {
      res = DEMO ? await demoReply(text) : await fetch(CFG.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'chat', visitor, messages: history.map(m => ({ role: m.role, text: m.text })) })
      }).then(r => r.json());
    } catch (e) {
      res = { ok: false, message: `Mạng đang chập chờn, bạn thử lại nhé. Hoặc nhắn Zalo ${ZALO}.` };
    }
    typing.remove();
    if (res.ok) {
      history.push({ role: 'assistant', text: res.reply, actions: res.actions });
      bubble('assistant', res.reply, res.actions);
      if (typeof res.left === 'number') note.textContent = res.left > 0 ? `Bạn còn ${res.left} câu hỏi hôm nay.` : 'Bạn đã dùng hết lượt hỏi hôm nay.';
    } else {
      history.pop(); // câu không được trả lời thì không gửi lại làm ngữ cảnh
      bubble('assistant error', res.message || `Có lỗi rồi, bạn nhắn Zalo ${ZALO} giúp mình nhé.`);
    }
    save();
    busy = false;
    form.classList.remove('busy');
    input.focus();
  }

  function demoReply(q) {
    const book = /gặp|hẹn|thuê|hợp tác|phỏng vấn|giá/i.test(q);
    return new Promise(r => setTimeout(() => r({
      ok: true, actions: book ? ['book'] : [], left: 9,
      reply: book ? 'Bạn đặt lịch hẹn ngay trên trang nhé, Thảo Duyên sẽ liên hệ trao đổi và báo giá. (chế độ demo)' : 'Đây là câu trả lời mẫu ở chế độ demo — khi nối backend, trợ lý sẽ trả lời theo hồ sơ của Thảo Duyên.'
    }), 600));
  }

  fab.addEventListener('click', () => toggle(panel.hidden));
  root.addEventListener('click', e => {
    if (e.target.closest('[data-chat-close]')) toggle(false);
    else if (e.target.closest('[data-chat-go]')) toggle(false); // link #… do shop.js mở đúng mục
    else if (e.target.closest('.chat-suggest button')) ask(e.target.textContent);
  });
  form.addEventListener('submit', e => { e.preventDefault(); const q = input.value; input.value = ''; ask(q); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) toggle(false); });

  // Chỉ hiện nút chat khi backend báo trợ lý đã bật (đã có key và hồ sơ đã duyệt)
  const show = () => { render(); root.hidden = false; };
  if (DEMO) show();
  else fetch(`${CFG.apiUrl}?action=chat`).then(r => r.json()).then(s => { if (s.on) show(); }).catch(() => {});
})();
