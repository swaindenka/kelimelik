// Kelime Avı — görsel efektler (konfeti, parçacık patlaması, uçan yazı, emoji tepkileri)
const Efekt = (() => {
  const azHareket = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Dokunmatik cihazlarda (özellikle iOS) efektler sade: iz bırakabilecek büyük katmanlar yok
  const dokunmatik = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const RENKLER = ['#ffc83d', '#ff6b6b', '#4dabf7', '#51cf66', '#cc5de8', '#ff922b', '#20c997', '#f06595'];

  // Tuval yalnızca parçacık varken sayfada durur; bitince temizlenip kaldırılır
  // (iOS'ta sürekli duran tam ekran tuval, temizlense bile ekranda iz bırakabiliyordu)
  const tuval = document.createElement('canvas');
  tuval.className = 'efekt-tuval';
  tuval.setAttribute('aria-hidden', 'true');
  const c = tuval.getContext('2d');
  let parcalar = [];
  let calisiyor = false;
  let dpr = 1;
  let son = 0;
  let gw = innerWidth, gh = innerHeight; // tuvalin ekrandaki boyu (CSS piksel)

  // Çizim tamponu tuvalin gerçek ekran boyuna göre (pencere ölçüsü iOS'ta farklı olabiliyor)
  function boyutla() {
    dpr = Math.min(window.devicePixelRatio || 1, dokunmatik ? 1.5 : 2);
    gw = tuval.clientWidth || innerWidth;
    gh = tuval.clientHeight || innerHeight;
    tuval.width = Math.round(gw * dpr);
    tuval.height = Math.round(gh * dpr);
  }
  function tuvaliAc() { if (!tuval.isConnected) { document.body.appendChild(tuval); boyutla(); } }
  function tuvaliKapat() {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, tuval.width, tuval.height);
    tuval.width = tuval.width; // tamponu tamamen sıfırla
    tuval.remove();
  }
  const yenidenBoyutla = () => { if (tuval.isConnected) boyutla(); };
  addEventListener('resize', yenidenBoyutla);
  window.visualViewport?.addEventListener('resize', yenidenBoyutla);

  const rast = (a, b) => a + Math.random() * (b - a);

  function dongu(t) {
    const adim = son ? Math.min(3, (t - son) / 16.67) : 1;
    son = t;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, gw, gh);
    for (const p of parcalar) {
      const s = Math.pow(p.s, adim);
      p.vx *= s;
      p.vy = p.vy * s + p.g * adim;
      p.x += p.vx * adim;
      p.y += p.vy * adim;
      p.a += p.va * adim;
      p.omur -= adim;
      c.globalAlpha = Math.max(0, Math.min(1, p.omur / 25));
      c.fillStyle = p.renk;
      if (p.kare) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.a);
        c.scale(1, Math.cos(p.a * 2.3));
        c.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        c.restore();
      } else {
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c.fill();
      }
    }
    parcalar = parcalar.filter((p) => p.omur > 0 && p.y < gh + 60);
    c.globalAlpha = 1;
    if (parcalar.length) requestAnimationFrame(dongu);
    else { calisiyor = false; son = 0; tuvaliKapat(); }
  }

  function ekle(liste) {
    if (azHareket) liste = liste.slice(0, Math.ceil(liste.length / 5));
    else if (dokunmatik) liste = liste.slice(0, Math.ceil(liste.length * 0.6));
    parcalar.push(...liste);
    const tavan = dokunmatik ? 500 : 1000;
    if (parcalar.length > tavan) parcalar.splice(0, parcalar.length - tavan);
    if (!calisiyor) { tuvaliAc(); calisiyor = true; requestAnimationFrame(dongu); }
  }

  // Bir noktadan her yöne saçılan küçük parçacıklar
  function patlama(x, y, renk = '#fff', adet = 18) {
    const l = [];
    for (let i = 0; i < adet; i++) {
      const aci = Math.random() * Math.PI * 2;
      const h = rast(1.5, 5.5);
      l.push({ x, y, vx: Math.cos(aci) * h, vy: Math.sin(aci) * h - 1, g: 0.1, s: 0.93, r: rast(1.8, 4.2), renk: Math.random() < 0.3 ? '#fff' : renk, a: 0, va: 0, omur: rast(28, 48) });
    }
    ekle(l);
  }

  // Bir noktadan belli yöne fışkıran konfeti
  function konfeti(x, y, adet = 80, yon = -Math.PI / 2, yayilim = 0.8, hiz = 1) {
    const l = [];
    for (let i = 0; i < adet; i++) {
      const aci = yon + rast(-yayilim, yayilim);
      const h = rast(6, 15) * hiz;
      l.push({ x, y, vx: Math.cos(aci) * h, vy: Math.sin(aci) * h, g: 0.22, s: 0.972, r: rast(3.5, 7), renk: RENKLER[i % RENKLER.length], a: rast(0, 6), va: rast(-0.25, 0.25), kare: true, omur: rast(110, 180) });
    }
    ekle(l);
  }

  // Seviye geçildiğinde: iki köşeden top atışı + yukarıdan yağmur
  function konfetiYagmuru(guclu = false) {
    const w = innerWidth, h = innerHeight;
    konfeti(0, h, guclu ? 110 : 70, -Math.PI / 3, 0.35, 1.25);
    konfeti(w, h, guclu ? 110 : 70, -Math.PI * 2 / 3, 0.35, 1.25);
    const l = [];
    for (let i = 0; i < (guclu ? 140 : 70); i++) {
      l.push({ x: rast(0, w), y: rast(-h * 0.4, -10), vx: rast(-1, 1), vy: rast(1, 4), g: 0.05, s: 0.99, r: rast(3.5, 6.5), renk: RENKLER[i % RENKLER.length], a: rast(0, 6), va: rast(-0.2, 0.2), kare: true, omur: rast(200, 300) });
    }
    ekle(l);
  }

  function ucanYazi(x, y, metin, renk = '#fff', sinif = '') {
    const el = document.createElement('div');
    el.className = 'ucan-yazi ' + sinif;
    el.textContent = metin;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = renk;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  function emoji(e, isim, renk) {
    const el = document.createElement('div');
    el.className = 'tepki-uc';
    el.style.left = rast(6, 90) + 'vw';
    el.style.setProperty('--sal', rast(-50, 50) + 'px');
    el.style.setProperty('--don', rast(-25, 25) + 'deg');
    const s = document.createElement('span');
    s.className = 'e';
    s.textContent = e;
    const n = document.createElement('small');
    n.textContent = isim;
    n.style.color = renk;
    el.append(s, n);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // Bir noktadan hedefe kavis çizerek uçan yazı (puan, süre…); varınca `bitince` çağrılır
  function uc(x1, y1, x2, y2, metin, renk = '#ffe28a', bitince = null, sinif = '') {
    if (azHareket) { if (bitince) bitince(); return; }
    const el = document.createElement('div');
    el.className = 'ucan-puan ' + sinif;
    el.textContent = metin;
    el.style.left = x1 + 'px';
    el.style.top = y1 + 'px';
    el.style.color = renk;
    document.body.appendChild(el);
    const dx = x2 - x1, dy = y2 - y1;
    const yan = rast(-50, 50);
    const yukari = -Math.min(110, 40 + Math.abs(dy) * 0.25);
    const sure = 620 + Math.min(320, Math.hypot(dx, dy) * 0.35);
    const tr = (x, y, s) => `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${s})`;
    const tepe = dokunmatik ? 1.1 : 1.3;
    const anim = el.animate([
      { transform: tr(0, 0, 0.5), opacity: 0 },
      { transform: tr(dx * 0.08 + yan * 0.4, yukari * 0.7, tepe), opacity: 1, offset: 0.22 },
      { transform: tr(dx * 0.5 + yan, dy * 0.45 + yukari, 1), opacity: 1, offset: 0.6 },
      { transform: tr(dx, dy, 0.55), opacity: 0 },
    ], { duration: sure, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
    let bitti = false;
    const kaldir = () => { if (bitti) return; bitti = true; anim.cancel(); el.remove(); if (bitince) bitince(); };
    anim.onfinish = kaldir;
    setTimeout(kaldir, sure + 250); // animasyon bitiş olayı gelmezse de kaldır
  }

  function flas(renk = 'rgba(255,200,61,.35)') {
    if (azHareket || dokunmatik) return;
    const el = document.createElement('div');
    el.className = 'flas';
    el.style.background = `radial-gradient(circle at 50% 55%, ${renk}, transparent 70%)`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  return { patlama, konfeti, konfetiYagmuru, ucanYazi, uc, emoji, flas };
})();
