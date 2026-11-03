// Kelime Avı — istemci
const $ = (id) => document.getElementById(id);
const socket = io({ autoConnect: true });

const trBuyuk = (s) => String(s).toLocaleUpperCase('tr-TR');
const trKucuk = (s) => String(s).replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr-TR');
const kaydet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const oku = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const dokunmatik = matchMedia('(pointer: coarse)').matches;
const azHareket = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TEPKILER = ['👏', '🔥', '😂', '😮', '😭', '❤️', '👍', '🎉'];

let D = null;               // son sunucu durumu
let saatFarki = 0;          // sunucu - istemci
let benimId = oku('ka_oyuncu');
let odaKodu = null;
let akisListesi = [];
let sohbetListesi = [];
let oyuncuImza = '';        // oyuncu adları/renkleri değişince akış ve sohbet yeniden çizilir

let lvKimlik = null;        // ekrandaki seviyenin kimliği
let oncekiBulunan = new Set();
let oncekiTakimPuan = 0;
let oncekiCan = null;
let oncekiPuanlar = {};
let sonPuanlarim = {};      // kendi bulduğum kelime → kazandığım puan
let taslar = [];            // harf taşı düğmeleri (harf indeksine göre)
let harfSirasi = [];        // taşların ekrandaki sırası
let oncekiKullanilan = new Set();
let oncekiUzunluk = 0;
let karistirSayac = 0;
let gorulenIpucu = new Set(); // animasyonu bir kez oynatmak için açılmış ipucu harfleri
let bonusSayisi = 0;
let lobiBilinen = new Set();
let tahminGecmisi = [];     // ↑/↓ ile geri getirilen son tahminler
let gecmisKonum = -1;
let sonHamleDuyuru = null;  // son hamle afişi hangi seviyede gösterildi
let rekorDuyuruldu = false;
let oyunBasiRekor = 0;      // oyun başındaki rekor (yalnızca bunu aşınca duyurulur)
const KARISTIR_PERIYOT = 10; // harfler kaç saniyede bir kendiliğinden karışır

// ---------- Arka plan süsü ----------
(function arkaHarfler() {
  const kap = document.querySelector('.arka-harfler');
  if (!kap || azHareket) return;
  const abc = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ';
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('span');
    s.textContent = abc[Math.floor(Math.random() * abc.length)];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.fontSize = 30 + Math.random() * 70 + 'px';
    s.style.animationDuration = 18 + Math.random() * 24 + 's';
    s.style.animationDelay = -Math.random() * 40 + 's';
    s.style.setProperty('--don', Math.random() * 80 - 40 + 'deg');
    kap.appendChild(s);
  }
})();
document.querySelectorAll('.logo span').forEach((s, i) => {
  s.addEventListener('click', () => {
    Ses.cal('harf', i * 2);
    s.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px) rotate(8deg)' }, { transform: 'translateY(0)' }], { duration: 380, easing: 'ease-out' });
  });
});

// ---------- Giriş ----------
$('isim').value = oku('ka_isim') || '';
const urlKod = new URLSearchParams(location.search).get('oda');
if (urlKod) $('kodGir').value = urlKod.toUpperCase();

function gecmisiYukle(c) {
  akisListesi = c.akis || [];
  sohbetListesi = c.sohbet || [];
  akisCiz();
  sohbetCiz(true);
}

function katil(kod) {
  const isim = $('isim').value.trim();
  if (!isim) { $('girisHata').textContent = 'Önce bir isim yaz.'; $('isim').focus(); return; }
  kaydet('ka_isim', isim);
  const oncekiOda = oku('ka_oda');
  const oyuncuId = kod && oncekiOda === kod ? benimId : null;
  socket.emit('katil', { kod, isim, oyuncuId }, (c) => {
    if (c.hata) { $('girisHata').textContent = c.hata; Ses.cal('yanlis'); return; }
    odaKodu = c.kod; benimId = c.oyuncuId;
    kaydet('ka_oda', c.kod); kaydet('ka_oyuncu', c.oyuncuId);
    history.replaceState(null, '', '?oda=' + c.kod);
    gecmisiYukle(c);
  });
}
$('odaKur').onclick = () => katil(null);
$('katil').onclick = () => {
  const kod = $('kodGir').value.trim().toUpperCase();
  if (kod.length !== 4) { $('girisHata').textContent = 'Oda kodu 4 harfli.'; return; }
  katil(kod);
};
// Sayfa yenilendiyse aynı odaya otomatik dön
if (urlKod && oku('ka_oda') === urlKod.toUpperCase() && oku('ka_isim')) {
  if (socket.connected) katil(urlKod.toUpperCase()); else socket.once('connect', () => { if (!odaKodu) katil(urlKod.toUpperCase()); });
}
$('kodGir').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('katil').click(); });
$('isim').addEventListener('keydown', (e) => { if (e.key === 'Enter') (urlKod ? $('katil') : $('odaKur')).click(); });

// Bağlantı koparsa otomatik yeniden katıl
socket.on('connect', () => {
  $('baglanti').classList.add('gizli');
  if (odaKodu) {
    socket.emit('katil', { kod: odaKodu, isim: $('isim').value || oku('ka_isim'), oyuncuId: benimId }, (c) => {
      if (c.hata) { odaKodu = null; ekranGoster('giris'); $('girisHata').textContent = 'Oda kapanmış: ' + c.hata; }
      else gecmisiYukle(c);
    });
  }
});
socket.on('disconnect', () => { if (odaKodu) $('baglanti').classList.remove('gizli'); });

// ---------- Yardımcılar ----------
function ekranGoster(ad) {
  for (const e of document.querySelectorAll('.ekran')) e.classList.toggle('aktif', e.id === ad);
  document.body.classList.toggle('oyunda', ad === 'oyun');
  // Sohbet paneli tek; hangi ekrandaysak oraya taşınır
  const yer = ad === 'lobi' ? $('lobiSohbetYeri') : ad === 'oyun' ? $('oyunSohbetYeri') : $('sohbetDepo');
  if ($('sohbetPanel').parentElement !== yer) { yer.appendChild($('sohbetPanel')); sohbetAsagi(); }
}
const oyuncu = (id) => D?.oyuncular.find((p) => p.id === id);
const ad = (id) => oyuncu(id)?.isim || '?';
const renk = (id) => oyuncu(id)?.renk || '#888';
const sahibim = () => D && D.sahip === benimId;
const simdi = () => Date.now() + saatFarki;
const odakla = (el) => { if (!dokunmatik) el.focus(); };
const merkez = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
const gorunur = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
const yenidenOynat = (el, sinif) => { el.classList.remove(sinif); void el.offsetWidth; el.classList.add(sinif); };

function davetLinki() { return location.origin + location.pathname + '?oda=' + odaKodu; }
function bildir(metin) {
  const el = document.createElement('div');
  el.className = 'kopyalandi'; el.textContent = metin;
  document.body.appendChild(el); setTimeout(() => el.remove(), 1600);
}
async function linkKopyala() {
  try { await navigator.clipboard.writeText(davetLinki()); bildir('Link kopyalandı!'); Ses.cal('tikla'); }
  catch { prompt('Davet linki:', davetLinki()); }
}
$('linkKopyala').onclick = linkKopyala;
$('menuLink').onclick = linkKopyala;

// Ekranın ortasında beliren büyük duyuru. Afişler üst üste binmesin diye sırayla gösterilir;
// `ses` verilirse afiş göründüğü anda çalınır.
const afisKuyruk = [];
let afisMesgul = false;
function afis(baslik, alt = '', tur = '', ses = null) {
  afisKuyruk.push({ baslik, alt, tur, ses });
  if (afisKuyruk.length > 3) afisKuyruk.splice(0, afisKuyruk.length - 3); // çok birikirse eskiler atlanır
  if (!afisMesgul) afisSonraki();
}
function afisSonraki() {
  const a = afisKuyruk.shift();
  if (!a) { afisMesgul = false; return; }
  afisMesgul = true;
  const sure = afisKuyruk.length ? 1500 : 2300; // sırada bekleyen varsa kısa göster
  const el = document.createElement('div');
  el.className = 'afis ' + a.tur;
  el.style.setProperty('--sure', sure + 'ms');
  const b = document.createElement('b'); b.textContent = a.baslik;
  el.appendChild(b);
  if (a.alt) { const s = document.createElement('span'); s.textContent = a.alt; el.appendChild(s); }
  $('afisler').appendChild(el);
  if (a.ses) Ses.cal(...[].concat(a.ses));
  setTimeout(() => el.remove(), sure);
  setTimeout(afisSonraki, sure * 0.85);
}

// Seviyenin yıldız eşikleri (takım puanı) — sunucu hesaplayıp gönderir
const esikler = (lv) => lv.esikler || [lv.puanHedef, lv.puanMax, lv.puanMax];
const uzunlukCarpani = (n) => 1 + (n - 3) * 0.25; // sunucudaki game.js ile aynı
const PUAN_OLCEK = 10;                              // game.js ile aynı
const sonHamleMi = () => D?.durum === 'oyun' && D.lv && D.bitis - simdi() > 0 && D.bitis - simdi() <= (D.lv.sonHamleMs || 10000);

// ---------- Rekorlar (bu tarayıcıda, zorluğa göre) ----------
function rekorlar() { try { return JSON.parse(oku('ka_rekor') || '{}') || {}; } catch { return {}; } }
function rekorGuncelle(zorluk, seviye, puan) {
  const hepsi = rekorlar();
  const e = hepsi[zorluk] || { seviye: 0, puan: 0 };
  if (seviye > e.seviye) e.seviye = seviye;
  if (puan > e.puan) e.puan = puan;
  hepsi[zorluk] = e;
  kaydet('ka_rekor', JSON.stringify(hepsi));
}

// ---------- Sunucudan durum ----------
socket.on('durum', (d) => {
  saatFarki = d.simdi - Date.now();
  const onceki = D;
  D = d;
  // Oyuncu adları/renkleri değiştiyse geçmiş listeleri yeniden çiz (animasyonsuz)
  const imza = d.oyuncular.map((p) => `${p.id}:${p.isim}:${p.renk}`).join('|');
  if (imza !== oyuncuImza) { oyuncuImza = imza; akisCiz(); sohbetCiz(); }
  if (d.durum === 'lobi') {
    lobiCiz(); ekranGoster('lobi');
    oncekiCan = null;
    return;
  }
  ekranGoster('oyun');
  gecisleriIsle(onceki, d);
  oyunCiz(onceki?.durum !== d.durum);
});

function gecisleriIsle(o, d) {
  const lv = d.lv;
  if (!lv) return;
  // Yeni oyun başladı (ya da oyuna sonradan girildi): rekor karşılaştırması bu andaki rekora göre
  if (d.durum === 'oyun' && (!o || o.durum === 'lobi' || o.durum === 'bitti')) {
    rekorDuyuruldu = false;
    oyunBasiRekor = rekorlar()[lv.zorluk]?.seviye || 0;
  }
  // Yeni seviye başladı
  if (d.durum === 'oyun' && o && (o.durum !== 'oyun' || o.lv?.kimlik !== lv.kimlik)) {
    const notlar = [`hedef ${lv.puanHedef} puan · ${lv.tahta.length} kelime · ${Math.round(lv.sure / 1000)} sn`];
    const ozel = lv.harfler.filter((h) => h.x > 1).map((h) => `×${h.x}`);
    if (ozel.length) notlar.push(`${ozel.join(' ve ')} taş var`);
    if (lv.tahta.some((s) => s.hz)) notlar.push('🗝️ hazine kelime');
    if (lv.gizliVar) notlar.push('gizli harf var');
    if (lv.sahteVar) notlar.push('dikkat: bir harf sahte!');
    afis(`Seviye ${d.seviye}`, notlar.join(' · '), 'seviye', 'basla');
    if (lv.turAd) afis(`${lv.turIkon} ${lv.turAd}`, lv.turAciklama, 'tur-' + lv.tur, lv.tur === 'patron' ? 'patronVurus' : 'bonus');
  }
  // Seviye bitti
  if (o?.durum === 'oyun' && (d.durum === 'sonuc' || d.durum === 'bitti')) {
    const r = d.sonSonuc;
    if (d.durum === 'bitti') { Ses.cal('oyunBitti'); Efekt.konfetiYagmuru(true); }
    else if (r?.gecti) { Ses.cal('gecti'); Efekt.konfetiYagmuru(r.yildiz === 3); }
    else Ses.cal('kaldi');
    // Kişisel rekor: geçilen en yüksek seviye. Oyun başındaki rekor aşılınca bir kez duyurulur
    // (ilk oyunda karşılaştırılacak rekor olmadığından duyuru yapılmaz).
    const ben = oyuncu(benimId);
    if (r && ben) {
      rekorGuncelle(r.zorluk, r.gecti ? r.seviye : 0, ben.puan);
      if (r.gecti && oyunBasiRekor > 0 && r.seviye > oyunBasiRekor && !rekorDuyuruldu) {
        rekorDuyuruldu = true;
        afis('🏆 YENİ REKOR!', `${ZORLUK_AD[r.zorluk] || ''} · Seviye ${r.seviye} (önceki: ${oyunBasiRekor})`, 'altin', 'rekor');
      }
    }
  }
}

socket.on('akis', (k) => {
  akisListesi.push(k);
  if (akisListesi.length > 60) akisListesi.shift();
  akisEkleDom(k);
  if (k.tur === 'bulundu') {
    if (k.id !== benimId) Ses.cal(k.buyuk ? 'buyuk' : 'baskasi');
    if (k.buyuk) {
      afis('BÜYÜK KELİME!', `${ad(k.id)} buldu: ${trBuyuk(k.w)}`, 'altin');
      Efekt.flas();
      Efekt.konfeti(innerWidth / 2, innerHeight * 0.55, 120, -Math.PI / 2, 1.1);
    }
  } else if (k.tur === 'ipucu') {
    Ses.cal('ipucu');
  } else if (k.olay === 'gizli') {
    afis('Gizli harf açıldı!', '', 'mor', 'gizli');
  } else if (k.olay === 'sahte') {
    afis('Sahte harf ortaya çıktı!', 'Üstü çizili harfi kullanma', 'kirmizi', 'sahte');
  } else if (k.olay === 'hepsi') {
    afis('MÜKEMMEL!', 'Bütün kelimeler bulundu', 'altin');
  } else if (k.olay === 'hazine') {
    Ses.cal('hazine');
    setTimeout(() => Ses.cal('zamanEk'), 350);
    afis('🗝️ HAZİNE!', `${ad(k.id)} buldu · takıma +${Math.round((D?.lv?.hazineSure || 8000) / 1000)} saniye`, 'altin');
    Efekt.flas('rgba(255,200,61,.25)');
  }
});

socket.on('sohbet', (k) => {
  sohbetListesi.push(k);
  if (sohbetListesi.length > 80) sohbetListesi.shift();
  sohbetEkleDom(k, k.id === benimId);
  if (k.tur === 'sohbet' && k.id !== benimId) Ses.cal('sohbet');
  if (k.olay === 'katildi') Ses.cal('katildi');
});

socket.on('tepki', ({ id, e }) => {
  Efekt.emoji(e, ad(id), renk(id));
  Ses.cal('tepki');
});

// ---------- Lobi ----------
function lobiCiz() {
  $('lobiKod').textContent = D.kod;
  $('lobiOyuncular').innerHTML = '';
  for (const p of D.oyuncular) {
    const li = document.createElement('li');
    if (!p.bagli) li.className = 'cevrimdisi';
    if (!lobiBilinen.has(p.id)) { li.classList.add('yeni'); lobiBilinen.add(p.id); }
    li.innerHTML = `<span class="avatar" style="background:${p.renk}"></span><span class="ad"></span>`;
    li.querySelector('.avatar').textContent = trBuyuk(p.isim[0] || '?');
    li.querySelector('.ad').textContent = p.isim + (p.id === benimId ? ' (sen)' : '');
    if (p.id === D.sahip) li.insertAdjacentHTML('beforeend', '<span class="rozet">👑 oda sahibi</span>');
    $('lobiOyuncular').appendChild(li);
  }
  $('oyuncuSayi').textContent = D.oyuncular.filter((p) => p.bagli).length;
  $('ayarSure').value = D.ayar.sure;
  $('ayarCan').value = D.ayar.can;
  $('ayarSure').disabled = $('ayarCan').disabled = !sahibim();
  const z = D.ayar.zorluk || 'normal';
  for (const b of $('zorlukSecim').children) {
    b.classList.toggle('secili', b.dataset.zorluk === z);
    b.disabled = !sahibim();
    b.setAttribute('aria-checked', b.dataset.zorluk === z);
  }
  $('zorlukSecim').dataset.secili = z;
  $('zorlukAciklama').textContent = ZORLUK_ACIKLAMA[z];
  const rk = rekorlar()[z];
  $('rekorSatir').classList.toggle('gizli', !rk || !(rk.seviye || rk.puan));
  if (rk) $('rekorSatir').textContent = `🏆 Rekorun (${ZORLUK_AD[z]}): Seviye ${rk.seviye || 0} · ${rk.puan || 0} puan`;
  $('baslat').classList.toggle('gizli', !sahibim());
  $('bekle').classList.toggle('gizli', sahibim());
}
$('ayarSure').onchange = $('ayarCan').onchange = () =>
  socket.emit('ayar', { sure: Number($('ayarSure').value), can: Number($('ayarCan').value) });
$('baslat').onclick = () => socket.emit('baslat');

const ZORLUK_ACIKLAMA = {
  kolay: 'Süre ×1.25 · hedef %25 düşük · gizli ve sahte harfler geç gelir · puan ×0.8',
  normal: 'Dengeli oyun · harf sayısı ve tuzaklar seviyeyle yavaşça artar · puan ×1',
  zor: 'Süre ×0.85 · hedef %15 yüksek · 7 harfle başlar, tuzaklar erken · puan ×1.25',
  uzman: 'Süre ×0.75 · hedef %30 yüksek · hızla 8+ harfe çıkar, tuzaklar hemen · puan ×1.5',
};
const ZORLUK_AD = { kolay: '🌱 Kolay', normal: '⚔️ Normal', zor: '🔥 Zor', uzman: '💀 Uzman' };
for (const b of $('zorlukSecim').children) {
  b.onclick = () => { if (sahibim()) { socket.emit('ayar', { zorluk: b.dataset.zorluk }); Ses.cal('tikla'); } };
}

// ---------- Oyun ----------
function oyunCiz(durumDegisti) {
  const lv = D.lv;
  if (!lv) return;
  const yeniLv = lv.kimlik !== lvKimlik;
  if (yeniLv) {
    lvKimlik = lv.kimlik;
    oncekiBulunan = new Set(lv.tahta.flatMap((s, i) => (s.bulan ? [i] : [])));
    oncekiTakimPuan = lv.takimPuan || 0;
    puanSayaci(lv.takimPuan || 0, true);
    sonPuanlarim = {};
    karistirSayac = 0;
    gorulenIpucu = new Set();
    bonusSayisi = lv.bonus.length;
    tahminGecmisi = []; gecmisKonum = -1;
    girdiAyarla('', false);
    taslariKur(lv);
  }
  ustBarCiz(lv, yeniLv);
  tahtaCiz(lv);
  taslariGuncelle(lv);
  bonusCiz(lv);
  skorCiz();
  ipucuCiz(lv);
  sonucCiz(durumDegisti);
  $('menuKod').textContent = D.kod;
  for (const b of document.querySelectorAll('.sahip-ozel')) b.classList.toggle('gizli', !sahibim());
  $('menuAtla').classList.toggle('gizli', !sahibim() || D.durum !== 'oyun');
  const oynaniyor = D.durum === 'oyun';
  $('sahne').classList.toggle('bekliyor', !oynaniyor);
  $('tahmin').placeholder = oynaniyor ? "Kelimeyi yaz, Enter'a bas…" : 'Sonraki seviye bekleniyor…';
}

// Takım puanı sayacı: uçan puanlar vardıktan sonra yeni değere doğru sayar
let gosterilenPuan = 0, hedefSayi = 0, sayacRaf = 0, sayacBekle = 0;
function puanSayaci(hedef, anlik = false) {
  hedefSayi = hedef;
  if (anlik || azHareket) {
    cancelAnimationFrame(sayacRaf); clearTimeout(sayacBekle); sayacRaf = sayacBekle = 0;
    gosterilenPuan = hedef; $('takimPuan').textContent = hedef;
    return;
  }
  if (sayacBekle || sayacRaf) return; // zaten bekliyor ya da sayıyor; yeni hedefe gidecek
  sayacBekle = setTimeout(() => {
    sayacBekle = 0;
    yenidenOynat($('takimPuan'), 'zipla');
    const adim = () => {
      const fark = hedefSayi - gosterilenPuan;
      if (Math.abs(fark) < 1) { gosterilenPuan = hedefSayi; $('takimPuan').textContent = hedefSayi; sayacRaf = 0; return; }
      gosterilenPuan += Math.sign(fark) * Math.max(1, Math.abs(fark) * 0.14);
      $('takimPuan').textContent = Math.round(gosterilenPuan);
      sayacRaf = requestAnimationFrame(adim);
    };
    sayacRaf = requestAnimationFrame(adim);
  }, 520);
}

function ustBarCiz(lv, yeniLv) {
  $('seviyeNo').textContent = D.durum === 'oyun' ? D.seviye : (D.sonSonuc?.seviye ?? D.seviye);
  // Seviye türü ve zorluk rozeti
  const rz = $('turRozet');
  rz.classList.remove('gizli');
  rz.dataset.tur = lv.tur || 'normal';
  rz.innerHTML = '';
  const zr = document.createElement('span'); zr.className = 'zr'; zr.textContent = ZORLUK_AD[lv.zorluk] || '';
  rz.appendChild(zr);
  if (lv.turAd) {
    const tr = document.createElement('span'); tr.className = 'tr'; tr.textContent = `${lv.turIkon} ${lv.turAd}`;
    tr.title = lv.turAciklama;
    rz.appendChild(tr);
  }
  $('tahta').dataset.tur = lv.tur || 'normal';
  $('sahne').dataset.tur = lv.tur || 'normal';
  const t = lv.tahta.length;
  const bulunan = lv.tahta.filter((s) => s.bulan).length;
  const puan = lv.takimPuan || 0;
  const es = esikler(lv);
  const ust = es[2] || 1;
  if (!yeniLv && puan !== hedefSayi) puanSayaci(puan, D.durum !== 'oyun');
  $('hedefPuan').textContent = lv.puanHedef;
  $('toplamSayi').textContent = `· ${bulunan}/${t} kelime · en az ${lv.minHarf} harf`;
  $('ilerlemeDolgu').style.width = Math.min(100, (100 * puan / ust)) + '%';
  $('ilerlemeDolgu').classList.toggle('gecti', puan >= es[0]);
  const yl = $('yildizlar');
  yl.innerHTML = '';
  es.forEach((e, k) => {
    const s = document.createElement('span');
    s.className = 'yildiz-isaret' + (puan >= e || (k === 2 && bulunan === t) ? ' dolu' : '') + (k === 2 ? ' son' : '');
    s.style.left = Math.min(100, 100 * e / ust) + '%';
    s.title = `${'★'.repeat(k + 1)}: ${e} puan`;
    s.textContent = '★';
    const etiket = document.createElement('small'); etiket.textContent = e;
    s.appendChild(etiket);
    yl.appendChild(s);
  });

  // Patron seviyesi: puan hedefi patronun canıdır, her kelime ona vurur
  const patron = lv.tur === 'patron';
  const hp = Math.max(0, lv.puanHedef - puan);
  $('patronCan').classList.toggle('gizli', !patron);
  $('patronCan').classList.toggle('yenildi', patron && hp === 0);
  $('takimPuanKutu').classList.toggle('gizli', patron && hp > 0);
  if (patron) {
    $('patronDolgu').style.width = (100 * hp / Math.max(1, lv.puanHedef)) + '%';
    $('patronHP').textContent = hp > 0 ? `${hp} HP` : 'YENİLDİ';
  }

  // Eşik geçişleri
  if (!yeniLv && D.durum === 'oyun' && puan > oncekiTakimPuan) {
    if (patron && oncekiTakimPuan < es[0]) {
      const hasar = Math.min(puan - oncekiTakimPuan, lv.puanHedef - oncekiTakimPuan);
      Ses.cal('patronVurus');
      yenidenOynat($('patronCan'), 'vurus');
      if (gorunur($('patronCan'))) {
        const m = merkez($('patronDolgu').parentElement);
        Efekt.ucanYazi(m.x + m.r.width / 2, m.r.bottom + 26, `−${hasar}`, '#ff8fa0', 'hasar');
      }
    }
    if (oncekiTakimPuan < es[0] && puan >= es[0]) {
      if (patron) {
        afis('👑 PATRON YENİLDİ!', 'Seviye garanti · şimdi yıldız toplayın', 'tur-patron', 'patronYenildi');
        Efekt.flas('rgba(255,93,115,.3)');
        Efekt.konfetiYagmuru(false);
      } else {
        afis('Puan hedefi aşıldı! ★', 'Seviye garanti, şimdi yıldız topla', 'yesil', ['yildiz', 0]);
      }
    } else if (oncekiTakimPuan < es[1] && puan >= es[1] && puan < es[2]) {
      afis('★★ İki yıldız!', `Üç yıldız için ${es[2] - puan} puan kaldı`, 'altin', ['yildiz', 1]);
    }
  }
  oncekiTakimPuan = puan;

  if (D.ayar.can > 0) {
    const kayip = oncekiCan !== null && D.can < oncekiCan;
    const kazanc = oncekiCan !== null && D.can > oncekiCan;
    $('canlar').innerHTML = Array.from({ length: D.ayar.can }, (_, i) =>
      `<span class="${i < D.can ? '' : 'bos'}${kayip && i === D.can ? ' kayip' : ''}${kazanc && i === D.can - 1 ? ' kazanc' : ''}">♥</span>`).join('');
  } else $('canlar').innerHTML = '<span title="Sınırsız can">∞</span>';
  oncekiCan = D.can;
}

function tahtaCiz(lv) {
  const tahta = $('tahta');
  const dar = innerWidth < 860;
  const gruplar = {};
  lv.tahta.forEach((s, i) => (gruplar[s.n] ||= []).push([s, i]));
  const uzunluklar = Object.keys(gruplar).map(Number).sort((a, b) => a - b);
  // Ölçüler style.css ile aynı olmalı (.tahta, .grup, .sutun, .slot)
  const HARF_ARA = 3, SATIR_ARA = 7, SUTUN_ICI = 16;          // slot içi, satır, grup içi sütun aralığı
  const GRUP_YATAY = 24, GRUP_DIKEY = 58, GRUP_MIN = 108;     // grup kartının iç boşlukları + başlık + kenarlık
  const ARA_X = 18, ARA_Y = 16;                               // gruplar arası
  const cs = getComputedStyle(tahta);
  const W = (tahta.clientWidth || 800) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
  const H = (tahta.clientHeight || 400) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 4;

  // Belirli kutu boyutu ve sütun başına satır sayısıyla her grubun kart ölçüsü
  const grupOlcu = (uz, k, kap) => {
    const adet = gruplar[uz].length;
    const sutun = Math.ceil(adet / kap);
    const satir = Math.ceil(adet / sutun);
    const w = Math.max(GRUP_MIN, sutun * (uz * k + (uz - 1) * HARF_ARA) + (sutun - 1) * SUTUN_ICI + GRUP_YATAY);
    const h = satir * (k + SATIR_ARA) - SATIR_ARA + GRUP_DIKEY;
    return [w, h];
  };
  // Kartlar flex-wrap ile alt satıra geçer: hepsi alana sığıyor mu?
  const sigar = (k, kap) => {
    let toplamH = 0, satirW = 0, satirH = 0;
    for (const uz of uzunluklar) {
      const [w, h] = grupOlcu(uz, k, kap);
      if (w > W) return false;
      if (satirW && satirW + ARA_X + w > W) { toplamH += satirH + ARA_Y; satirW = 0; satirH = 0; }
      satirW += (satirW ? ARA_X : 0) + w;
      satirH = Math.max(satirH, h);
    }
    return toplamH + satirH <= H;
  };

  let kutu = 22, satirKapasite = 5;
  if (dar) {
    const enUzun = Math.max(...uzunluklar);
    kutu = Math.max(20, Math.min(38, Math.floor((W - GRUP_YATAY - HARF_ARA * (enUzun - 1)) / enUzun)));
    satirKapasite = 5;
  } else {
    bul: for (let k = 62; k >= 20; k--) {
      const enCok = Math.max(1, Math.floor((H - GRUP_DIKEY + SATIR_ARA) / (k + SATIR_ARA)));
      for (let kap = enCok; kap >= 1; kap--) {
        if (sigar(k, kap)) { kutu = k; satirKapasite = kap; break bul; }
      }
      satirKapasite = Math.max(2, enCok);
    }
  }
  tahta.style.setProperty('--kutu', kutu + 'px');
  // Tahta her güncellemede yeniden kurulur; sürekli animasyonlar (hazine parıltısı) baştan başlamasın diye faz verilir
  tahta.style.setProperty('--faz', Math.round(performance.now() % 2400) + 'ms');
  tahta.innerHTML = '';
  const yeniBulunan = new Set();
  const efektler = [];

  // Her uzunluk için başlıklı bir kart; içinde kelimeler sütunlara bölünür
  for (const uz of uzunluklar) {
    const liste = gruplar[uz];
    const bulunanSay = liste.filter(([s]) => s.bulan).length;
    const grup = document.createElement('div');
    grup.className = 'grup';
    if (uz === lv.buyukUzunluk) grup.classList.add('buyuk');
    if (bulunanSay === liste.length) grup.classList.add('tamam');
    grup.style.setProperty('--oran', bulunanSay / liste.length);

    const baslik = document.createElement('div');
    baslik.className = 'grup-baslik';
    const adEl = document.createElement('span');
    adEl.className = 'ad';
    adEl.textContent = uz === lv.buyukUzunluk ? `★ ${uz} HARF` : `${uz} HARF`;
    const say = document.createElement('span');
    say.className = 'say';
    say.textContent = bulunanSay === liste.length ? `✓ ${liste.length}` : `${bulunanSay}/${liste.length}`;
    baslik.append(adEl, say);
    const cizgi = document.createElement('div');
    cizgi.className = 'grup-cizgi';

    const govde = document.createElement('div');
    govde.className = 'grup-govde';
    let sutunSay = Math.ceil(liste.length / satirKapasite);
    if (dar) {
      // Mobilde kart ekran genişliğini aşmasın
      const sutunW = uz * kutu + (uz - 1) * HARF_ARA;
      sutunSay = Math.max(1, Math.min(sutunSay, Math.floor((W - GRUP_YATAY + SUTUN_ICI) / (sutunW + SUTUN_ICI))));
    }
    const parca = Math.ceil(liste.length / sutunSay);
    for (let b = 0; b < liste.length; b += parca) {
      const sutun = document.createElement('div');
      sutun.className = 'sutun';
      for (const [s, i] of liste.slice(b, b + parca)) {
        const el = slotOlustur(lv, s, i);
        if (s.bulan) {
          yeniBulunan.add(i);
          if (!oncekiBulunan.has(i)) { el.classList.add('yeni'); efektler.push([el, s]); }
        }
        sutun.appendChild(el);
      }
      govde.appendChild(sutun);
    }
    grup.append(baslik, cizgi, govde);
    tahta.appendChild(grup);
  }
  // Bu güncellemeyle tamamlanan grubu kutla
  for (const [el] of efektler) {
    const g = el.closest('.grup');
    if (g.classList.contains('tamam') && !g.classList.contains('yeni-tamam')) {
      g.classList.add('yeni-tamam');
      if (D.durum === 'oyun') setTimeout(() => Ses.cal('yildiz', 2), 250);
    }
  }
  oncekiBulunan = yeniBulunan;
  for (const [el, s] of efektler) slotEfekti(el, s);
}

function slotOlustur(lv, s, i) {
  const el = document.createElement('div');
  el.className = 'slot';
  el.dataset.i = i;
  if (s.n === lv.buyukUzunluk) el.classList.add('buyuk');
  if (s.hz) {
    el.classList.add('hazine');
    const r = document.createElement('span');
    r.className = 'hz-rozet'; r.textContent = '🗝️';
    r.title = `Hazine kelime: ×${lv.hazineCarpan || 2} puan, +${Math.round((lv.hazineSure || 8000) / 1000)} sn`;
    el.appendChild(r);
  }
  if (s.bulan) {
    el.classList.add('bulundu');
    el.style.setProperty('--renk', renk(s.bulan));
    el.title = `${ad(s.bulan)} · +${s.puan ?? ''}`;
    if (s.bulan === benimId) el.classList.add('benim');
  } else if (s.w) el.classList.add('kacti');
  const ip = new Map(s.ip || []);
  for (let j = 0; j < s.n; j++) {
    const k = document.createElement('div');
    k.className = 'k';
    k.style.setProperty('--j', j);
    if (s.w) k.textContent = trBuyuk(s.w[j]);
    else if (ip.has(j)) {
      k.textContent = trBuyuk(ip.get(j));
      k.classList.add('ipucu');
      // Açılma animasyonu yalnızca ilk kez
      const anahtar = i + ':' + j;
      if (!gorulenIpucu.has(anahtar)) { gorulenIpucu.add(anahtar); k.classList.add('yeni'); }
    }
    el.appendChild(k);
  }
  return el;
}

function slotEfekti(el, s) {
  const { x, y, r } = merkez(el);
  const benim = s.bulan === benimId;
  Efekt.patlama(x, y, renk(s.bulan), benim ? 26 : 14);
  if (!benim) Efekt.ucanYazi(x, r.top - 4, ad(s.bulan), renk(s.bulan));
  // Kazanılan puan takım puanına uçar
  const puan = benim ? sonPuanlarim[s.w] ?? s.puan : s.puan;
  const hedef = $('takimPuanKutu').classList.contains('gizli') ? $('patronCan') : $('takimPuan');
  if (puan && D.durum === 'oyun' && gorunur(hedef)) {
    const h = merkez(hedef);
    Efekt.uc(x, r.top, h.x, h.y, `+${puan}`, benim ? '#ffe28a' : renk(s.bulan), () => Efekt.patlama(h.x, h.y, '#ffc83d', 8), benim ? 'benim' : '');
  } else if (puan && benim) Efekt.ucanYazi(x, r.top - 4, `+${puan}`, '#ffe28a', 'buyuk');
  // Hazine: altın konfeti ve süreye uçan "+8 sn"
  if (s.hz) {
    Efekt.konfeti(x, y, 50, -Math.PI / 2, 1.3, 0.7);
    const sure = $('sure');
    if (D.durum === 'oyun' && gorunur(sure)) {
      const m = merkez(sure);
      Efekt.uc(x, y, m.x, m.y, `+${Math.round((D.lv.hazineSure || 8000) / 1000)} sn`, '#4ade80', () => yenidenOynat(sure, 'uzadi'), 'sure-ek');
    }
  }
}

// ---------- Harf taşları ----------
function taslariKur(lv) {
  const kutu = $('harfler');
  kutu.innerHTML = '';
  kutu.style.setProperty('--adet', lv.harfler.length);
  oncekiKullanilan = new Set();
  taslar = lv.harfler.map((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tas';
    // Taş: harf + köşede harf puanı + (varsa) çarpan rozeti
    b.innerHTML = '<span class="h"></span><span class="d"></span><span class="x"></span>';
    b.addEventListener('click', () => tasTikla(i));
    return b;
  });
  harfSirasi = lv.harfler.map((_, i) => i);
  for (const i of harfSirasi) kutu.appendChild(taslar[i]);
  if (!azHareket) {
    taslar.forEach((t, k) => t.animate(
      [{ transform: 'translateY(40px) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 380, delay: k * 45, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'backwards' }));
  }
}

// Yazılan metni taşlarla eşleştir: hangi taşlar kullanıldı, yazı geçersiz mi?
function eslestir(lv, metin) {
  const kullanilan = new Set();
  let gecersiz = false;
  let toplam = 0, bilinmeyen = false;
  for (const ch of trKucuk(metin)) {
    if (/\s/.test(ch)) continue;
    // Aynı harften birden fazla taş varsa çarpanı yüksek olan önce kullanılır (sunucudaki hesapla aynı)
    let i;
    for (const k of harfSirasi) {
      const h = lv.harfler[k];
      if (!kullanilan.has(k) && !h.sahte && h.ch === ch && (i === undefined || h.x > lv.harfler[i].x)) i = k;
    }
    // Henüz açılmamış gizli harf her harfin yerine geçebilir
    if (i === undefined) i = harfSirasi.find((k) => !kullanilan.has(k) && lv.harfler[k].ch === '?');
    if (i === undefined) { gecersiz = true; continue; }
    kullanilan.add(i);
    const h = lv.harfler[i];
    if (h.d == null) bilinmeyen = true; else toplam += h.d * (h.x || 1);
  }
  return { kullanilan, gecersiz, toplam, bilinmeyen };
}

// Yazılan kelime tahtaya girerse kaç puan getirir? (seri bonusu ve hazine hariç)
function tahminiPuan(lv, metin) {
  const w = trKucuk(metin.trim());
  const n = [...w].length;
  const { toplam, bilinmeyen, gecersiz } = eslestir(lv, w);
  if (gecersiz || n < lv.minHarf) return null;
  const buyuk = n === lv.buyukUzunluk ? 2 : 1;
  const hamle = sonHamleMi() ? lv.sonHamleCarpan || 1.5 : 1;
  const puan = Math.max(1, Math.round(toplam * PUAN_OLCEK * uzunlukCarpani(n) * buyuk * (lv.puanCarpan || 1)));
  return { puan: Math.round(puan * hamle), yaklasik: bilinmeyen, buyuk: buyuk > 1, hamle: hamle > 1 };
}

function taslariGuncelle(lv) {
  const { kullanilan } = eslestir(lv, $('tahmin').value);
  const oynaniyor = D.durum === 'oyun';
  lv.harfler.forEach((h, i) => {
    const t = taslar[i];
    if (!t) return;
    const harf = h.ch === '?' ? '?' : trBuyuk(h.ch);
    const hEl = t.querySelector('.h');
    if (hEl.textContent !== harf) {
      const gizliydi = hEl.textContent === '?';
      hEl.textContent = harf;
      if (gizliydi) yenidenOynat(t, 'acildi');
    }
    t.querySelector('.d').textContent = h.d == null ? '?' : h.d;
    t.querySelector('.x').textContent = h.x > 1 ? '×' + h.x : '';
    t.classList.toggle('carpan2', h.x === 2);
    t.classList.toggle('carpan3', h.x === 3);
    t.classList.toggle('nadir', (h.d || 0) >= 5);
    t.title = h.ch === '?' ? 'Gizli harf' : `${harf}: ${h.d} puan${h.x > 1 ? ` · ×${h.x} taş (${h.d * h.x} puan)` : ''}`;
    t.classList.toggle('gizli-harf', h.ch === '?');
    t.classList.toggle('acik-gizli', !!h.gizli && h.ch !== '?');
    const sahteOldu = !!h.sahte && !t.classList.contains('sahte');
    t.classList.toggle('sahte', !!h.sahte);
    if (sahteOldu && oynaniyor) yenidenOynat(t, 'sallan');
    t.classList.toggle('kullanildi', kullanilan.has(i));
    // Yeni kullanılan taş küçük bir zıplamayla rafa iner
    if (kullanilan.has(i) && !oncekiKullanilan.has(i) && !azHareket) {
      t.animate([{ transform: 'translateY(-12px) scale(1.08)' }, { transform: 'translateY(5px) scale(.92)' }], { duration: 170, easing: 'ease-out' });
    }
    t.disabled = !oynaniyor;
  });
  oncekiKullanilan = kullanilan;
  girdiDurumu(lv);
}

function girdiDurumu(lv) {
  const el = $('tahmin');
  const metin = el.value.trim();
  el.classList.remove('gecersiz', 'zaten', 'hazir');
  const onizleme = $('tahminPuan');
  onizleme.className = 'tahmin-puan';
  onizleme.textContent = '';
  if (!metin || /\s/.test(metin) || metin.startsWith('/') || D.durum !== 'oyun') return;
  const w = trKucuk(metin);
  if (eslestir(lv, metin).gecersiz) el.classList.add('gecersiz');
  else if (lv.tahta.some((s) => s.w === w) || lv.bonus.some((b) => b.w === w)) el.classList.add('zaten');
  else if ([...w].length >= lv.minHarf) {
    el.classList.add('hazir');
    // Canlı puan önizlemesi: bu kelime tahtadaysa kaç puan getirir
    const t = tahminiPuan(lv, metin);
    if (t) {
      onizleme.textContent = `${t.yaklasik ? '≈ ' : ''}${t.puan} puan${t.hamle ? ' ⏱' : ''}${t.buyuk ? ' · büyük kelime!' : ''}`;
      onizleme.classList.add('goster');
      if (t.buyuk) onizleme.classList.add('altin');
      if (t.hamle) onizleme.classList.add('hamle');
    }
  }
}

function girdiAyarla(deger, guncelle = true) {
  $('tahmin').value = deger;
  oncekiUzunluk = [...deger].length;
  if (guncelle && D?.lv) taslariGuncelle(D.lv);
}

function tasTikla(i) {
  const lv = D?.lv;
  const h = lv?.harfler[i];
  if (!h || D.durum !== 'oyun') return;
  const t = taslar[i];
  if (h.sahte || h.ch === '?' || eslestir(lv, $('tahmin').value).kullanilan.has(i)) {
    yenidenOynat(t, 'sallan');
    Ses.cal('zaten');
    return;
  }
  girdiAyarla($('tahmin').value + h.ch);
  Ses.cal('harf', oncekiUzunluk);
  odakla($('tahmin'));
}

function harfleriKaristir(sesli = true) {
  if (taslar.length < 2) return;
  const once = harfSirasi.map((i) => taslar[i].getBoundingClientRect());
  const eskiSira = [...harfSirasi];
  let yeni;
  do {
    yeni = [...harfSirasi];
    for (let i = yeni.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [yeni[i], yeni[j]] = [yeni[j], yeni[i]];
    }
  } while (yeni.every((v, k) => v === harfSirasi[k]));
  harfSirasi = yeni;
  const kutu = $('harfler');
  for (const i of harfSirasi) kutu.appendChild(taslar[i]);
  // FLIP: taşları eski yerlerinden yenilerine kavisli kaydır
  if (!azHareket) {
    eskiSira.forEach((i, k) => {
      const a = once[k];
      const b = taslar[i].getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      const kavis = -Math.min(36, 12 + Math.abs(dx) * 0.08);
      taslar[i].animate([
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: `translate(${dx / 2}px, ${dy / 2 + kavis}px) rotate(${dx > 0 ? -8 : 8}deg)`, offset: 0.5 },
        { transform: 'translate(0, 0)' },
      ], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' });
    });
  }
  if (sesli) Ses.cal('karistir');
  if (D?.lv) taslariGuncelle(D.lv);
}


$('tahmin').addEventListener('input', () => {
  const n = [...$('tahmin').value].length;
  if (n > oncekiUzunluk) Ses.cal('harf', n);
  else if (n < oncekiUzunluk) Ses.cal('sil');
  oncekiUzunluk = n;
  gecmisKonum = -1;
  if (D?.lv) taslariGuncelle(D.lv);
});
$('tahmin').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('tahmin').value) { e.stopPropagation(); girdiAyarla(''); Ses.cal('sil'); }
  // ↑ / ↓: bu seviyedeki son tahminler arasında gezin (yazım hatasını düzeltmek için)
  if (e.key === 'ArrowUp' && tahminGecmisi.length) {
    e.preventDefault();
    gecmisKonum = gecmisKonum < 0 ? tahminGecmisi.length - 1 : Math.max(0, gecmisKonum - 1);
    girdiAyarla(tahminGecmisi[gecmisKonum]);
    Ses.cal('tikla');
  } else if (e.key === 'ArrowDown' && gecmisKonum >= 0) {
    e.preventDefault();
    gecmisKonum += 1;
    if (gecmisKonum >= tahminGecmisi.length) { gecmisKonum = -1; girdiAyarla(''); }
    else girdiAyarla(tahminGecmisi[gecmisKonum]);
    Ses.cal('tikla');
  }
});
$('silBtn').onclick = () => {
  const v = [...$('tahmin').value];
  if (!v.length) return;
  v.pop();
  girdiAyarla(v.join(''));
  Ses.cal('sil');
  odakla($('tahmin'));
};

function bonusCiz(lv) {
  const kap = $('bonusSatir');
  kap.innerHTML = '';
  const liste = lv.bonus.slice(-24);
  const bas = lv.bonus.length - liste.length; // listedeki ilk öğenin lv.bonus içindeki sırası
  liste.forEach((b, k) => {
    const s = document.createElement('span');
    s.className = 'b'; s.textContent = trBuyuk(b.w); s.title = `Bonus +${b.puan} — ${ad(b.bulan)}`;
    s.style.setProperty('--renk', renk(b.bulan));
    if (bas + k >= bonusSayisi) s.classList.add('yeni'); // yalnızca yeni gelen çip canlansın
    kap.appendChild(s);
  });
  bonusSayisi = lv.bonus.length;
}

function ipucuCiz(lv) {
  const b = $('ipucuBtn');
  b.querySelector('.say').textContent = lv.ipucuKalan ?? 0;
  b.querySelector('.bedel').textContent = `−${lv.ipucuBedel ?? 25}`;
  const ben = oyuncu(benimId);
  const bedel = lv.ipucuBedel ?? 25;
  b.disabled = D.durum !== 'oyun' || !(lv.ipucuKalan > 0) || !ben || ben.puan < bedel;
  b.title = !(lv.ipucuKalan > 0) ? 'Bu seviyenin ipucu hakları bitti'
    : ben && ben.puan < bedel ? `İpucu için en az ${bedel} puanın olmalı`
    : `Bulunmamış bir kelimenin bir harfini herkese açar (−${bedel} puan)`;
}
$('ipucuBtn').onclick = () => {
  socket.emit('ipucu', (c) => {
    if (c?.hata) { geriBildirim(c.hata, 'kotu'); Ses.cal('yanlis'); }
  });
  odakla($('tahmin'));
};

function skorCiz() {
  const ol = $('skorTablosu');
  ol.innerHTML = '';
  const sirali = [...D.oyuncular].sort((a, b) => b.puan - a.puan);
  sirali.forEach((p, i) => {
    const li = document.createElement('li');
    if (p.id === benimId) li.classList.add('ben');
    if (!p.bagli) li.classList.add('cevrimdisi');
    const onceki = oncekiPuanlar[p.id];
    if (onceki !== undefined && p.puan > onceki) li.classList.add('nabiz');
    oncekiPuanlar[p.id] = p.puan;
    const sp = p.seviyePuan ? (p.seviyePuan > 0 ? '+' : '') + p.seviyePuan : '';
    li.innerHTML = `<span class="sira">${i === 0 && p.puan > 0 ? '👑' : i + 1}</span><span class="nokta" style="background:${p.renk}"></span><span class="ad"></span><span class="kelime-say" title="Bu seviyede bulduğu kelime">${p.seviyeKelime ? p.seviyeKelime + ' kel.' : ''}</span><span class="sp${p.seviyePuan < 0 ? ' eksi' : ''}">${sp}</span><span class="p">${p.puan}</span>`;
    li.querySelector('.ad').textContent = p.isim;
    ol.appendChild(li);
  });
}

// ---------- Oyun akışı ----------
function akisOgesi(k) {
  const li = document.createElement('li');
  if (k.tur === 'sistem') { li.className = 'sistem' + (k.olay ? ' ' + k.olay : ''); li.textContent = k.metin; }
  else if (k.tur === 'ipucu') {
    li.className = 'ipucu';
    const isim = document.createElement('b'); isim.textContent = ad(k.id); isim.style.color = renk(k.id);
    li.append('💡 ', isim, ` ipucu aldı (${k.n} harfli kelime)`);
  } else if (k.tur === 'bulundu' || k.tur === 'bonus') {
    const isim = document.createElement('b'); isim.textContent = ad(k.id); isim.style.color = renk(k.id);
    li.appendChild(isim);
    li.classList.add(k.tur);
    if (k.buyuk) li.classList.add('buyuk');
    if (k.hazine) li.classList.add('hazine');
    li.append(k.tur === 'bonus' ? ' bonus ' : ' ');
    const w = document.createElement('span'); w.className = 'w'; w.textContent = trBuyuk(k.w);
    w.style.setProperty('--renk', renk(k.id));
    const pt = document.createElement('span'); pt.className = 'pt';
    pt.textContent = ` +${k.puan}${k.seri >= 2 ? ` 🔥${k.seri}` : ''}${k.buyuk ? ' ★' : ''}${k.hazine ? ' 🗝️' : ''}${k.sonHamle ? ' ⏱' : ''}`;
    li.append(w, pt);
  } else return null;
  return li;
}
// Tam çizim (geçmiş yüklenince / oyuncu adları değişince) — animasyonsuz
function akisCiz() {
  const ul = $('akis');
  ul.innerHTML = '';
  for (const k of akisListesi) { const li = akisOgesi(k); if (li) ul.appendChild(li); }
  ul.scrollTop = ul.scrollHeight;
}
// Yeni olay: yalnızca o satır eklenir ve canlandırılır
function akisEkleDom(k) {
  const ul = $('akis');
  const li = akisOgesi(k);
  if (!li) return;
  li.classList.add('yeni');
  ul.appendChild(li);
  while (ul.children.length > 60) ul.firstChild.remove();
  ul.scrollTop = ul.scrollHeight;
}

// ---------- Sohbet ----------
function saat(t) {
  const d = new Date(t - saatFarki);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function sohbetAsagi() { const ul = $('sohbetListe'); ul.scrollTop = ul.scrollHeight; }
function sohbetOgesi(k) {
  const li = document.createElement('li');
  if (k.tur === 'sistem') { li.className = 'sistem'; li.textContent = k.metin; return li; }
  if (k.id === benimId) li.classList.add('ben');
  const ust = document.createElement('div'); ust.className = 'ust';
  const isim = document.createElement('b'); isim.textContent = ad(k.id); isim.style.color = renk(k.id);
  const zaman = document.createElement('time'); zaman.textContent = saat(k.t);
  ust.append(isim, zaman);
  const m = document.createElement('div'); m.className = 'm'; m.textContent = k.metin;
  li.append(ust, m);
  return li;
}
function sohbetCiz(asagi = false) {
  const ul = $('sohbetListe');
  const altta = ul.scrollHeight - ul.scrollTop - ul.clientHeight < 50;
  ul.innerHTML = '';
  for (const k of sohbetListesi) ul.appendChild(sohbetOgesi(k));
  if (asagi || altta) sohbetAsagi();
}
function sohbetEkleDom(k, asagi) {
  const ul = $('sohbetListe');
  const altta = ul.scrollHeight - ul.scrollTop - ul.clientHeight < 50;
  const li = sohbetOgesi(k);
  li.classList.add('yeni');
  ul.appendChild(li);
  while (ul.children.length > 80) ul.firstChild.remove();
  if (asagi || altta) sohbetAsagi();
}
$('sohbetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const metin = $('sohbetGirdi').value.trim();
  if (!metin) return;
  socket.emit('sohbet', metin);
  $('sohbetGirdi').value = '';
});
for (const e of TEPKILER) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tepki-btn'; b.textContent = e; b.title = 'Tepki gönder';
  b.onclick = () => socket.emit('tepki', e);
  $('tepkiler').appendChild(b);
}

// ---------- Sonuç ekranı ----------
function sonucKatmani(goster) {
  $('sonucKatman').classList.toggle('gizli', !goster);
  document.body.classList.toggle('sonuc-acik', goster); // afişler sonuç kartını kapatmasın
  $('sonucAcBtn').classList.toggle('gizli', goster || !D || D.durum === 'oyun' || !D.sonSonuc);
}
$('sonucAcBtn').onclick = () => sonucKatmani(true);
$('sonucKatman').addEventListener('click', (e) => { if (e.target === $('sonucKatman')) sonucKatmani(false); });

// Seviye sonu ödülleri (sunucu kimin aldığını hesaplar, metinler burada)
const ODULLER = {
  ilk:       { ikon: '⚡', ad: 'İlk Kan',       detay: (o) => trBuyuk(o.w) },
  deger:     { ikon: '💎', ad: 'En Değerli',    detay: (o) => `${trBuyuk(o.w)} +${o.puan}` },
  hazine:    { ikon: '🗝️', ad: 'Hazine Avcısı', detay: (o) => trBuyuk(o.w) },
  kurtarici: { ikon: '🛡️', ad: 'Kurtarıcı',     detay: () => 'hedefi o geçirdi' },
  seri:      { ikon: '🔥', ad: 'Seri Ustası',   detay: (o) => `${o.n} kelime art arda` },
  bonus:     { ikon: '🎯', ad: 'Bonus Avcısı',  detay: (o) => `${o.n} bonus kelime` },
};

function sonucCiz(durumDegisti) {
  const r = D.sonSonuc;
  if (!r || D.durum === 'oyun') { sonucKatmani(false); return; }
  if (durumDegisti) sonucKatmani(true);
  else sonucKatmani(!$('sonucKatman').classList.contains('gizli'));
  const bitti = r.oyunBitti;
  $('sonucBaslik').textContent = bitti ? 'Oyun bitti!' : r.gecti ? `Seviye ${r.seviye} geçildi!` : `Seviye ${r.seviye} başarısız`;
  $('sonucBaslik').className = 'sonuc-baslik ' + (r.gecti ? 'iyi' : 'kotu');

  // Yıldızlar: durum yeni değiştiyse tek tek yansın
  const yk = $('sonucYildiz');
  yk.innerHTML = [0, 1, 2].map((i) => `<span class="${!durumDegisti && i < r.yildiz ? '' : 'bos'}">★</span>`).join('');
  if (durumDegisti) {
    [...yk.children].slice(0, r.yildiz).forEach((s, i) => setTimeout(() => {
      s.classList.remove('bos'); s.classList.add('pop'); Ses.cal('yildiz', i);
      const m = merkez(s); Efekt.patlama(m.x, m.y, '#ffc83d', 16);
    }, 500 + i * 380));
  }

  const oran = Math.min(100, Math.round(100 * r.takimPuan / Math.max(1, r.puanMax)));
  $('sonucDetay').innerHTML = `<div class="takim-sonuc">Takım puanı <b>${r.takimPuan}</b> / hedef ${r.puanHedef}</div><div class="sonuc-bar"><span style="width:${oran}%"></span><i style="left:${Math.min(100, 100 * r.puanHedef / Math.max(1, r.puanMax))}%"></i></div><div><b>${r.bulunan}</b>/${r.toplam} kelime bulundu · tam puan ${r.puanMax}</div><div class="tohum">Büyük kelime: <b></b><span></span></div>`;
  $('sonucDetay').querySelector('.tohum b').textContent = trBuyuk(r.tohum);
  $('sonucDetay').querySelector('.tohum span').textContent = r.buyukBulan ? ` — ${ad(r.buyukBulan)} buldu` : ' — bulunamadı';

  const ben = oyuncu(benimId);
  const benimKelime = D.lv ? D.lv.tahta.filter((s) => s.bulan === benimId).length : 0;
  if (bitti && ben) {
    const parca = [`${ben.kelime} kelime`];
    if (ben.enIyi) parca.push(`en iyisi ${trBuyuk(ben.enIyi.w)} +${ben.enIyi.puan}`);
    if (ben.enSeri >= 2) parca.push(`en uzun seri 🔥${ben.enSeri}`);
    parca.push(`${ben.puan} puan`);
    const rk = rekorlar()[r.zorluk];
    $('sonucBen').textContent = `Senin oyunun: ${parca.join(' · ')}${rk?.seviye ? ` · rekorun: seviye ${rk.seviye}` : ''}`;
  } else {
    $('sonucBen').textContent = ben ? `Sen: ${benimKelime} kelime · ${ben.seviyePuan >= 0 ? '+' : ''}${ben.seviyePuan} puan · toplam ${ben.puan}` : '';
  }
  if (r.canKazanildi) {
    const c = document.createElement('div'); c.className = 'can-kazandi'; c.textContent = '👑 Patron yenildi! +1 ♥ can kazandınız';
    $('sonucDetay').appendChild(c);
  }

  // Ödüller
  const od = $('sonucOdul');
  od.innerHTML = '';
  (r.oduller || []).forEach((o, i) => {
    const t = ODULLER[o.k];
    if (!t) return;
    const kart = document.createElement('div');
    kart.className = 'odul' + (o.id === benimId ? ' benim' : '');
    kart.style.setProperty('--renk', renk(o.id));
    kart.style.setProperty('--i', i);
    kart.innerHTML = '<span class="ikon"></span><div><small></small><b></b><span class="detay"></span></div>';
    kart.querySelector('.ikon').textContent = t.ikon;
    kart.querySelector('small').textContent = t.ad;
    kart.querySelector('b').textContent = ad(o.id);
    kart.querySelector('.detay').textContent = t.detay(o);
    if (!durumDegisti) kart.classList.add('sessiz');
    od.appendChild(kart);
  });
  if (durumDegisti) {
    const n = (r.oduller || []).length;
    for (let i = 0; i < n; i++) setTimeout(() => Ses.cal('odul', i), 500 + r.yildiz * 380 + 150 + i * 160);
    od.style.setProperty('--gecikme', (500 + r.yildiz * 380 + 150) + 'ms');
  }

  $('sonucMvp').innerHTML = '';
  $('podyum').classList.toggle('gizli', !bitti);
  $('sonucMvp').classList.toggle('gizli', bitti);
  if (bitti) podyumCiz();
  else {
    r.mvp.forEach((m, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${['🥇', '🥈', '🥉'][i]}</span><span class="nokta" style="background:${renk(m.id)}"></span><span class="ad"></span><small>${m.kelime ? m.kelime + ' kelime' : ''}</small><b>+${m.puan}</b>`;
      li.querySelector('.ad').textContent = ad(m.id);
      $('sonucMvp').appendChild(li);
    });
  }

  // Kaçırılan kelimeler (uzundan kısaya)
  const kacan = D.lv ? D.lv.tahta.filter((s) => !s.bulan && s.w).map((s) => s.w).sort((a, b) => b.length - a.length) : [];
  const kk = $('sonucKacan');
  kk.innerHTML = '';
  if (kacan.length) {
    const baslik = document.createElement('div'); baslik.className = 'etiket'; baslik.textContent = `Kaçan kelimeler (${kacan.length})`;
    const satir = document.createElement('div'); satir.className = 'cipler';
    for (const w of kacan.slice(0, 14)) { const s = document.createElement('span'); s.textContent = trBuyuk(w); satir.appendChild(s); }
    if (kacan.length > 14) { const s = document.createElement('span'); s.className = 'fazla'; s.textContent = `+${kacan.length - 14}`; satir.appendChild(s); }
    kk.append(baslik, satir);
  }

  // Sıradaki seviye önizlemesi
  const sn = $('sonucSonraki');
  sn.innerHTML = '';
  sn.className = 'sonuc-sonraki';
  if (r.sonraki && !bitti) {
    sn.dataset.tur = r.sonraki.tur;
    const ust = document.createElement('div');
    ust.className = 'ss-ust';
    ust.textContent = `Sıradaki: Seviye ${r.sonraki.seviye}${r.sonraki.ad ? ` · ${r.sonraki.ikon} ${r.sonraki.ad}` : ''}`;
    sn.appendChild(ust);
    if (r.sonraki.aciklama) { const a = document.createElement('small'); a.textContent = r.sonraki.aciklama; sn.appendChild(a); }
    if (!r.gecti) { const a = document.createElement('small'); a.textContent = 'Aynı seviye yeni harflerle tekrar'; sn.appendChild(a); }
  }

  const btn = $('sonucButonlar');
  btn.innerHTML = '';
  if (bitti) {
    $('sonucAlt').textContent = `Canlar bitti. Ulaşılan seviye: ${r.seviye} (${ZORLUK_AD[r.zorluk] || ''}).`;
    if (sahibim()) {
      const b1 = document.createElement('button'); b1.className = 'btn ana'; b1.textContent = 'Yeniden oyna'; b1.onclick = () => socket.emit('baslat');
      const b2 = document.createElement('button'); b2.className = 'btn'; b2.textContent = 'Lobiye dön'; b2.onclick = () => socket.emit('lobi');
      btn.append(b1, b2);
    } else $('sonucAlt').textContent += ' Oda sahibi yeni oyunu başlatabilir.';
  }
  const kapat = document.createElement('button'); kapat.className = 'btn hayalet'; kapat.textContent = 'Tahtayı gör';
  kapat.onclick = () => sonucKatmani(false);
  btn.append(kapat);
}

function podyumCiz() {
  const p = $('podyum');
  p.innerHTML = '';
  const sirali = [...D.oyuncular].sort((a, b) => b.puan - a.puan).slice(0, 3);
  // Görsel sıra: 2. — 1. — 3.
  const yerler = [[sirali[1], 2], [sirali[0], 1], [sirali[2], 3]].filter(([o]) => o);
  for (const [o, sira] of yerler) {
    const d = document.createElement('div');
    d.className = 'basamak b' + sira;
    d.innerHTML = `<div class="avatar" style="background:${o.renk}"></div><div class="ad"></div><div class="puan">${o.puan}</div><div class="kaide">${['', '🥇', '🥈', '🥉'][sira]}</div>`;
    d.querySelector('.avatar').textContent = trBuyuk(o.isim[0] || '?');
    d.querySelector('.ad').textContent = o.isim;
    p.appendChild(d);
  }
}

// ---------- Tahmin ----------
const mesajlar = {
  kisa: () => `En az ${D.lv.minHarf} harf olmalı`,
  harf: (c) => `${trBuyuk(c.w)} bu harflerle yazılamaz`,
  yok: (c) => `${trBuyuk(c.w)} sözlükte yok`,
  zaten: (c) => `${trBuyuk(c.w)} zaten bulundu (${ad(c.bulan)})`,
  zatenBonus: (c) => `${trBuyuk(c.w)} zaten bonus olarak bulundu`,
  yavas: () => 'Biraz yavaş :)',
};
let bildirimZaman;
function geriBildirim(metin, tur) {
  const el = $('geriBildirim');
  el.textContent = metin;
  el.className = 'geri-bildirim goster ' + tur;
  clearTimeout(bildirimZaman);
  bildirimZaman = setTimeout(() => el.classList.remove('goster'), 2200);
}
// Seri sunucusu: seri büyüdükçe ünvan da büyür
const SERI_UNVAN = ['', '', 'SERİ', 'HARİKA', 'SÜPER', 'MUHTEŞEM', 'EFSANE'];
let seriZaman;
function seriGoster(seri, bonus) {
  const el = $('seriRozet');
  el.textContent = `🔥 ${SERI_UNVAN[Math.min(seri, 6)]} ×${seri}${bonus ? `  +${bonus}` : ''}`;
  el.style.setProperty('--guc', Math.min(seri, 6));
  el.classList.toggle('ates', seri >= 4);
  yenidenOynat(el, 'goster');
  clearTimeout(seriZaman);
  seriZaman = setTimeout(() => el.classList.remove('goster'), 2000);
  if (seri >= 4) {
    const m = merkez(el);
    Efekt.patlama(m.x, m.y, '#ff8a3d', 10 + seri * 3);
  }
}

$('tahminForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const metin = $('tahmin').value.trim();
  if (!metin) return;
  if (tahminGecmisi[tahminGecmisi.length - 1] !== metin) tahminGecmisi.push(metin);
  if (tahminGecmisi.length > 15) tahminGecmisi.shift();
  gecmisKonum = -1;
  girdiAyarla('');
  socket.emit('tahmin', metin, tahminSonucu);
});

function tahminSonucu(c) {
  const sahne = $('sahne');
  if (c.tur === 'yeni') {
    sonPuanlarim[c.w] = c.puan;
    Ses.cal(c.buyuk ? 'buyuk' : 'dogru');
    Ses.cal('puan', Math.round(c.puan / 60));
    const ekler = [c.buyuk && 'BÜYÜK KELİME!', c.hazine && '🗝️ HAZİNE', c.sonHamle && '⏱ ×1.5'].filter(Boolean);
    geriBildirim(`${trBuyuk(c.w)} +${c.puan}${ekler.length ? ' — ' + ekler.join(' · ') : ''}`, c.buyuk || c.hazine ? 'altin' : 'iyi');
    yenidenOynat(sahne, c.hazine ? 'flas-bonus' : 'flas-dogru');
    if (c.seri >= 2) { setTimeout(() => Ses.cal('seri', c.seri), 200); seriGoster(c.seri, c.seriBonus); }
  } else if (c.tur === 'bonus') {
    Ses.cal('bonus');
    Ses.cal('puan', Math.max(1, Math.round(c.puan / 60)));
    geriBildirim(`Bonus kelime: ${trBuyuk(c.w)} +${c.puan}${c.sonHamle ? ' ⏱' : ''}`, 'altin');
    yenidenOynat(sahne, 'flas-bonus');
    const m = merkez($('tahmin'));
    Efekt.patlama(m.x, m.y, '#ffc83d', 16);
    const hedef = $('takimPuanKutu').classList.contains('gizli') ? $('patronCan') : $('takimPuan');
    if (gorunur(hedef)) {
      const h = merkez(hedef);
      Efekt.uc(m.x, m.r.top, h.x, h.y, `+${c.puan}`, '#ffc83d', () => Efekt.patlama(h.x, h.y, '#ffc83d', 8), 'benim');
    } else Efekt.ucanYazi(m.x, m.r.top, `+${c.puan}`, '#ffc83d', 'buyuk');
  } else if (c.tur === 'zaten' || c.tur === 'zatenBonus') {
    Ses.cal('zaten');
    geriBildirim(mesajlar[c.tur](c), 'notr');
    yenidenOynat($('tahminForm'), 'salla-hafif');
  } else if (mesajlar[c.tur]) {
    Ses.cal('yanlis');
    geriBildirim(mesajlar[c.tur](c), 'kotu');
    yenidenOynat($('tahminForm'), 'salla');
  }
}

// Oyun ekranında herhangi bir harfe basınca tahmin kutusuna odaklan
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('menuKatman').classList.add('gizli'); if (D?.durum !== 'oyun') sonucKatmani(false); }
  if (!$('oyun').classList.contains('aktif')) return;
  const odak = document.activeElement;
  if (odak && ['INPUT', 'SELECT', 'TEXTAREA'].includes(odak.tagName)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length === 1 || e.key === 'Backspace') $('tahmin').focus();
});

// ---------- Menü ve ayarlar ----------
function sesIkonlari() {
  for (const id of ['sesBtn', 'lobiSes']) { $(id).textContent = Ses.acik ? '🔊' : '🔇'; }
  for (const id of ['muzikBtn', 'lobiMuzik']) { $(id).classList.toggle('kapali', !Ses.muzikAcik); $(id).title = Ses.muzikAcik ? 'Müziği kapat' : 'Müziği aç'; }
}
sesIkonlari();
const sesDegistir = () => { Ses.acik = !Ses.acik; sesIkonlari(); Ses.cal('tikla'); };
const muzikDegistir = () => { Ses.muzikAcik = !Ses.muzikAcik; sesIkonlari(); Ses.cal('tikla'); };
$('sesBtn').onclick = $('lobiSes').onclick = sesDegistir;
$('muzikBtn').onclick = $('lobiMuzik').onclick = muzikDegistir;
$('menuBtn').onclick = () => {
  $('sesAcik').checked = Ses.acik;
  $('sesDuzey').value = Ses.duzey;
  $('muzikAcik').checked = Ses.muzikAcik;
  $('muzikDuzey').value = Ses.muzikDuzey;
  $('menuKatman').classList.remove('gizli');
};
$('sesAcik').onchange = () => { Ses.acik = $('sesAcik').checked; sesIkonlari(); Ses.cal('tikla'); };
$('sesDuzey').oninput = () => { Ses.duzey = $('sesDuzey').value; };
$('sesDuzey').onchange = () => Ses.cal('dogru');
$('muzikAcik').onchange = () => { Ses.muzikAcik = $('muzikAcik').checked; sesIkonlari(); };
$('muzikDuzey').oninput = () => { Ses.muzikDuzey = $('muzikDuzey').value; };
$('menuKapat').onclick = () => $('menuKatman').classList.add('gizli');
$('menuKatman').addEventListener('click', (e) => { if (e.target === $('menuKatman')) $('menuKatman').classList.add('gizli'); });
$('menuAtla').onclick = () => { socket.emit('atla'); $('menuKatman').classList.add('gizli'); };
$('menuLobi').onclick = () => { socket.emit('lobi'); $('menuKatman').classList.add('gizli'); };
$('menuCik').onclick = () => { kaydet('ka_oda', ''); location.href = location.pathname; };

// Seviyeler arası büyük geri sayım
function buyukSayac(n) {
  const el = $('buyukSayac');
  el.textContent = n;
  yenidenOynat(el, 'goster');
}

// ---------- Zamanlayıcı: süre, geri sayım, otomatik karıştırma, müzik ----------
let sonTik = performance.now();
let sonSaniye = null;
let sonHamleOnce = false;
setInterval(() => {
  const n = performance.now();
  const dt = n - sonTik;
  sonTik = n;

  // Müzik: lobide sakin, oyunda tempolu, son 20 saniyede gerilimli
  const oyunda = D && $('oyun').classList.contains('aktif');
  const kalanMs = D?.bitis ? D.bitis - simdi() : 0;
  Ses.muzik(!oyunda ? 'lobi' : D.durum === 'oyun' ? (kalanMs <= 20000 ? 'gerilim' : 'oyun') : 'sonuc');
  if (!D) return;

  // Otomatik karıştırma (yazarken durur)
  if (D.durum === 'oyun' && taslar.length && oyunda) {
    const yaziyor = $('tahmin').value.length > 0;
    if (!yaziyor) karistirSayac += dt;
    const oran = Math.min(1, karistirSayac / (KARISTIR_PERIYOT * 1000));
    $('karistirDolgu').style.transform = `scaleX(${oran})`;
    $('karistirGosterge').classList.toggle('durdu', yaziyor);
    if (oran >= 1) { karistirSayac = 0; harfleriKaristir(); }
  }

  // Son hamle: son 10 saniye puanlar ×1.5
  const hamle = oyunda && sonHamleMi();
  document.body.classList.toggle('son-hamle', hamle);
  if (hamle && !sonHamleOnce) {
    if (sonHamleDuyuru !== lvKimlik) {
      sonHamleDuyuru = lvKimlik;
      afis('⏱ SON HAMLE!', `Son saniyeler · bütün puanlar ×${D.lv.sonHamleCarpan || 1.5}`, 'kirmizi', 'sonHamle');
    }
    taslariGuncelle(D.lv); // puan önizlemesi çarpanı göstersin
  }
  sonHamleOnce = hamle;

  if (!D.bitis || D.durum === 'lobi') { document.body.classList.remove('son-saniye'); return; }
  const kalan = Math.max(0, kalanMs);
  const sn = Math.ceil(kalan / 1000);
  if (D.durum === 'oyun') {
    const toplam = Math.max(D.lv?.sure || D.ayar.sure * 1000, kalan);
    $('sureYazi').textContent = sn;
    $('sureHalka').style.strokeDashoffset = 119.4 * (1 - kalan / toplam);
    $('sure').classList.toggle('az', sn <= 15);
    $('sure').classList.toggle('cok-az', sn <= 5);
    document.body.classList.toggle('son-saniye', sn <= 10 && sn > 0);
    if (sonSaniye !== null && sn !== sonSaniye && sn <= 10 && sn > 0) {
      Ses.cal(sn <= 3 ? 'tikAcil' : 'tik');
      yenidenOynat($('sureYazi'), 'zipla');
    }
  } else {
    document.body.classList.remove('son-saniye');
    $('sure').classList.remove('az', 'cok-az');
    if (D.durum === 'sonuc') {
      $('sureYazi').textContent = '–';
      $('sureHalka').style.strokeDashoffset = 0;
      if (!D.sonSonuc?.oyunBitti) {
        $('sonucAlt').textContent = sn > 0 ? `Sonraki seviye ${sn} sn içinde başlıyor…` : 'Başlıyor…';
        if (sonSaniye !== null && sn !== sonSaniye && sn <= 3 && sn > 0) { Ses.cal('geriSayim'); buyukSayac(sn); }
      }
    }
  }
  sonSaniye = sn;
}, 100);

addEventListener('resize', () => { if (D?.lv && D.durum !== 'lobi') tahtaCiz(D.lv); });
