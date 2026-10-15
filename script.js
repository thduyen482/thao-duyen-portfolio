document.documentElement.classList.add('js');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');
toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!open));
  nav.classList.toggle('open', !open);
});
nav?.addEventListener('click', e => { if (e.target.closest('a')) { toggle.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); } });

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
}, { threshold: .12 });
document.querySelectorAll('.fade-in, .service-item, .story-copy, .reveal, .intro-lead, .quote-block p').forEach(el => observer.observe(el));

// Lệch nhịp cho các thẻ xuất hiện lần lượt
document.querySelectorAll('.service-item').forEach((el, i) => el.style.transitionDelay = `${(i % 4) * 90}ms`);

if (!reduceMotion) {
  // Hero: các lớp hình di chuyển theo chuột tạo chiều sâu
  const art = document.querySelector('.hero-art');
  const layers = art ? [...art.querySelectorAll('.sun, .arch-one, .arch-two, .art-text, .scribble')] : [];
  document.querySelector('.hero')?.addEventListener('pointermove', e => {
    const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
    layers.forEach((el, i) => { const d = (i % 4 + 1) * 7; el.style.transform = `translate(${x * d}px, ${y * d}px)`; });
  });

  // Món treo đung đưa như con lắc: gió nhẹ lắc liên tục, lướt chuột qua là văng mạnh
  const hangs = [...document.querySelectorAll('.hang')].map((el, i) => {
    el.classList.add('live');
    return { el, a: 0, v: 0, k: 2400 / (parseFloat(el.style.getPropertyValue('--len')) + 40), phase: i * 1.7 };
  });
  const hero = document.querySelector('.hero');
  let heroOn = true, last = performance.now();
  new IntersectionObserver(([en]) => heroOn = en.isIntersecting).observe(hero);
  hero?.addEventListener('pointermove', e => hangs.forEach(h => {
    const r = h.el.getBoundingClientRect();
    if (e.clientX > r.left - 24 && e.clientX < r.right + 24 && e.clientY > r.top && e.clientY < r.bottom + 12) h.v += e.movementX * 4;
  }));
  hangs.forEach(h => h.el.addEventListener('pointerdown', () => h.v += (Math.random() < .5 ? -1 : 1) * 160));
  (function swing(now) {
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (heroOn) hangs.forEach(h => {
      const wind = 60 * Math.sin(now / 1100 + h.phase) + 25 * Math.sin(now / 430 + h.phase * 2);
      h.v += (-h.k * h.a - 1.1 * h.v + wind) * dt;
      h.a = Math.max(-45, Math.min(45, h.a + h.v * dt));
      h.el.style.rotate = h.a.toFixed(2) + 'deg';
    });
    requestAnimationFrame(swing);
  })(last);

  // Chữ chạy tăng tốc khi cuộn
  const marquee = document.querySelector('.marquee div');
  let lastY = scrollY, boost = 0;
  addEventListener('scroll', () => { boost = Math.min(Math.abs(scrollY - lastY) / 12, 6); lastY = scrollY; }, { passive: true });
  (function tick() {
    const anim = marquee?.getAnimations()[0];
    if (anim) anim.playbackRate = 1 + boost;
    boost *= .92;
    requestAnimationFrame(tick);
  })();
}
