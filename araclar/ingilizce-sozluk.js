// İngilizce sözlüğü (data/sozluk-en.json) üretir.
// Kullanım: node araclar/ingilizce-sozluk.js <enable1.txt> <en_50k.txt> <kotu-kelimeler.txt>
//   enable1.txt  — ENABLE kelime listesi (kamu malı): https://github.com/dolph/dictionary
//   en_50k.txt   — OpenSubtitles sıklık listesi: https://github.com/hermitdave/FrequencyWords
//   kotu-kelimeler.txt — tahtaya çıkmaması gereken kelimeler: https://github.com/LDNOOBW
// "tum": kabul edilen bütün kelimeler (bonus), "yaygin": tahtaya çıkabilen yaygın kelimeler + sıklıkları.
const fs = require('fs');
const path = require('path');

const [enablePath, frekansPath, kotuPath] = process.argv.slice(2);
if (!enablePath || !frekansPath || !kotuPath) {
  console.error('Kullanım: node araclar/ingilizce-sozluk.js <enable1.txt> <en_50k.txt> <kotu-kelimeler.txt>');
  process.exit(1);
}
const satirlar = (p) => fs.readFileSync(p, 'utf8').split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
const harfMi = (w) => /^[a-z]+$/.test(w);

const MIN = 3, MAX = 12;
const tum = satirlar(enablePath).filter((w) => harfMi(w) && w.length >= MIN && w.length <= MAX);
const tumSet = new Set(tum);

// Kötü kelimeler ve yaygın çekimleri tahtaya çıkmaz (yazan oyuncu yine bonus alabilir)
const kotu = new Set();
for (const k of satirlar(kotuPath).filter(harfMi)) {
  for (const ek of ['', 's', 'es', 'ed', 'ing', 'er', 'ers', 'y', 'ier']) kotu.add(k + ek);
}
// Listede olmayan birkaç hakaret/argo kelime
for (const k of ['crap', 'piss', 'pissed', 'damn', 'damned', 'bloody', 'bastard', 'bastards', 'hell', 'retard', 'retarded', 'whore', 'slut', 'tit', 'tits', 'nazi', 'nazis', 'kill', 'killed', 'killer', 'killing', 'rape', 'raped', 'rapist', 'murder', 'suicide']) kotu.add(k);

const yaygin = {};
let alinan = 0;
for (const satir of satirlar(frekansPath)) {
  const [w, sayi] = satir.split(/\s+/);
  const f = Number(sayi);
  if (!harfMi(w) || !tumSet.has(w) || kotu.has(w) || !(f > 0)) continue;
  if (w.length < MIN || w.length > MAX) continue;
  yaygin[w] = f;
  if (++alinan >= 12000) break; // en sık 12 bin kelime (liste sıklığa göre sıralı)
}

const cikti = {
  kaynak: 'ENABLE kelime listesi (kamu malı, github.com/dolph/dictionary) + OpenSubtitles sıklık listesi (github.com/hermitdave/FrequencyWords)',
  tum,
  yaygin,
};
const hedef = path.join(__dirname, '..', 'data', 'sozluk-en.json');
fs.writeFileSync(hedef, JSON.stringify(cikti));
console.log(`tum: ${tum.length} · yaygin: ${Object.keys(yaygin).length} · ${(fs.statSync(hedef).size / 1024).toFixed(0)} KB → ${hedef}`);
