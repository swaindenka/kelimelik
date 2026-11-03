// Kelime Avı — ses efektleri ve arka plan müziği (Web Audio ile sentezlenir, dosya gerekmez)
const Ses = (() => {
  const oku = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const yaz = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const sinirla = (v) => Math.max(0, Math.min(1, Number(v) || 0));

  let ctx = null;
  let ana = null;        // efektlerin ana kanalı
  let muzikBus = null;   // müziğin ayrı kanalı (ayrı düzey)
  let padFiltre = null;  // müzik pad'i için alçak geçiren filtre
  let gurultuTampon = null;
  let acik = oku('ka_ses') !== '0';
  const kd = oku('ka_sesDuzey');
  let duzey = kd === null ? 0.7 : sinirla(kd);
  let muzikAcik = oku('ka_muzik') !== '0';
  const md = oku('ka_muzikDuzey');
  let muzikDuzey = md === null ? 0.45 : sinirla(md);

  // Kısa, sentetik bir oda yankısı (efektlere derinlik katar)
  function yankiOlustur() {
    const sure = 1.5, n = Math.floor(ctx.sampleRate * sure);
    const tampon = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let k = 0; k < 2; k++) {
      const d = tampon.getChannelData(k);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    const c = ctx.createConvolver();
    c.buffer = tampon;
    return c;
  }

  // Tarayıcılar sesi ancak bir kullanıcı etkileşiminden sonra başlatır
  function hazirla() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      const sikistir = ctx.createDynamicsCompressor();
      sikistir.connect(ctx.destination);
      const yanki = yankiOlustur();
      const yankiDonus = ctx.createGain();
      yankiDonus.gain.value = 0.2;
      yanki.connect(yankiDonus);
      yankiDonus.connect(sikistir);

      ana = ctx.createGain();
      ana.gain.value = duzey;
      ana.connect(sikistir);
      const efektYanki = ctx.createGain();
      efektYanki.gain.value = 0.55;
      ana.connect(efektYanki);
      efektYanki.connect(yanki);

      muzikBus = ctx.createGain();
      muzikBus.gain.value = muzikAcik ? muzikDuzey * 0.5 : 0;
      muzikBus.connect(sikistir);
      const muzikYanki = ctx.createGain();
      muzikYanki.gain.value = 0.8;
      muzikBus.connect(muzikYanki);
      muzikYanki.connect(yanki);
      padFiltre = ctx.createBiquadFilter();
      padFiltre.type = 'lowpass';
      padFiltre.frequency.value = 1300;
      padFiltre.Q.value = 0.4;
      padFiltre.connect(muzikBus);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  addEventListener('pointerdown', hazirla, { passive: true });
  addEventListener('keydown', hazirla);

  const calisiyor = () => ctx && ctx.state === 'running';
  const hazir = () => acik && calisiyor() && duzey > 0;
  const nota = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI nota numarası → Hz

  // Tek osilatörlü ton; `hedef` verilirse o kanala bağlanır (müzik için)
  function ton(f, sure, o = {}) {
    const { tip = 'sine', t0 = 0, ses = 0.2, bitis = null, atak = 0.008, hedef = null, mutlak = null } = o;
    if (hedef ? !calisiyor() : !hazir()) return;
    const t = mutlak ?? ctx.currentTime + t0;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = tip;
    osc.frequency.setValueAtTime(f, t);
    if (bitis) osc.frequency.exponentialRampToValueAtTime(bitis, t + sure);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(ses, t + atak);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    osc.connect(g);
    g.connect(hedef || ana);
    osc.start(t);
    osc.stop(t + sure + 0.05);
  }

  function gurultu(sure, o = {}) {
    const { t0 = 0, ses = 0.12, f = 1500, f2 = null, q = 1, tip = 'bandpass', hedef = null, mutlak = null } = o;
    if (hedef ? !calisiyor() : !hazir()) return;
    if (!gurultuTampon) {
      gurultuTampon = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = gurultuTampon.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = mutlak ?? ctx.currentTime + t0;
    const kaynak = ctx.createBufferSource();
    kaynak.buffer = gurultuTampon;
    const filtre = ctx.createBiquadFilter();
    filtre.type = tip;
    filtre.Q.value = q;
    filtre.frequency.setValueAtTime(f, t);
    if (f2) filtre.frequency.exponentialRampToValueAtTime(f2, t + sure);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(ses, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    kaynak.connect(filtre);
    filtre.connect(g);
    g.connect(hedef || ana);
    kaynak.start(t);
    kaynak.stop(t + sure + 0.05);
  }

  const arpej = (notalar, aralik, o) => notalar.forEach((n, i) => ton(nota(n), o.sure ?? 0.2, { ...o, t0: (o.t0 || 0) + i * aralik }));
  // Davul benzeri vuruş (perde hızla düşen sinüs)
  const vurus = (o = {}) => ton(o.f || 150, o.sure || 0.28, { tip: 'sine', bitis: o.f2 || 42, ses: o.ses || 0.25, atak: 0.003, t0: o.t0 || 0, hedef: o.hedef, mutlak: o.mutlak });

  const sesler = {
    harf: (i = 1) => ton(nota(70 + Math.min(i, 14)), 0.07, { tip: 'triangle', ses: 0.09 }),
    sil: () => ton(nota(62), 0.06, { tip: 'triangle', ses: 0.07, bitis: nota(57) }),
    dogru: () => arpej([76, 79, 84], 0.06, { tip: 'triangle', ses: 0.2, sure: 0.22 }),
    // Kazanılan puana göre şıngırdayan "para" sesi
    puan: (n = 3) => {
      for (let i = 0; i < Math.max(1, Math.min(n, 9)); i++) {
        const p = 91 + ((i * 5) % 9);
        ton(nota(p), 0.09, { tip: 'triangle', t0: 0.16 + i * 0.05, ses: 0.06 });
        ton(nota(p + 12), 0.05, { tip: 'sine', t0: 0.16 + i * 0.05, ses: 0.03 });
      }
    },
    buyuk: () => {
      arpej([72, 76, 79, 84, 88], 0.07, { tip: 'square', ses: 0.07, sure: 0.25 });
      [84, 88, 91, 96].forEach((n) => ton(nota(n), 1.1, { tip: 'triangle', t0: 0.38, ses: 0.1 }));
      gurultu(0.7, { t0: 0.36, f: 7000, ses: 0.05, q: 0.6 });
      vurus({ t0: 0.36, ses: 0.2 });
    },
    bonus: () => arpej([88, 91, 96], 0.05, { tip: 'sine', ses: 0.12, sure: 0.16 }),
    yanlis: () => { ton(160, 0.22, { tip: 'sawtooth', ses: 0.07, bitis: 95 }); ton(120, 0.22, { tip: 'square', ses: 0.03, bitis: 80 }); },
    zaten: () => ton(nota(67), 0.14, { tip: 'sine', ses: 0.1, bitis: nota(63) }),
    baskasi: () => { ton(nota(79), 0.12, { tip: 'sine', ses: 0.07 }); ton(nota(86), 0.14, { tip: 'sine', t0: 0.05, ses: 0.05 }); },
    seri: (n = 2) => {
      const k = Math.min(n, 7) * 2;
      ton(nota(76 + k), 0.1, { tip: 'square', ses: 0.05 });
      ton(nota(83 + k), 0.18, { tip: 'square', t0: 0.07, ses: 0.05 });
      if (n >= 4) { ton(nota(88 + k), 0.3, { tip: 'triangle', t0: 0.14, ses: 0.08 }); gurultu(0.3, { t0: 0.12, f: 6000, ses: 0.03 }); }
    },
    karistir: () => gurultu(0.22, { f: 900, f2: 3200, ses: 0.035, q: 0.8 }),
    tik: () => ton(1050, 0.04, { tip: 'square', ses: 0.035 }),
    tikAcil: () => { ton(1400, 0.07, { tip: 'square', ses: 0.06 }); ton(700, 0.07, { tip: 'sine', ses: 0.05 }); },
    geriSayim: () => { ton(nota(81), 0.16, { tip: 'triangle', ses: 0.14 }); vurus({ ses: 0.12, f: 120 }); },
    basla: () => {
      ton(nota(81), 0.12, { tip: 'triangle', ses: 0.12 });
      ton(nota(93), 0.35, { tip: 'triangle', t0: 0.12, ses: 0.14 });
      gurultu(0.4, { t0: 0.1, f: 500, f2: 5000, ses: 0.05 });
      vurus({ t0: 0.12, ses: 0.18 });
    },
    gecti: () => {
      arpej([72, 76, 79, 84], 0.1, { tip: 'triangle', ses: 0.17, sure: 0.25 });
      [72, 76, 79, 84].forEach((n) => ton(nota(n), 1.2, { tip: 'sine', t0: 0.45, ses: 0.08 }));
      vurus({ t0: 0.45, ses: 0.2 });
    },
    kaldi: () => arpej([67, 63, 60, 55], 0.17, { tip: 'sawtooth', ses: 0.05, sure: 0.38 }),
    oyunBitti: () => {
      arpej([60, 64, 67, 72, 76, 79], 0.09, { tip: 'triangle', ses: 0.14, sure: 0.3 });
      [72, 76, 79, 84].forEach((n) => ton(nota(n), 1.6, { tip: 'sine', t0: 0.6, ses: 0.08 }));
    },
    yildiz: (i = 0) => { ton(nota(84 + i * 4), 0.35, { tip: 'triangle', ses: 0.14 }); gurultu(0.25, { f: 8000, ses: 0.03 }); },
    gizli: () => { gurultu(0.5, { f: 400, f2: 4000, ses: 0.07 }); ton(nota(64), 0.45, { tip: 'sine', bitis: nota(88), ses: 0.08 }); },
    sahte: () => ton(nota(70), 0.32, { tip: 'square', bitis: nota(46), ses: 0.05 }),
    ipucu: () => arpej([84, 79, 88], 0.07, { tip: 'sine', ses: 0.1, sure: 0.18 }),
    sohbet: () => ton(nota(86), 0.07, { tip: 'sine', ses: 0.05 }),
    tepki: () => ton(nota(79), 0.09, { tip: 'sine', ses: 0.05, bitis: nota(91) }),
    katildi: () => arpej([79, 84], 0.08, { tip: 'sine', ses: 0.06, sure: 0.14 }),
    tikla: () => ton(nota(76), 0.05, { tip: 'triangle', ses: 0.06 }),
    // Hazine kelime: parıltılı çan arpeji
    hazine: () => {
      arpej([84, 88, 91, 96, 100, 103], 0.045, { tip: 'sine', ses: 0.11, sure: 0.5 });
      arpej([96, 100, 103], 0.09, { tip: 'triangle', t0: 0.3, ses: 0.05, sure: 0.8 });
      gurultu(0.9, { t0: 0.05, f: 9000, ses: 0.035, q: 0.7 });
    },
    // Süre eklendi: yükselen hışırtı
    zamanEk: () => {
      gurultu(0.4, { f: 400, f2: 5000, ses: 0.06, q: 1.4 });
      ton(nota(72), 0.35, { tip: 'triangle', bitis: nota(91), ses: 0.08 });
    },
    // Patrona her vuruş
    patronVurus: () => { vurus({ f: 110, f2: 38, ses: 0.22 }); gurultu(0.15, { f: 900, ses: 0.07, tip: 'lowpass' }); },
    patronYenildi: () => {
      vurus({ ses: 0.3, f: 90, f2: 30, sure: 0.5 });
      arpej([60, 64, 67, 72, 76, 79, 84], 0.07, { tip: 'square', ses: 0.06, sure: 0.3 });
      [72, 76, 79, 84, 88].forEach((n) => ton(nota(n), 1.8, { tip: 'triangle', t0: 0.5, ses: 0.07 }));
      gurultu(1.2, { t0: 0.48, f: 6500, ses: 0.05, q: 0.5 });
    },
    rekor: () => {
      arpej([67, 72, 76, 79, 84, 88, 91], 0.06, { tip: 'triangle', ses: 0.12, sure: 0.3 });
      [79, 84, 88, 91].forEach((n) => ton(nota(n), 1.6, { tip: 'sine', t0: 0.45, ses: 0.08 }));
      vurus({ t0: 0.45, ses: 0.2 });
    },
    // Son hamle başladı: kısa alarm
    sonHamle: () => {
      [0, 0.16, 0.32].forEach((t, i) => { ton(i % 2 ? 660 : 880, 0.12, { tip: 'square', t0: t, ses: 0.05 }); });
      vurus({ t0: 0, ses: 0.18 });
    },
    odul: (i = 0) => { ton(nota(86 + i * 3), 0.25, { tip: 'triangle', ses: 0.08 }); ton(nota(98 + i * 3), 0.12, { tip: 'sine', ses: 0.04 }); },
    // Zar atıldı: tıkırtılar + yükselen ton
    zar: () => {
      [0, 0.07, 0.15, 0.22].forEach((t, i) => { gurultu(0.04, { t0: t, f: 2500 + i * 400, ses: 0.06, q: 3 }); ton(nota(76 + i * 2), 0.05, { tip: 'square', t0: t, ses: 0.025 }); });
      ton(nota(84), 0.25, { tip: 'triangle', t0: 0.3, ses: 0.08, bitis: nota(91) });
    },
    // Buz çatladı: kısa, tiz çıtırtı
    buzCatlak: () => { gurultu(0.09, { f: 6500, ses: 0.08, q: 2, tip: 'highpass' }); ton(nota(98), 0.08, { tip: 'triangle', ses: 0.05, bitis: nota(91) }); },
    // Buz çözüldü: kırılma + parıltı
    buzCozuldu: () => {
      gurultu(0.25, { f: 7000, f2: 2500, ses: 0.1, q: 1.2 });
      arpej([91, 95, 98, 103], 0.05, { tip: 'sine', ses: 0.07, sure: 0.35, t0: 0.08 });
    },
    // Bomba fitili (son 5 saniye)
    bombaTik: () => { ton(1650, 0.035, { tip: 'square', ses: 0.03 }); gurultu(0.05, { f: 3000, ses: 0.025 }); },
    // Bomba patladı: derin gümleme + gürültü
    patlama: () => {
      vurus({ f: 95, f2: 28, ses: 0.32, sure: 0.6 });
      gurultu(0.8, { f: 1800, f2: 180, ses: 0.18, q: 0.6, tip: 'lowpass' });
    },
    // Bomba imha edildi: rahatlama arpeji
    imha: () => { gurultu(0.15, { f: 2500, f2: 600, ses: 0.05 }); arpej([72, 76, 79, 84], 0.06, { tip: 'triangle', ses: 0.1, sure: 0.25, t0: 0.06 }); },
  };

  // ---------- Arka plan müziği ----------
  // Akor yürüyüşü + bas + arpej; son saniyelerde tempo artar ve davul girer.
  const AKOR = {
    sakin: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],   // Am F C G
    gerilim: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], // Am F Dm E
  };
  const MODLAR = {
    lobi:    { bpm: 84,  akor: 'sakin',   pad: 1,   bas: 0.5, arp: 0.5, hat: 0,   kick: 0 },
    oyun:    { bpm: 100, akor: 'sakin',   pad: 0.8, bas: 1,   arp: 1,   hat: 0.5, kick: 0 },
    gerilim: { bpm: 132, akor: 'gerilim', pad: 0.6, bas: 1.1, arp: 1.1, hat: 1,   kick: 1 },
    sonuc:   { bpm: 88,  akor: 'sakin',   pad: 1,   bas: 0.4, arp: 0.3, hat: 0,   kick: 0 },
  };
  const ARP_DESEN = [0, 1, 2, 1, 3, 2, 1, 2];
  let mod = 'kapali';
  let adim = 0;
  let sonraki = 0;

  function adimCal(a, t, m, adimSure) {
    const bar = Math.floor(a / 8) % 4;
    const ic = a % 8;
    const akor = AKOR[m.akor][bar];
    if (ic === 0 && m.pad) {
      const uzun = adimSure * 8;
      for (const n of [...akor, akor[0] + 12]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = nota(n);
        osc.detune.value = Math.random() * 10 - 5;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.03 * m.pad, t + 0.35);
        g.gain.setValueAtTime(0.03 * m.pad, t + uzun - 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + uzun + 0.2);
        osc.connect(g);
        g.connect(padFiltre);
        osc.start(t);
        osc.stop(t + uzun + 0.3);
      }
    }
    // Bas: zamanlarda (gerilimde her vuruşta)
    if (m.bas && (ic % (m.kick ? 2 : 4) === 0)) {
      ton(nota(akor[0] - 12), adimSure * 1.8, { tip: 'triangle', ses: 0.09 * m.bas, atak: 0.01, hedef: muzikBus, mutlak: t });
    }
    // Arpej: sekizlik notalar (lobide yarı yoğunluk)
    if (m.arp && (m.arp >= 1 || ic % 2 === 0)) {
      const d = ARP_DESEN[ic];
      const n = d === 3 ? akor[0] + 24 : akor[d] + 12;
      ton(nota(n), adimSure * 1.4, { tip: 'triangle', ses: 0.028 * m.arp, atak: 0.005, hedef: muzikBus, mutlak: t });
    }
    if (m.hat && (m.hat >= 1 || ic % 2 === 1)) gurultu(0.04, { f: 9000, tip: 'highpass', ses: 0.018 * m.hat, hedef: muzikBus, mutlak: t });
    if (m.kick && ic % 4 === 0) vurus({ ses: 0.16, hedef: muzikBus, mutlak: t });
  }

  function zamanla() {
    if (!calisiyor() || !muzikAcik || mod === 'kapali' || document.hidden) return;
    const m = MODLAR[mod];
    const adimSure = 60 / m.bpm / 2;
    // Geride kaldıysa (sekme arkadaydı) toparla, birikmiş notaları çalma
    if (sonraki < ctx.currentTime) sonraki = ctx.currentTime + 0.05;
    while (sonraki < ctx.currentTime + 0.25) {
      adimCal(adim, sonraki, m, adimSure);
      sonraki += adimSure;
      adim = (adim + 1) % 32;
    }
  }
  setInterval(zamanla, 60);

  function muzikDuzeyUygula() {
    if (!muzikBus) return;
    const hedef = muzikAcik && mod !== 'kapali' ? muzikDuzey * 0.5 : 0;
    muzikBus.gain.cancelScheduledValues(ctx.currentTime);
    muzikBus.gain.setTargetAtTime(hedef, ctx.currentTime, 0.25);
  }

  return {
    cal(ad, ...arg) { try { sesler[ad]?.(...arg); } catch {} },
    // Müzik modu: 'kapali' | 'lobi' | 'oyun' | 'gerilim' | 'sonuc'
    muzik(yeni) {
      if (yeni === mod || !(yeni === 'kapali' || MODLAR[yeni])) return;
      const onceki = mod;
      mod = yeni;
      // Sakin moddan gerilime geçerken yürüyüşü bar başından al
      if (yeni === 'gerilim' || onceki === 'kapali') adim = 0;
      try { muzikDuzeyUygula(); } catch {}
    },
    get acik() { return acik; },
    set acik(v) { acik = !!v; yaz('ka_ses', acik ? '1' : '0'); },
    get duzey() { return duzey; },
    set duzey(v) { duzey = sinirla(v); if (ana) ana.gain.value = duzey; yaz('ka_sesDuzey', String(duzey)); },
    get muzikAcik() { return muzikAcik; },
    set muzikAcik(v) { muzikAcik = !!v; yaz('ka_muzik', muzikAcik ? '1' : '0'); try { muzikDuzeyUygula(); } catch {} },
    get muzikDuzey() { return muzikDuzey; },
    set muzikDuzey(v) { muzikDuzey = sinirla(v); yaz('ka_muzikDuzey', String(muzikDuzey)); try { muzikDuzeyUygula(); } catch {} },
  };
})();
