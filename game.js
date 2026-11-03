// Kelime Avı — oyun mantığı (sözlük, seviye üretimi, tahmin kontrolü)
const fs = require('fs');
const path = require('path');


const PUAN_HEDEF_YUMUSATMA = 0.75;
const HAZINE_CARPAN = 2; // hazine kelimenin puan çarpanı

function trKucuk(s) {
  return String(s).replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr-TR')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u');
}

// İngilizce: Türkçe klavyeden gelen İ/ı da i sayılır, aksanlar atılır (é → e)
function enKucuk(s) {
  return String(s).replace(/[İı]/g, 'i').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Oyun dilleri: alfabe, harf puanları, sözlük ve küçük harfe çevirme kuralı
const DILLER = {
  tr: {
    ad: 'Türkçe',
    alfabe: 'abcçdefgğhıijklmnoöprsştuüvyz',
    // Türkçede sık geçen harf az, nadir harf çok puan
    harfDeger: {
      a: 1, e: 1, i: 1, k: 1, l: 1, n: 1, r: 1, t: 1,
      ı: 2, m: 2, o: 2, s: 2, u: 2,
      b: 3, d: 3, ü: 3, y: 3,
      c: 4, ç: 4, ş: 4, z: 4,
      g: 5, h: 5, p: 5,
      f: 7, ö: 7, v: 7,
      ğ: 8, j: 10,
    },
    dosya: 'sozluk.json',
    kucuk: trKucuk,
    yerel: 'tr',
    tohumMin: 60,     // ana kelimenin en düşük sıklığı (iyice bilinen bir kelime olsun)
  },
  en: {
    ad: 'English',
    alfabe: 'abcdefghijklmnopqrstuvwxyz',
    // Klasik kelime oyunu dağılımı
    harfDeger: {
      a: 1, e: 1, i: 1, l: 1, n: 1, o: 1, r: 1, s: 1, t: 1, u: 1,
      d: 2, g: 2,
      b: 3, c: 3, m: 3, p: 3,
      f: 4, h: 4, v: 4, w: 4, y: 4,
      k: 5,
      j: 8, x: 8,
      q: 10, z: 10,
    },
    dosya: 'sozluk-en.json',
    kucuk: enKucuk,
    yerel: 'en',
    tohumMin: 3000,   // İngilizce derlem daha büyük; sıklıklar daha yüksek
  },
};
for (const dil of Object.values(DILLER)) {
  const sozluk = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', dil.dosya), 'utf8'));
  dil.tum = new Set(sozluk.tum);   // kabul edilen tüm kelimeler (bonus)
  dil.yaygin = sozluk.yaygin;      // { kelime: sıklık } — tahtaya çıkabilen kelimeler
  dil.yayginListe = Object.keys(dil.yaygin).map((w) => ({ w, c: sayac(w), f: dil.yaygin[w] }));
  dil.uzunlugaGore = {};
  for (const k of dil.yayginListe) (dil.uzunlugaGore[k.w.length] ||= []).push(k);
}
const dilBul = (kod) => DILLER[kod] || DILLER.tr;
const harfDegeri = (kod, ch) => dilBul(kod).harfDeger[ch] || 1;

function temizle(s, kod = 'tr') {
  const dil = dilBul(kod);
  return [...dil.kucuk(s)].filter((ch) => dil.alfabe.includes(ch)).join('');
}

function sayac(w) {
  const c = {};
  for (const ch of w) c[ch] = (c[ch] || 0) + 1;
  return c;
}

function sigarMi(c, harfler) {
  for (const k in c) if ((harfler[k] || 0) < c[k]) return false;
  return true;
}

function karistir(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Oda genelinde seçilen zorluk.
// kayma: özelliklerin (harf sayısı, gizli/sahte harf) kaç seviye erken/geç geleceği
const ZORLUKLAR = {
  kolay:  { ad: 'Kolay',  ikon: '🌱', oran: 0.75, sure: 1.25, kayma: -3, minHarfSeviye: 8, puan: 0.8 },
  normal: { ad: 'Normal', ikon: '⚔️', oran: 1,    sure: 1,    kayma: 0,  minHarfSeviye: 5, puan: 1 },
  zor:    { ad: 'Zor',    ikon: '🔥', oran: 1.15, sure: 0.85, kayma: 2,  minHarfSeviye: 3, puan: 1.25 },
  uzman:  { ad: 'Uzman',  ikon: '💀', oran: 1.3,  sure: 0.75, kayma: 4,  minHarfSeviye: 2, puan: 1.5 },
};

// Özel seviye türleri
const TURLER = {
  normal: { ad: '', ikon: '', aciklama: '', puan: 1, sure: 1, oran: 1, uzunluk: 0 },
  hizli:  { ad: 'Hızlı Tur', ikon: '⚡', aciklama: 'Süre kısa, hedef düşük · puanlar ×1.25', puan: 1.25, sure: 0.6, oran: 0.75, uzunluk: 0 },
  altin:  { ad: 'Altın Tur', ikon: '💰', aciklama: 'Bu seviyede bütün puanlar ×2', puan: 2, sure: 1, oran: 1, uzunluk: 0 },
  patron: { ad: 'Patron Seviyesi', ikon: '👑', aciklama: 'Bir harf fazla, hedef yüksek · geçerseniz +1 can', puan: 1.5, sure: 1.2, oran: 1.12, uzunluk: 1 },
  // Az süreyle başlar; bulunan her kelime süre ekler (süre başlangıçtakini aşamaz)
  kumsaati: { ad: 'Kum Saati', ikon: '⏳', aciklama: 'Az süreyle başlar · her kelime süre ekler · puanlar ×1.2', puan: 1.2, sure: 0.45, oran: 0.9, uzunluk: 0, kumsaati: true },
  // En kısa kelimeler tahtada yok: en az harf sayısı bir fazla
  uzun: { ad: 'Uzun Kelime Turu', ikon: '📏', aciklama: 'Kısa kelimeler yok · en az bir harf daha uzun · puanlar ×1.3', puan: 1.3, sure: 1.05, oran: 1, uzunluk: 0, minEk: 1 },
  // Son bulunan kelimenin son harfiyle başlayan kelime ×2 (zincir uzadıkça takım hızlanır)
  zincir: { ad: 'Zincir Turu', ikon: '🔗', aciklama: 'Son kelimenin son harfiyle başlayan kelime ×2 puan', puan: 1, sure: 1, oran: 1.15, uzunluk: 0, zincir: true },
  // Seviye başında 3 görev; tamamlanan her görev takıma ödül puanı getirir
  gorev: { ad: 'Görev Turu', ikon: '🎯', aciklama: '3 görev · her tamamlanan görev takıma ödül', puan: 1, sure: 1.05, oran: 1.1, uzunluk: 0, gorev: true },
  // Taş çarpanları her 15 saniyede yeniden atılır
  zar: { ad: 'Zar Turu', ikon: '🎲', aciklama: 'Taş çarpanları her 15 saniyede yeniden atılır', puan: 1.1, sure: 1, oran: 1, uzunluk: 0, zar: true },
  // Harfler birkaç saniyede bir, yazarken de karışır
  firtina: { ad: 'Fırtına', ikon: '🌪️', aciklama: 'Harfler durmadan karışır, yazarken bile · puanlar ×1.25', puan: 1.25, sure: 1, oran: 0.95, uzunluk: 0, firtina: true },
};
const ZAR_ARALIK = 15000; // zar turunda çarpanların yeniden atılma aralığı (ms)

// Kalabalık dengesi: oyuncu arttıkça kelimeler hızlı bulunur, seviye kolaylaşır.
// Her ek oyuncu hedefi %14 artırır (en çok %60), süreyi %5 kısaltır (en çok %25)
// ve tahtaya daha çok kelime çıkarır.
function kalabalikCarpani(oyuncu = 1) {
  const n = Math.max(1, Math.min(30, Math.floor(oyuncu) || 1));
  return {
    n,
    hedef: Math.round(Math.min(1.6, 1 + 0.14 * (n - 1)) * 100) / 100,
    sure: Math.round(Math.max(0.75, 1 - 0.05 * (n - 1)) * 100) / 100,
    minKelime: Math.min(16, 8 + 2 * (n - 1)),
    maxKelime: Math.min(40, 30 + 2 * (n - 1)),
  };
}
const HEDEF_TAVAN = 0.85; // hedef, tam puanın en çok %85'i (seviye hep geçilebilir kalsın)

// Rastgele özel türler ve açıldıkları seviye
const RASTGELE_TURLER = [['hizli', 3], ['gorev', 3], ['kumsaati', 4], ['zincir', 4], ['firtina', 5], ['uzun', 6], ['zar', 7]];

// onceki: bir önceki seviyenin türü — aynı özel tür art arda gelmez
function seviyeTuru(seviye, onceki = null) {
  if (seviye % 10 === 0) return 'patron';
  if (seviye % 5 === 0) return 'altin';
  // 3–5. seviyelerde %40, sonrasında %50 olasılıkla özel tür
  const olasilik = seviye < 3 ? 0 : seviye < 6 ? 0.4 : 0.5;
  if (Math.random() >= olasilik) return 'normal';
  const havuz = RASTGELE_TURLER.filter(([t, en]) => seviye >= en && t !== onceki).map(([t]) => t);
  return havuz.length ? havuz[Math.floor(Math.random() * havuz.length)] : 'normal';
}

// Zar turu: çarpanları sil, uygun taşlardan ikisine yeniden ×2 / ×3 ver; bulunmamış kelimelerin
// puanlarını yeni çarpanlarla güncelle. Değişen taşların indekslerini döndürür.
function zarAt(lv) {
  const uygun = lv.harfler.map((h, i) => i).filter((i) => !lv.harfler[i].sahte && !lv.harfler[i].gizli && !lv.harfler[i].buz);
  for (const h of lv.harfler) h.carpan = 1;
  const secilen = karistir(uygun).slice(0, Math.min(2, uygun.length));
  secilen.forEach((i, k) => { lv.harfler[i].carpan = k === 0 && Math.random() < 0.5 ? 3 : 2; });
  for (const s of lv.tahta) if (!s.bulan) s.puan = kelimePuani(lv, s.w) * (s.hazine ? HAZINE_CARPAN : 1);
  return secilen;
}

// Görev turu: tahtaya göre yapılabilir 3 görev. tur: uzunluk | harf | bonus | seri | buyuk
function gorevUret(lv, dil) {
  const adaylar = [];
  const say = {};
  for (const s of lv.tahta) say[s.w.length] = (say[s.w.length] || 0) + 1;
  const uzunluklar = Object.keys(say).map(Number).filter((u) => u > lv.minHarf && u < lv.buyukUzunluk && say[u] >= 3);
  if (uzunluklar.length) {
    const u = uzunluklar[Math.floor(Math.random() * uzunluklar.length)];
    adaylar.push({ tur: 'uzunluk', u, hedef: Math.min(4, Math.ceil(say[u] * 0.6)), metin: `${u} harfli kelime`, kisa: `${u} harfli` });
  }
  const harfler = [...new Set(lv.harfler.filter((h) => !h.sahte).map((h) => h.ch))]
    .map((ch) => ({ ch, n: lv.tahta.filter((s) => s.w.includes(ch)).length }))
    .filter((x) => x.n >= 4 && x.n <= lv.tahta.length * 0.7);
  if (harfler.length) {
    const x = harfler[Math.floor(Math.random() * harfler.length)];
    adaylar.push({ tur: 'harf', ch: x.ch, hedef: Math.min(4, Math.ceil(x.n * 0.5)), metin: `${x.ch.toLocaleUpperCase(dil.yerel)} geçen kelime`, kisa: `${x.ch.toLocaleUpperCase(dil.yerel)} geçen` });
  }
  adaylar.push({ tur: 'bonus', hedef: 2, metin: 'bonus kelime', kisa: 'bonus' });
  adaylar.push({ tur: 'seri', hedef: 3, metin: 'kelimelik seri (bir oyuncu)', kisa: '🔥 seri' });
  adaylar.push({ tur: 'buyuk', hedef: 1, metin: 'büyük kelimeyi bul', kisa: 'büyük kelime' });
  const odul = Math.max(20, Math.round(lv.puanHedef * 0.12 / 5) * 5);
  return karistir(adaylar).slice(0, 3).map((g) => ({ ...g, ilerleme: 0, odul, tamam: false }));
}

// Seviyeye göre zorluk ayarı
function seviyeAyari(seviye, zorluk = ZORLUKLAR.normal, tur = TURLER.normal, kalabalik = kalabalikCarpani(1)) {
  const e = Math.max(1, seviye + zorluk.kayma); // özellikler için etkin seviye
  const uzunluk = Math.min(10, (e <= 2 ? 6 : e <= 5 ? 7 : e <= 9 ? 8 : e <= 14 ? 9 : 10) + tur.uzunluk);
  const minHarf = (seviye < zorluk.minHarfSeviye ? 3 : 4) + (tur.minEk || 0);
  const oran = Math.min(Math.min(0.3 + 0.025 * (seviye - 1), 0.65) * zorluk.oran * tur.oran, 0.8);
  const gizli = e >= 12 || (e >= 4 && e % 2 === 0);
  const sahte = e >= 13 || (e >= 7 && Math.random() < 0.5);
  // Yeni tuzaklar: buzlu harf (5. etkin seviyeden), bomba harf (8. etkin seviyeden)
  const buz = e >= 5 && Math.random() < 0.35;
  const bomba = e >= 8 && Math.random() < 0.3;
  // Aynı anda en çok 2 tuzak (10. etkin seviyeden sonra 3); fazlası rastgele düşer
  const tavan = e >= 10 ? 3 : 2;
  const tuzak = { gizli, sahte, buz, bomba };
  const acik = karistir(Object.keys(tuzak).filter((k) => tuzak[k]));
  for (const k of acik.slice(tavan)) tuzak[k] = false;
  return { uzunluk, minHarf, oran, ...tuzak, minKelime: kalabalik.minKelime, maxKelime: kalabalik.maxKelime };
}

// secenek.oyuncu: seviye başındaki bağlı oyuncu sayısı (kalabalık dengesi)
function seviyeUret(seviye, zorlukAd = 'normal', turAd, dilKod = 'tr', secenek = {}) {
  if (!turAd) turAd = seviyeTuru(seviye, secenek.onceki);
  const dil = dilBul(dilKod);
  const zorluk = ZORLUKLAR[zorlukAd] || ZORLUKLAR.normal;
  const tur = TURLER[turAd] || TURLER.normal;
  const kalabalik = kalabalikCarpani(secenek.oyuncu);
  const ayar = seviyeAyari(seviye, zorluk, tur, kalabalik);
  const adaylar = dil.uzunlugaGore[ayar.uzunluk];
  let enIyi = null;
  for (let deneme = 0; deneme < 400; deneme++) {
    const tohum = adaylar[Math.floor(Math.random() * adaylar.length)];
    if (tohum.f < dil.tohumMin) continue; // ana kelime iyice bilinen bir kelime olsun
    const kelimeler = dil.yayginListe.filter((k) => k.w.length >= ayar.minHarf && k.w.length <= ayar.uzunluk && sigarMi(k.c, tohum.c));
    if (kelimeler.length >= ayar.minKelime) { enIyi = { tohum, kelimeler }; break; }
    if (!enIyi || kelimeler.length > enIyi.kelimeler.length) enIyi = { tohum, kelimeler };
  }
  let { tohum, kelimeler } = enIyi;

  // Çok fazla kelime varsa: uzunları tut, kalanını en yaygınlardan doldur
  if (kelimeler.length > ayar.maxKelime) {
    const uzunlar = kelimeler.filter((k) => k.w.length >= ayar.uzunluk - 1);
    const digerleri = kelimeler.filter((k) => k.w.length < ayar.uzunluk - 1).sort((a, b) => b.f - a.f);
    kelimeler = uzunlar.slice(0, ayar.maxKelime).concat(digerleri.slice(0, Math.max(0, ayar.maxKelime - uzunlar.length)));
  }

  const tahta = kelimeler.map((k) => k.w)
    .sort((a, b) => a.length - b.length || a.localeCompare(b, dil.yerel))
    .map((w) => ({ w, bulan: null, zaman: 0 }));

  // Hazine kelime: 2. seviyeden itibaren tahtadaki bir kelime parlar — ×2 puan ve ek süre getirir.
  // Mümkünse orta uzunlukta bir kelime seçilir (en kısa da büyük kelime de değil).
  if (seviye >= 2) {
    const orta = tahta.filter((s) => s.w.length > ayar.minHarf && s.w.length < ayar.uzunluk);
    const havuz = orta.length ? orta : tahta.filter((s) => s.w.length < ayar.uzunluk);
    if (havuz.length) havuz[Math.floor(Math.random() * havuz.length)].hazine = true;
  }

  const harfler = karistir([...tohum.w].map((ch) => ({ ch, gizli: false, sahte: false, carpan: 1 })));
  // Rastgele çarpanlı taşlar: 2. seviyeden itibaren bir ×2, 6. seviyeden itibaren bir tane daha (×2 ya da ×3)
  const ozelSay = seviye >= 6 ? 2 : seviye >= 2 ? 1 : 0;
  karistir(harfler.map((_, i) => i)).slice(0, ozelSay).forEach((i, k) => {
    harfler[i].carpan = k === 1 && Math.random() < 0.4 ? 3 : 2;
  });
  if (ayar.gizli) harfler[Math.floor(Math.random() * harfler.length)].gizli = true;
  // Buzlu harf: takım birkaç kelime bulana kadar kullanılamaz. Bomba harf: fitili yanar,
  // o harfi içeren bir kelime bulunmazsa patlar (süre sunucuda kurulur). İkisi de gizli harf olmaz.
  const bosta = () => karistir(harfler.filter((h) => !h.gizli && !h.buz && !h.bomba));
  if (ayar.buz) bosta()[0].buz = true;
  if (ayar.bomba) bosta()[0].bomba = true;
  if (ayar.sahte) {
    // Kelimede olmayan, rastgele bir harf ekle — çoğu zaman cazip, yüksek puanlı bir harf
    const yok = [...dil.alfabe].filter((ch) => !tohum.c[ch]);
    const cazip = yok.filter((ch) => dil.harfDeger[ch] >= 4);
    const havuz = cazip.length && Math.random() < 0.7 ? cazip : yok;
    const ch = havuz[Math.floor(Math.random() * havuz.length)];
    harfler.splice(Math.floor(Math.random() * (harfler.length + 1)), 0, { ch, gizli: false, sahte: true, carpan: 1 });
  }

  const lv = {
    seviye,
    dil: dilKod in DILLER ? dilKod : 'tr',
    tohum: tohum.w,
    harfSayaci: tohum.c,
    harfler,
    tahta,
    bonus: [],
    minHarf: ayar.minHarf,
    buyukUzunluk: ayar.uzunluk,
    gizliAcik: false,
    sahteAcik: false,
    zorluk: zorlukAd in ZORLUKLAR ? zorlukAd : 'normal',
    tur: turAd in TURLER ? turAd : 'normal',
    puanCarpan: zorluk.puan * tur.puan,
    sureCarpan: zorluk.sure * tur.sure * kalabalik.sure,
    kalabalik,
    kumsaati: !!tur.kumsaati,
    // Buz, bu kadar kelime (tahta ya da bonus) bulununca çözülür
    buzKalan: harfler.some((h) => h.buz) ? (tahta.length >= 15 ? 3 : 2) : 0,
    takimPuan: 0,
  };
  // Puan hedefi: tahtadaki bütün kelimelerin toplam puanının belli bir oranı
  for (const s of tahta) s.puan = kelimePuani(lv, s.w) * (s.hazine ? HAZINE_CARPAN : 1);
  lv.puanMax = tahta.reduce((t, s) => t + s.puan, 0);
  // Uzun kelimeler puanın büyük kısmını taşıdığından oran 0.75 ile yumuşatılır
  // (kelime sayısı sistemindeki zorluğa yakın kalsın diye)
  const taban = lv.puanMax * ayar.oran * PUAN_HEDEF_YUMUSATMA;
  // Kalabalık dengesi hedefi artırır ama tam puanın %85'ini geçmez (taban hedefin altına da inmez)
  const kalabalikHedef = Math.max(taban, Math.min(taban * kalabalik.hedef, lv.puanMax * HEDEF_TAVAN));
  lv.puanHedef = Math.max(50, Math.round(kalabalikHedef / 5) * 5);
  lv.tabanHedef = Math.max(50, Math.round(taban / 5) * 5);
  if (tur.zincir) lv.zincir = { harf: null, n: 0 }; // harf: sıradaki zincir harfi, n: zincir uzunluğu
  if (tur.gorev) lv.gorevler = gorevUret(lv, dil);
  return lv;
}

// Tahmin kontrolü — sonucu ve ilgili kaydı döndürür
function tahminKontrol(lv, girdi) {
  const dil = dilBul(lv.dil);
  const ham = dil.kucuk(girdi).trim();
  const w = temizle(girdi, lv.dil);
  if (!ham) return { tur: 'bos' };
  if (w !== ham) return { tur: 'yok', w: ham.slice(0, 20) };
  if (w.length < lv.minHarf) return { tur: 'kisa', w };
  const c = sayac(w);
  if (!sigarMi(c, lv.harfSayaci)) return { tur: 'harf', w };
  // Buzlu taş çözülene kadar sayılmaz: kelime ancak o taşla yazılabiliyorsa reddedilir
  const buzlu = lv.harfler.find((h) => h.buz);
  if (buzlu) {
    const kullanilabilir = { ...lv.harfSayaci, [buzlu.ch]: (lv.harfSayaci[buzlu.ch] || 0) - 1 };
    if (!sigarMi(c, kullanilabilir)) return { tur: 'buz', w, ch: buzlu.ch, kalan: lv.buzKalan };
  }
  const i = lv.tahta.findIndex((s) => s.w === w);
  if (i >= 0) return lv.tahta[i].bulan ? { tur: 'zaten', w, i } : { tur: 'yeni', w, i };
  if (lv.bonus.some((b) => b.w === w)) return { tur: 'zatenBonus', w };
  if (dil.tum.has(w) || dil.yaygin[w]) return { tur: 'bonus', w };
  return { tur: 'yok', w };
}

// Kelimenin harf toplamı: her harf için o harfi taşıyan, en yüksek çarpanlı boştaki taş kullanılır
function harfToplami(lv, w) {
  const kullanilan = new Set();
  let toplam = 0;
  for (const ch of w) {
    let en = -1;
    lv.harfler.forEach((h, i) => {
      if (!h.sahte && !h.buz && h.ch === ch && !kullanilan.has(i) && (en < 0 || h.carpan > lv.harfler[en].carpan)) en = i;
    });
    if (en >= 0) kullanilan.add(en);
    toplam += harfDegeri(lv.dil, ch) * (en >= 0 ? lv.harfler[en].carpan : 1);
  }
  return toplam;
}

const uzunlukCarpani = (n) => 1 + (n - 3) * 0.25; // 3 harf ×1, 4 harf ×1.25 … 10 harf ×2.75

const PUAN_OLCEK = 10; // taşlarda 1–10 yazar, kelime puanı 10 katı ölçekte (ör. "ara" = 30)

// Kelime puanı = harf puanları toplamı × 10 × uzunluk çarpanı × (büyük kelime ×2) × seviye çarpanı
function kelimePuani(lv, w) {
  const buyuk = w.length === lv.buyukUzunluk ? 2 : 1;
  return Math.max(1, Math.round(harfToplami(lv, w) * PUAN_OLCEK * uzunlukCarpani(w.length) * buyuk * (lv.puanCarpan || 1)));
}

// Yıldızlar takım puanına göre: ★ hedef · ★★ hedef ile tam puanın ortası · ★★★ tam puan ya da tüm kelimeler
function esikler(lv) {
  return [lv.puanHedef, Math.round((lv.puanHedef + lv.puanMax) / 2), lv.puanMax];
}
function yildiz(lv) {
  if (lv.tahta.every((s) => s.bulan)) return 3;
  const p = lv.takimPuan || 0;
  const [e1, e2, e3] = esikler(lv);
  return p >= e3 ? 3 : p >= e2 ? 2 : p >= e1 ? 1 : 0;
}

const ALFABE = DILLER.tr.alfabe;       // geriye dönük uyumluluk
const HARF_DEGER = DILLER.tr.harfDeger;

module.exports = { seviyeUret, seviyeTuru, kalabalikCarpani, zarAt, ZAR_ARALIK, tahminKontrol, kelimePuani, yildiz, esikler, uzunlukCarpani, temizle, trKucuk, enKucuk, harfDegeri, DILLER, ALFABE, HARF_DEGER, PUAN_OLCEK, HAZINE_CARPAN, ZORLUKLAR, TURLER };
