// Kelime Avı — çok oyunculu sunucu (Express + Socket.io)
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { seviyeUret, seviyeTuru, tahminKontrol, kelimePuani, yildiz, esikler, harfDegeri, kalabalikCarpani, zarAt, buzluKelime, ZAR_ARALIK, DILLER, HAZINE_CARPAN, ZORLUKLAR, TURLER } = require('./game');

const PORT = process.env.PORT || 3000;
const SONUC_SURESI = 16000;  // seviye sonu ekranı (ms) — tahtaya bakmaya zaman kalsın; herkes hazırsa erken başlar
const HAZINE_SURE = 8000;    // hazine kelimeyi bulmak takıma bu kadar süre kazandırır (ms)
const SON_HAMLE_MS = 10000;  // son 10 saniye: "son hamle"
const SON_HAMLE_CARPAN = 1.5; // son hamlede bulunan kelimelerin puan çarpanı
const SERI_SURESI = 8000;    // bu süre içinde yeni kelime bulan seriyi sürdürür (ms)
const SERI_BONUS = 0.1;      // seri adımı başına kelime puanına eklenen oran (%10)
const BONUS_ORAN = 0.3;      // tahtada olmayan sözlük kelimesi, tahta kelimesi puanının %30'u (bonus yağdırarak hedef kolay geçilmesin)
const SERI_UST = 5;          // en fazla kaç adım bonus verilir
const IPUCU_HAKKI = 3;       // seviye başına oda genelinde ipucu hakkı
const IPUCU_BEDEL = 25;      // ipucu alanın puanından düşülür
const PATRON_ARALIK = 10;    // patron seviyeleri (10, 20, …) yıldızla atlanamaz
const BOMBA_CEZA = 10000;    // patlayan bomba takımın süresinden düşer (ms)
const BOMBA_ODUL = 60;       // bombayı imha eden kelimeye ek puan (× seviye puan çarpanı)
// Kum saati turu: bulunan kelime süre ekler — 2 sn + 3 harften sonraki her iki harf için 1 sn (büyük kelime 6 sn)
const kumSaatiEk = (w, buyuk) => (buyuk ? 6000 : 2000 + Math.floor(Math.max(0, w.length - 3) / 2) * 1000);
const KUM_BONUS_EK = 1000;   // bonus kelime ekler
const ZINCIR_CARPAN = 2;     // zincir turunda zincir harfiyle başlayan kelimenin puan çarpanı
const TEPKILER = ['👏', '🔥', '😂', '😮', '😭', '❤️', '👍', '🎉'];
const RENKLER = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#20c997', '#f06595', '#94d82d', '#748ffc', '#e599f7', '#66d9e8'];

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

const odalar = new Map();

function odaKoduUret() {
  const harf = 'ABCDEFGHJKLMNPRSTUVYZ';
  let kod;
  do kod = Array.from({ length: 4 }, () => harf[Math.floor(Math.random() * harf.length)]).join('');
  while (odalar.has(kod));
  return kod;
}

function isimTemizle(s) {
  return String(s || '').replace(/[<>]/g, '').trim().slice(0, 16) || 'Oyuncu';
}

function yeniOda(sahipId) {
  const oda = {
    kod: odaKoduUret(),
    sahip: sahipId,
    oyuncular: new Map(),
    // ilerleme: 'yildiz' (yıldız kadar seviye) | 'tek' · dil: kelimelerin dili ('tr' | 'en')
    ayar: { sure: 100, can: 3, zorluk: 'normal', ilerleme: 'yildiz', dil: 'tr' },
    hazir: new Set(), // seviye arasında "hazırım" diyenler
    durum: 'lobi', // lobi | oyun | sonuc | bitti
    seviye: 1,
    can: 3,
    lv: null,
    lvSayac: 0,
    bitis: 0,
    akis: [],
    sohbet: [],
    zamanlayicilar: [],
    sonSonuc: null,
    bosSince: 0,
  };
  odalar.set(oda.kod, oda);
  return oda;
}

function zamanlayiciTemizle(oda) {
  oda.zamanlayicilar.forEach(clearTimeout);
  oda.zamanlayicilar = [];
}

// Oyun olayları (bulunan kelimeler, sistem mesajları)
function akisEkle(oda, kayit) {
  kayit.t = Date.now();
  oda.akis.push(kayit);
  if (oda.akis.length > 60) oda.akis.shift();
  io.to(oda.kod).emit('akis', kayit);
}

// Sohbet mesajları (lobide de oyunda da kalıcı)
function sohbetEkle(oda, kayit) {
  kayit.t = Date.now();
  oda.sohbet.push(kayit);
  if (oda.sohbet.length > 80) oda.sohbet.shift();
  io.to(oda.kod).emit('sohbet', kayit);
}

// İstemciye gönderilecek, kelimeleri sızdırmayan durum
function genelDurum(oda) {
  const lv = oda.lv;
  const oyuncular = [...oda.oyuncular.values()].map((p) => ({
    id: p.id, isim: p.isim, renk: p.renk, puan: p.puan, seviyePuan: p.seviyePuan,
    seviyeKelime: p.seviyeKelime || 0, bagli: p.bagli,
    // Oyun boyu kişisel istatistik (oyun sonu özeti için)
    kelime: p.oyunKelime || 0, enIyi: p.enIyi || null, enSeri: p.enSeri || 0,
  }));
  const d = {
    kod: oda.kod,
    sahip: oda.sahip,
    durum: oda.durum,
    ayar: oda.ayar,
    seviye: oda.seviye,
    can: oda.can,
    oyuncular,
    simdi: Date.now(),
    bitis: oda.bitis,
    sonSonuc: oda.sonSonuc,
    hazir: [...oda.hazir],
    kalabalik: kalabalikCarpani(aktifOyuncu(oda)),
  };
  if (lv) {
    const gizliGoster = oda.durum !== 'oyun';
    const buzluVar = lv.harfler.some((h) => h.buz);
    d.lv = {
      kimlik: lv.kimlik,
      dil: lv.dil,
      harfler: lv.harfler.map((h) => {
        const kapali = h.gizli && !lv.gizliAcik && !gizliGoster;
        return {
          ch: kapali ? '?' : h.ch,
          d: kapali ? null : harfDegeri(lv.dil, h.ch), // harf puanı
          x: h.carpan || 1,                          // taş çarpanı
          gizli: h.gizli,
          sahte: h.sahte && (lv.sahteAcik || gizliGoster),
          buz: !!h.buz, buzCozuldu: !!h.buzCozuldu,
          bomba: !!h.bomba, patladi: !!h.patladi, imha: !!h.imha,
        };
      }),
      tahta: lv.tahta.map((s) => {
        const goster = s.bulan || gizliGoster;
        const o = { n: s.w.length, w: goster ? s.w : null, bulan: s.bulan };
        if (goster) o.puan = s.kazanilan ?? s.puan;
        if (s.hazine) o.hz = true; // hazine kelimenin yeri herkese görünür, kendisi değil
        // İpucuyla açılan harfler: [konum, harf] çiftleri
        if (!goster && s.ipucu && s.ipucu.length) o.ip = s.ipucu.map((j) => [j, s.w[j]]);
        // Buz çözülene kadar yazılamayan kelimeler tahtada buzlu görünür (hangileri atlanmalı bilinsin)
        if (!goster && buzluVar && buzluKelime(lv, s.w)) o.bz = true;
        return o;
      }),
      bonus: lv.bonus,
      puanHedef: lv.puanHedef,
      puanMax: lv.puanMax,
      takimPuan: lv.takimPuan,
      esikler: esikler(lv),
      minHarf: lv.minHarf,
      buyukUzunluk: lv.buyukUzunluk,
      gizliVar: lv.harfler.some((h) => h.gizli),
      buzKalan: lv.buzKalan,
      buzSerbest: lv.buzSerbest || 0,
      bombaBitis: lv.bombaBitis || 0,
      kumsaati: lv.kumsaati,
      kalabalik: lv.kalabalik,
      tabanHedef: lv.tabanHedef,
      zincir: lv.zincir || null,
      gorevler: lv.gorevler || null,
      zarSonraki: lv.zarSonraki || 0,
      sahteVar: lv.harfler.some((h) => h.sahte),
      ipucuKalan: lv.ipucuKalan,
      ipucuBedel: IPUCU_BEDEL,
      sure: lv.sureMs,
      zorluk: lv.zorluk,
      tur: lv.tur,
      turAd: TURLER[lv.tur].ad,
      turIkon: TURLER[lv.tur].ikon,
      turAciklama: TURLER[lv.tur].aciklama,
      puanCarpan: lv.puanCarpan,
      hazineSure: HAZINE_SURE,
      hazineCarpan: HAZINE_CARPAN,
      sonHamleMs: SON_HAMLE_MS,
      sonHamleCarpan: SON_HAMLE_CARPAN,
    };
  }
  return d;
}

function yayinla(oda) {
  io.to(oda.kod).emit('durum', genelDurum(oda));
}

// Seviye bitiş zamanlayıcısını (yeniden) kur — hazine kelime süreyi uzatabildiği için ayrı tutulur
function bitisKur(oda) {
  clearTimeout(oda.bitisZ);
  oda.bitisZ = setTimeout(() => seviyeBitir(oda, 'sure'), Math.max(0, oda.bitis - Date.now()));
  oda.zamanlayicilar.push(oda.bitisZ);
}

// Seviye başında bağlı (ayrılmamış) oyuncu sayısı — kalabalık dengesi buna göre
function aktifOyuncu(oda) {
  return [...oda.oyuncular.values()].filter((p) => p.bagli && !p.ayrildi).length || 1;
}

// Süreyi kısalt (bomba): en az birkaç saniye kalsın
function sureKes(oda, ms) {
  oda.bitis = Math.max(Date.now() + 3000, oda.bitis - ms);
  bitisKur(oda);
}

// Kum saati: süre ekler ama "kum saatinin" alabileceğinden (lv.sureMs) fazlası birikmez
function kumSaatiEkle(oda, ms) {
  const once = oda.bitis;
  oda.bitis = Math.min(oda.bitis + ms, Date.now() + oda.lv.sureMs);
  if (oda.bitis !== once) bitisKur(oda);
  return Math.max(0, oda.bitis - once);
}

// Bulunan her kelime (tahta ya da bonus) buzu biraz kırar; yeterince kelime bulununca çözülür
function buzVur(oda) {
  const lv = oda.lv;
  const buzlu = lv.harfler.find((h) => h.buz);
  if (!buzlu) return;
  lv.buzKalan = Math.max(0, lv.buzKalan - 1);
  if (lv.buzKalan > 0) return akisEkle(oda, { tur: 'sistem', olay: 'buzCatlak', metin: `❄️ Buz çatladı — ${lv.buzKalan} kelime kaldı` });
  buzlu.buz = false;
  buzlu.buzCozuldu = true;
  akisEkle(oda, { tur: 'sistem', olay: 'buzCozuldu', metin: `❄️ Buz çözüldü! ${buzlu.ch.toLocaleUpperCase(lv.dil === 'en' ? 'en' : 'tr')} artık kullanılabilir` });
}

// Bomba harfini içeren bir kelime bulununca bomba imha edilir; bulan ek puan alır
function bombaKontrol(oda, oyuncu, w, takimaEkle) {
  const lv = oda.lv;
  const bomba = lv.harfler.find((h) => h.bomba);
  if (!bomba || !w.includes(bomba.ch)) return 0;
  bomba.bomba = false;
  bomba.imha = true;
  const odul = Math.round(BOMBA_ODUL * (lv.puanCarpan || 1));
  oyuncu.puan += odul;
  oyuncu.seviyePuan += odul;
  takimaEkle(odul);
  akisEkle(oda, { tur: 'sistem', olay: 'bombaImha', id: oyuncu.id, puan: odul, metin: `💣 Bomba imha edildi! +${odul} puan` });
  return odul;
}

function bombaPatlat(oda) {
  const lv = oda.lv;
  const bomba = lv?.harfler.find((h) => h.bomba);
  if (oda.durum !== 'oyun' || !bomba) return;
  bomba.bomba = false;
  bomba.patladi = true;
  sureKes(oda, BOMBA_CEZA);
  akisEkle(oda, { tur: 'sistem', olay: 'bombaPatladi', metin: `💥 Bomba patladı! −${BOMBA_CEZA / 1000} saniye` });
  yayinla(oda);
}

// Zincir turu: kelime sıradaki zincir harfiyle mi başlıyor? Sonra zinciri günceller.
function zincirIsle(lv, w) {
  if (!lv.zincir) return { zincirli: false, n: 0 };
  const zincirli = !!lv.zincir.harf && w[0] === lv.zincir.harf;
  lv.zincir.n = zincirli ? lv.zincir.n + 1 : 1;
  lv.zincir.harf = w[w.length - 1];
  return { zincirli, n: lv.zincir.n };
}

// Görev turu: bulunan kelimeye göre görevleri ilerlet; tamamlanan görev takıma ve bulana ödül verir
function gorevIlerlet(oda, oyuncu, o, takimaEkle) {
  const lv = oda.lv;
  if (!lv.gorevler) return [];
  const biten = [];
  for (const g of lv.gorevler) {
    if (g.tamam) continue;
    if (g.tur === 'uzunluk' && o.tur === 'yeni' && o.w.length === g.u) g.ilerleme++;
    else if (g.tur === 'harf' && o.tur === 'yeni' && o.w.includes(g.ch)) g.ilerleme++;
    else if (g.tur === 'bonus' && o.tur === 'bonus') g.ilerleme++;
    else if (g.tur === 'seri' && o.tur === 'yeni') g.ilerleme = Math.max(g.ilerleme, o.seri || 0);
    else if (g.tur === 'buyuk' && o.tur === 'yeni' && o.buyuk) g.ilerleme = 1;
    if (g.ilerleme < g.hedef) continue;
    g.ilerleme = g.hedef;
    g.tamam = true;
    g.tamamlayan = oyuncu.id;
    oyuncu.puan += g.odul;
    oyuncu.seviyePuan += g.odul;
    takimaEkle(g.odul);
    biten.push(g);
    akisEkle(oda, { tur: 'sistem', olay: 'gorevTamam', id: oyuncu.id, puan: g.odul, metin: `🎯 Görev tamam: ${g.hedef > 1 ? g.hedef + ' ' : ''}${g.metin} · +${g.odul} puan` });
  }
  return biten;
}

// Zar turu: her ZAR_ARALIK'ta taş çarpanları yeniden atılır
function zarDongusu(oda, lv) {
  lv.zarSonraki = Date.now() + ZAR_ARALIK;
  oda.zamanlayicilar.push(setTimeout(() => {
    if (oda.durum !== 'oyun' || oda.lv !== lv) return;
    zarAt(lv);
    akisEkle(oda, { tur: 'sistem', olay: 'zar', metin: `🎲 Zar atıldı: ${lv.harfler.filter((h) => h.carpan > 1).map((h) => `${h.ch.toLocaleUpperCase(lv.dil === 'en' ? 'en' : 'tr')} ×${h.carpan}`).join(', ')}` });
    zarDongusu(oda, lv);
    yayinla(oda);
  }, ZAR_ARALIK));
}

function sureUzat(oda, ms) {
  oda.bitis += ms;
  oda.lv.sureMs += ms; // istemcideki süre halkası orantılı kalsın
  bitisKur(oda);
}

function seviyeBaslat(oda) {
  zamanlayiciTemizle(oda);
  // Sonuç ekranında önceden duyurulan seviye türü kullanılır (yoksa yeni seçilir)
  oda.hazir.clear();
  oda.lv = seviyeUret(oda.seviye, oda.ayar.zorluk, oda.sonrakiTur || undefined, oda.ayar.dil, { oyuncu: aktifOyuncu(oda), onceki: oda.oncekiTur });
  oda.oncekiTur = oda.lv.tur;
  oda.sonrakiTur = null;
  oda.lv.kimlik = ++oda.lvSayac;
  oda.lv.ipucuKalan = IPUCU_HAKKI;
  oda.durum = 'oyun';
  oda.sonSonuc = null;
  // Süre: lobideki taban süre × zorluk × seviye türü × kalabalık (5 sn'ye yuvarlanır)
  const sure = Math.max(30, Math.round(oda.ayar.sure * oda.lv.sureCarpan / 5) * 5) * 1000;
  // Kum saati: az süreyle başlar; halka "kum saatinin" tamamını (türsüz süreyi) gösterir
  oda.lv.sureMs = oda.lv.kumsaati ? Math.round(oda.ayar.sure * oda.lv.sureCarpan / TURLER.kumsaati.sure / 5) * 5000 : sure;
  oda.bitis = Date.now() + sure;
  // Bomba harf: fitil sürenin ~%30'u (20–35 sn); o harfle kelime bulunmazsa patlar
  if (oda.lv.harfler.some((h) => h.bomba)) {
    const fitil = Math.min(35000, Math.max(20000, Math.round(sure * 0.3)));
    oda.lv.bombaBitis = Date.now() + fitil;
    oda.zamanlayicilar.push(setTimeout(() => bombaPatlat(oda), fitil));
  }
  for (const p of oda.oyuncular.values()) {
    p.seviyePuan = 0; p.seviyeKelime = 0; p.seri = 0; p.sonBulma = 0; p.seviyeSeri = 0;
  }
  if (oda.lv.harfler.some((h) => h.gizli)) {
    oda.zamanlayicilar.push(setTimeout(() => {
      oda.lv.gizliAcik = true;
      akisEkle(oda, { tur: 'sistem', olay: 'gizli', metin: 'Gizli harf açıldı!' });
      yayinla(oda);
    }, sure * 0.4));
  }
  if (oda.lv.harfler.some((h) => h.sahte)) {
    oda.zamanlayicilar.push(setTimeout(() => {
      oda.lv.sahteAcik = true;
      akisEkle(oda, { tur: 'sistem', olay: 'sahte', metin: 'Sahte harf ortaya çıktı!' });
      yayinla(oda);
    }, sure * 0.6));
  }
  if (oda.lv.tur === 'zar') zarDongusu(oda, oda.lv);
  bitisKur(oda);
  const tur = TURLER[oda.lv.tur];
  const k = oda.lv.kalabalik;
  const kalabalikNot = k.n > 1 ? ` · 👥 ${k.n} kişi: hedef +%${Math.round((oda.lv.puanHedef / oda.lv.tabanHedef - 1) * 100)}, süre ×${k.sure}` : '';
  akisEkle(oda, { tur: 'sistem', olay: 'basla', metin: `${tur.ad ? tur.ikon + ' ' + tur.ad + ' — ' : ''}Seviye ${oda.seviye} başladı — ${oda.lv.tahta.length} kelime, hedef ${oda.lv.puanHedef} puan${kalabalikNot}` });
  yayinla(oda);
}

// neden: 'sure' (süre doldu) | 'hepsi' (bütün kelimeler bulundu) | 'atla' (oda sahibi bitirdi)
function seviyeBitir(oda, neden = 'sure') {
  if (oda.durum !== 'oyun') return;
  zamanlayiciTemizle(oda);
  const lv = oda.lv;
  const bulunan = lv.tahta.filter((s) => s.bulan).length;
  const yld = yildiz(lv);
  const gecti = yld > 0;
  const buyuk = lv.tahta.find((s) => s.w.length === lv.buyukUzunluk && s.bulan);

  // Geçilen seviyede katkı yapan herkese bonus
  if (gecti) {
    const katki = new Set(lv.tahta.filter((s) => s.bulan).map((s) => s.bulan));
    for (const id of katki) {
      const p = oda.oyuncular.get(id);
      if (p) { const b = Math.round(oda.seviye * 10 * yld * (lv.puanCarpan || 1)); p.puan += b; p.seviyePuan += b; }
    }
  }

  const sirali = [...oda.oyuncular.values()].filter((p) => p.seviyePuan > 0).sort((a, b) => b.seviyePuan - a.seviyePuan);
  oda.sonSonuc = {
    seviye: oda.seviye,
    dil: lv.dil,
    neden,
    gecti,
    yildiz: yld,
    bulunan,
    toplam: lv.tahta.length,
    takimPuan: lv.takimPuan,
    puanHedef: lv.puanHedef,
    puanMax: lv.puanMax,
    tohum: lv.tohum,
    buyukBulan: buyuk ? buyuk.bulan : null,
    mvp: sirali.slice(0, 3).map((p) => ({ id: p.id, puan: p.seviyePuan, kelime: p.seviyeKelime || 0 })),
    tur: lv.tur,
    zorluk: lv.zorluk,
    canKazanildi: false,
    oduller: odulleriHesapla(oda, lv),
    esikler: esikler(lv),
    ilerleme: oda.ayar.ilerleme,
    atlama: 0,
  };

  if (gecti) {
    // Yıldız kadar ilerle: ★ +1, ★★ +2, ★★★ +3 seviye. Patron seviyeleri atlanamaz:
    // atlama bir sonraki patron seviyesinde durur (patron ve +1 can ödülü kaçmasın).
    const istenen = oda.ayar.ilerleme === 'tek' ? 1 : yld;
    const patronKapisi = Math.floor(oda.seviye / PATRON_ARALIK) * PATRON_ARALIK + PATRON_ARALIK;
    const hedef = Math.min(oda.seviye + istenen, patronKapisi);
    Object.assign(oda.sonSonuc, {
      atlama: hedef - oda.seviye,
      istenenAtlama: istenen,
      patronKapisi: hedef < oda.seviye + istenen,
    });
    oda.seviye = hedef;
    // Patron seviyesini geçmek bir can kazandırır
    if (lv.tur === 'patron' && oda.ayar.can > 0 && oda.can < oda.ayar.can) {
      oda.can += 1;
      oda.sonSonuc.canKazanildi = true;
    }
  } else if (oda.ayar.can > 0) {
    oda.can -= 1;
  }
  oda.sonSonuc.oyunBitti = !gecti && oda.ayar.can > 0 && oda.can <= 0;
  // Sıradaki seviyenin türü şimdiden seçilip sonuç ekranında duyurulur
  if (!oda.sonSonuc.oyunBitti) {
    oda.sonrakiTur = seviyeTuru(oda.seviye, lv.tur);
    const t = TURLER[oda.sonrakiTur];
    oda.sonSonuc.sonraki = { seviye: oda.seviye, tur: oda.sonrakiTur, ad: t.ad, ikon: t.ikon, aciklama: t.aciklama };
  }
  oda.durum = oda.sonSonuc.oyunBitti ? 'bitti' : 'sonuc';
  oda.bitis = Date.now() + SONUC_SURESI;
  akisEkle(oda, {
    tur: 'sistem',
    metin: gecti
      ? `Seviye geçildi! ${'★'.repeat(yld)} (${lv.takimPuan}/${lv.puanHedef} puan)${oda.sonSonuc.atlama > 1 ? ` · +${oda.sonSonuc.atlama} seviye` : ''}`
      : `Seviye başarısız (${lv.takimPuan}/${lv.puanHedef} puan)`,
  });
  yayinla(oda);
  if (!oda.sonSonuc.oyunBitti) {
    oda.zamanlayicilar.push(setTimeout(() => seviyeBaslat(oda), SONUC_SURESI));
  }
}

// Seviye sonu ödülleri: { k: tür, id: oyuncu, ...ayrıntı } — metinleri istemci üretir
function odulleriHesapla(oda, lv) {
  const liste = [];
  const bulunan = lv.tahta.filter((s) => s.bulan);
  if (bulunan.length) {
    const ilk = bulunan.reduce((a, b) => (b.zaman < a.zaman ? b : a));
    liste.push({ k: 'ilk', id: ilk.bulan, w: ilk.w });
    const deger = bulunan.reduce((a, b) => ((b.kazanilan || 0) > (a.kazanilan || 0) ? b : a));
    liste.push({ k: 'deger', id: deger.bulan, w: deger.w, puan: deger.kazanilan });
  }
  const hz = lv.tahta.find((s) => s.hazine && s.bulan);
  if (hz) liste.push({ k: 'hazine', id: hz.bulan, w: hz.w });
  if (lv.kurtarici) liste.push({ k: 'kurtarici', id: lv.kurtarici });
  let seriEn = null;
  for (const p of oda.oyuncular.values()) if ((p.seviyeSeri || 0) >= 3 && (!seriEn || p.seviyeSeri > seriEn.seviyeSeri)) seriEn = p;
  if (seriEn) liste.push({ k: 'seri', id: seriEn.id, n: seriEn.seviyeSeri });
  const bonusSay = {};
  for (const b of lv.bonus) bonusSay[b.bulan] = (bonusSay[b.bulan] || 0) + 1;
  const [bId, bN] = Object.entries(bonusSay).sort((a, b) => b[1] - a[1])[0] || [];
  if (bN >= 2) liste.push({ k: 'bonus', id: bId, n: bN });
  return liste;
}

function oyunuBaslat(oda) {
  oda.seviye = Number(process.env.BASLANGIC_SEVIYE) || 1;
  oda.can = oda.ayar.can;
  oda.akis = [];
  oda.sonrakiTur = null;
  ayrilanlariTemizle(oda);
  for (const p of oda.oyuncular.values()) {
    p.puan = 0; p.seviyePuan = 0; p.oyunKelime = 0; p.enIyi = null; p.enSeri = 0;
  }
  seviyeBaslat(oda);
}

// Oyun sırasında ayrılanlar skor/akış tutarlı kalsın diye tutulur; lobiye ya da yeni oyuna geçince silinir
function ayrilanlariTemizle(oda) {
  for (const [id, p] of oda.oyuncular) if (p.ayrildi) oda.oyuncular.delete(id);
}

function lobiyeDon(oda) {
  zamanlayiciTemizle(oda);
  oda.hazir.clear();
  ayrilanlariTemizle(oda);
  oda.durum = 'lobi';
  oda.lv = null;
  oda.sonSonuc = null;
  yayinla(oda);
}

function hazirKontrol(oda) {
  if (oda.durum !== 'sonuc') return;
  const bagli = [...oda.oyuncular.values()].filter((p) => p.bagli);
  if (bagli.length && bagli.every((p) => oda.hazir.has(p.id))) seviyeBaslat(oda);
  else yayinla(oda);
}

function sahipAktar(oda) {
  const sahip = oda.oyuncular.get(oda.sahip);
  if (sahip && sahip.bagli) return;
  const yeni = [...oda.oyuncular.values()].find((p) => p.bagli);
  if (yeni) {
    oda.sahip = yeni.id;
    sohbetEkle(oda, { tur: 'sistem', metin: `${yeni.isim} artık oda sahibi` });
  }
}

// Kısa aralıkta en fazla `adet` işleme izin veren basit sınırlayıcı
function sinirlayici(adet, pencere) {
  let zamanlar = [];
  return () => {
    const simdi = Date.now();
    zamanlar = zamanlar.filter((t) => simdi - t < pencere);
    if (zamanlar.length >= adet) return false;
    zamanlar.push(simdi);
    return true;
  };
}

io.on('connection', (socket) => {
  let oda = null;
  let oyuncu = null;
  const tahminSiniri = sinirlayici(15, 3000);
  const sohbetSiniri = sinirlayici(6, 5000);
  const tepkiSiniri = sinirlayici(4, 2000);

  socket.on('katil', ({ kod, isim, oyuncuId } = {}, cevap) => {
    if (typeof cevap !== 'function') return;
    isim = isimTemizle(isim);
    if (kod) {
      oda = odalar.get(String(kod).toUpperCase().trim());
      if (!oda) return cevap({ hata: 'Böyle bir oda bulunamadı.' });
    } else {
      oda = yeniOda(null);
    }
    oyuncu = oyuncuId && oda.oyuncular.get(oyuncuId);
    if (oyuncu) {
      oyuncu.isim = isim;
      if (oyuncu.socketId && oyuncu.socketId !== socket.id) io.sockets.sockets.get(oyuncu.socketId)?.disconnect(true);
    } else {
      if (oda.oyuncular.size >= 30) return cevap({ hata: 'Oda dolu (en fazla 30 kişi).' });
      const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      oyuncu = { id, isim, renk: RENKLER[oda.oyuncular.size % RENKLER.length], puan: 0, seviyePuan: 0, seviyeKelime: 0, seri: 0, sonBulma: 0 };
      oda.oyuncular.set(id, oyuncu);
      sohbetEkle(oda, { tur: 'sistem', olay: 'katildi', metin: `${isim} odaya katıldı` });
    }
    oyuncu.bagli = true;
    oyuncu.ayrildi = false;
    oyuncu.socketId = socket.id;
    oda.bosSince = 0;
    if (!oda.sahip) oda.sahip = oyuncu.id;
    sahipAktar(oda);
    socket.join(oda.kod);
    cevap({ ok: true, kod: oda.kod, oyuncuId: oyuncu.id, akis: oda.akis, sohbet: oda.sohbet });
    yayinla(oda);
  });

  const sahipMi = () => oda && oyuncu && oda.sahip === oyuncu.id;

  socket.on('ayar', (a) => {
    if (!sahipMi() || oda.durum === 'oyun') return;
    const sure = Number(a?.sure);
    const can = Number(a?.can);
    if ([60, 80, 100, 120, 150, 180].includes(sure)) oda.ayar.sure = sure;
    if ([0, 1, 3, 5].includes(can)) oda.ayar.can = can;
    if (a && Object.hasOwn(ZORLUKLAR, a.zorluk)) oda.ayar.zorluk = a.zorluk;
    if (a && ['yildiz', 'tek'].includes(a.ilerleme)) oda.ayar.ilerleme = a.ilerleme;
    // Dil yalnızca oyun dışındayken değişir (seviyeler arasında değişip oyunun ortasında dil değişmesin)
    if (a && Object.hasOwn(DILLER, a.dil) && (oda.durum === 'lobi' || oda.durum === 'bitti')) oda.ayar.dil = a.dil;
    yayinla(oda);
  });

  // Oyun yalnızca lobiden ya da oyun bittikten sonra başlatılabilir (oyun ortasında sıfırlanmasın)
  socket.on('baslat', () => { if (sahipMi() && (oda.durum === 'lobi' || oda.durum === 'bitti')) oyunuBaslat(oda); });
  socket.on('lobi', () => { if (sahipMi()) lobiyeDon(oda); });
  socket.on('atla', () => { if (sahipMi() && oda.durum === 'oyun') seviyeBitir(oda, 'atla'); });
  // Seviye arası: bağlı herkes "hazırım" derse sonraki seviye beklemeden başlar
  socket.on('hazir', () => {
    if (!oda || !oyuncu || oda.durum !== 'sonuc') return;
    oda.hazir.add(oyuncu.id);
    hazirKontrol(oda);
  });

  socket.on('sohbet', (metin) => {
    if (!oda || !oyuncu || !sohbetSiniri()) return;
    const txt = String(metin || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (txt) sohbetEkle(oda, { tur: 'sohbet', id: oyuncu.id, metin: txt });
  });

  socket.on('tepki', (e) => {
    if (!oda || !oyuncu || !TEPKILER.includes(e) || !tepkiSiniri()) return;
    io.to(oda.kod).emit('tepki', { id: oyuncu.id, e });
  });

  socket.on('ipucu', (cevap) => {
    if (typeof cevap !== 'function') return;
    if (!oda || !oyuncu || oda.durum !== 'oyun' || !oda.lv) return cevap({ hata: 'Şu an ipucu alınamaz.' });
    const lv = oda.lv;
    if (lv.ipucuKalan <= 0) return cevap({ hata: 'Bu seviyenin ipucu hakları bitti.' });
    if (oyuncu.puan < IPUCU_BEDEL) return cevap({ hata: `İpucu için en az ${IPUCU_BEDEL} puanın olmalı.` });
    // Her kelimede en az 2 harf kapalı kalsın
    const adaylar = lv.tahta.filter((s) => !s.bulan && (s.ipucu || []).length < s.w.length - 2);
    if (!adaylar.length) return cevap({ hata: 'Açılabilecek harf kalmadı.' });
    const enAz = Math.min(...adaylar.map((s) => (s.ipucu || []).length));
    const secenek = adaylar.filter((s) => (s.ipucu || []).length === enAz);
    const s = secenek[Math.floor(Math.random() * secenek.length)];
    s.ipucu = s.ipucu || [];
    const kapali = [...s.w].map((_, j) => j).filter((j) => !s.ipucu.includes(j));
    const j = s.ipucu.length === 0 ? 0 : kapali[Math.floor(Math.random() * kapali.length)];
    s.ipucu.push(j);
    lv.ipucuKalan -= 1;
    oyuncu.puan -= IPUCU_BEDEL;
    oyuncu.seviyePuan -= IPUCU_BEDEL; // seviye özeti toplamla tutarlı kalsın
    akisEkle(oda, { tur: 'ipucu', id: oyuncu.id, n: s.w.length });
    cevap({ ok: true });
    yayinla(oda);
  });

  socket.on('tahmin', (metin, cevap) => {
    if (!oda || !oyuncu || typeof cevap !== 'function') return;
    metin = String(metin || '').slice(0, 120);
    if (!tahminSiniri()) return cevap({ tur: 'yavas' });
    const simdi = Date.now();

    // Boşluk içeren ya da / ile başlayan mesajlar sohbet sayılır
    if (/\s/.test(metin.trim()) || metin.startsWith('/') || oda.durum !== 'oyun') {
      const txt = metin.replace(/^\//, '').trim().slice(0, 100);
      if (txt) sohbetEkle(oda, { tur: 'sohbet', id: oyuncu.id, metin: txt });
      return cevap({ tur: 'sohbet' });
    }

    const lv = oda.lv;
    const s = tahminKontrol(lv, metin);
    // Son hamle: sürenin son 10 saniyesinde bulunan kelimeler ×1.5
    const sonHamle = oda.bitis - simdi <= SON_HAMLE_MS;
    const hamleCarpan = sonHamle ? SON_HAMLE_CARPAN : 1;
    // Takım puanını ekle; hedef bu kelimeyle geçildiyse "kurtarıcı" kaydedilir
    const takimaEkle = (puan) => {
      const once = lv.takimPuan;
      lv.takimPuan += puan;
      if (once < lv.puanHedef && lv.takimPuan >= lv.puanHedef) {
        lv.kurtarici = oyuncu.id;
        akisEkle(oda, { tur: 'sistem', olay: 'hedef', id: oyuncu.id, metin: `Puan hedefine ulaşıldı (${lv.puanHedef})! Seviye garanti.` });
      }
    };
    if (s.tur === 'yeni') {
      // Seri: kısa sürede art arda bulunan kelimeler ek puan getirir
      const seri = simdi - (oyuncu.sonBulma || 0) <= SERI_SURESI ? (oyuncu.seri || 0) + 1 : 1;
      oyuncu.seri = seri;
      oyuncu.sonBulma = simdi;
      oyuncu.seviyeSeri = Math.max(oyuncu.seviyeSeri || 0, seri);
      oyuncu.enSeri = Math.max(oyuncu.enSeri || 0, seri);
      const kayit = lv.tahta[s.i];
      const z = zincirIsle(lv, s.w);
      const taban = Math.round(kayit.puan * hamleCarpan * (z.zincirli ? ZINCIR_CARPAN : 1));
      const seriBonus = Math.round(taban * Math.min(seri - 1, SERI_UST) * SERI_BONUS);
      const puan = taban + seriBonus;
      kayit.bulan = oyuncu.id;
      kayit.zaman = simdi;
      kayit.kazanilan = puan;
      oyuncu.puan += puan;
      oyuncu.seviyePuan += puan;
      oyuncu.seviyeKelime = (oyuncu.seviyeKelime || 0) + 1;
      oyuncu.oyunKelime = (oyuncu.oyunKelime || 0) + 1;
      if (!oyuncu.enIyi || puan > oyuncu.enIyi.puan) oyuncu.enIyi = { w: s.w, puan };
      const buyuk = s.w.length === lv.buyukUzunluk;
      const hazine = !!kayit.hazine;
      // Kum saati turunda her kelime süre ekler
      const kumEk = lv.kumsaati ? kumSaatiEkle(oda, kumSaatiEk(s.w, buyuk)) : 0;
      akisEkle(oda, { tur: 'bulundu', id: oyuncu.id, w: s.w, puan, buyuk, seri, hazine, sonHamle, sureEk: kumEk, zincir: z.zincirli ? z.n : 0 });
      const bombaOdul = bombaKontrol(oda, oyuncu, s.w, takimaEkle);
      buzVur(oda);
      const gorev = gorevIlerlet(oda, oyuncu, { tur: 'yeni', w: s.w, seri, buyuk }, takimaEkle);
      cevap({ tur: 'yeni', w: s.w, puan, taban, buyuk, seri, seriBonus, hazine, sonHamle, sureEk: (hazine ? HAZINE_SURE : 0) + kumEk, kumEk, bombaOdul, zincir: z.zincirli ? z.n : 0, gorev: gorev.map((g) => g.odul) });
      takimaEkle(puan);
      if (lv.tahta.every((x) => x.bulan)) {
        akisEkle(oda, { tur: 'sistem', olay: 'hepsi', metin: 'Bütün kelimeler bulundu! Mükemmel!' });
        yayinla(oda);
        return seviyeBitir(oda, 'hepsi');
      }
      // Hazine kelime takıma ek süre kazandırır
      if (hazine) {
        sureUzat(oda, HAZINE_SURE);
        akisEkle(oda, { tur: 'sistem', olay: 'hazine', id: oyuncu.id, metin: `Hazine kelime bulundu: +${HAZINE_SURE / 1000} saniye!` });
      }
      return yayinla(oda);
    }
    if (s.tur === 'bonus') {
      const z = zincirIsle(lv, s.w);
      const puan = Math.max(1, Math.round(kelimePuani(lv, s.w) * BONUS_ORAN * hamleCarpan * (z.zincirli ? ZINCIR_CARPAN : 1)));
      lv.bonus.push({ w: s.w, bulan: oyuncu.id, puan });
      oyuncu.puan += puan;
      oyuncu.seviyePuan += puan;
      const kumEk = lv.kumsaati ? kumSaatiEkle(oda, KUM_BONUS_EK) : 0;
      akisEkle(oda, { tur: 'bonus', id: oyuncu.id, w: s.w, puan, sonHamle, sureEk: kumEk, zincir: z.zincirli ? z.n : 0 });
      const bombaOdul = bombaKontrol(oda, oyuncu, s.w, takimaEkle);
      buzVur(oda);
      const gorev = gorevIlerlet(oda, oyuncu, { tur: 'bonus', w: s.w }, takimaEkle);
      cevap({ tur: 'bonus', w: s.w, puan, sonHamle, kumEk, bombaOdul, zincir: z.zincirli ? z.n : 0, gorev: gorev.map((g) => g.odul) });
      takimaEkle(puan);
      return yayinla(oda);
    }
    if (s.tur === 'zaten') return cevap({ tur: 'zaten', w: s.w, bulan: lv.tahta[s.i].bulan });
    cevap(s);
  });

  // Oyuncu odadan kendi isteğiyle ayrılır (sayfayı yenilemeden giriş ekranına döner)
  socket.on('ayril', (cevap) => {
    const ack = typeof cevap === 'function' ? cevap : () => {};
    if (!oda || !oyuncu) return ack({ ok: true });
    const o = oda;
    const p = oyuncu;
    oda = null;
    oyuncu = null;
    socket.leave(o.kod);
    if (p.socketId !== socket.id) return ack({ ok: true }); // başka bir sekme devralmış
    if (o.durum === 'lobi') o.oyuncular.delete(p.id);
    else { p.bagli = false; p.ayrildi = true; p.socketId = null; }
    ack({ ok: true });
    if (![...o.oyuncular.values()].some((x) => !x.ayrildi)) {
      // Odada kimse kalmadı: odayı hemen kapat
      zamanlayiciTemizle(o);
      odalar.delete(o.kod);
      return;
    }
    sohbetEkle(o, { tur: 'sistem', olay: 'ayrildi', metin: `${p.isim} odadan ayrıldı` });
    sahipAktar(o);
    if (![...o.oyuncular.values()].some((x) => x.bagli)) o.bosSince = Date.now();
    o.hazir.delete(p.id);
    if (o.durum === 'sonuc' && o.hazir.size) return hazirKontrol(o);
    yayinla(o);
  });

  socket.on('disconnect', () => {
    if (!oda || !oyuncu || oyuncu.socketId !== socket.id) return;
    oyuncu.bagli = false;
    sahipAktar(oda);
    if (![...oda.oyuncular.values()].some((p) => p.bagli)) oda.bosSince = Date.now();
    if (oda.durum === 'sonuc' && oda.hazir.size) return hazirKontrol(oda);
    yayinla(oda);
  });
});

// Boş kalan odaları 15 dakika sonra sil
setInterval(() => {
  for (const [kod, oda] of odalar) {
    if (oda.bosSince && Date.now() - oda.bosSince > 15 * 60 * 1000) {
      zamanlayiciTemizle(oda);
      odalar.delete(kod);
    }
  }
}, 60 * 1000);

server.listen(PORT, () => console.log(`Kelime Avı çalışıyor: http://localhost:${PORT}`));

module.exports = { io, odalar }; // testler için
