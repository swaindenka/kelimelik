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
};

function seviyeTuru(seviye) {
  if (seviye % 10 === 0) return 'patron';
  if (seviye % 5 === 0) return 'altin';
  if (seviye >= 3 && Math.random() < 0.22) return 'hizli';
  return 'normal';
}

// Seviyeye göre zorluk ayarı
function seviyeAyari(seviye, zorluk = ZORLUKLAR.normal, tur = TURLER.normal) {
  const e = Math.max(1, seviye + zorluk.kayma); // özellikler için etkin seviye
  const uzunluk = Math.min(10, (e <= 2 ? 6 : e <= 5 ? 7 : e <= 9 ? 8 : e <= 14 ? 9 : 10) + tur.uzunluk);
  const minHarf = seviye < zorluk.minHarfSeviye ? 3 : 4;
  const oran = Math.min(Math.min(0.3 + 0.025 * (seviye - 1), 0.65) * zorluk.oran * tur.oran, 0.8);
  const gizli = e >= 12 || (e >= 4 && e % 2 === 0);
  const sahte = e >= 13 || (e >= 7 && Math.random() < 0.5);
  return { uzunluk, minHarf, oran, gizli, sahte, minKelime: 8, maxKelime: 30 };
}

function seviyeUret(seviye, zorlukAd = 'normal', turAd = seviyeTuru(seviye), dilKod = 'tr') {
  const dil = dilBul(dilKod);
  const zorluk = ZORLUKLAR[zorlukAd] || ZORLUKLAR.normal;
  const tur = TURLER[turAd] || TURLER.normal;
  const ayar = seviyeAyari(seviye, zorluk, tur);
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
    sureCarpan: zorluk.sure * tur.sure,
    takimPuan: 0,
  };
  // Puan hedefi: tahtadaki bütün kelimelerin toplam puanının belli bir oranı
  for (const s of tahta) s.puan = kelimePuani(lv, s.w) * (s.hazine ? HAZINE_CARPAN : 1);
  lv.puanMax = tahta.reduce((t, s) => t + s.puan, 0);
  // Uzun kelimeler puanın büyük kısmını taşıdığından oran 0.75 ile yumuşatılır
  // (kelime sayısı sistemindeki zorluğa yakın kalsın diye)
  lv.puanHedef = Math.max(50, Math.round(lv.puanMax * ayar.oran * PUAN_HEDEF_YUMUSATMA / 5) * 5);
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
  if (!sigarMi(sayac(w), lv.harfSayaci)) return { tur: 'harf', w };
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
      if (!h.sahte && h.ch === ch && !kullanilan.has(i) && (en < 0 || h.carpan > lv.harfler[en].carpan)) en = i;
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

module.exports = { seviyeUret, seviyeTuru, tahminKontrol, kelimePuani, yildiz, esikler, uzunlukCarpani, temizle, trKucuk, enKucuk, harfDegeri, DILLER, ALFABE, HARF_DEGER, PUAN_OLCEK, HAZINE_CARPAN, ZORLUKLAR, TURLER };
