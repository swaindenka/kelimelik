# Kelime Avı

Words on Stream (wos.gg) tarzı, arkadaşlarla tarayıcıda birlikte oynanan Türkçe (isteğe bağlı İngilizce) kelime oyunu.

Ekrana karışık harfler gelir. Herkes aynı anda bu harflerden kelime yazar. Bir kelimeyi ilk bulan puanı alır, kelime de onun rengiyle tahtada açılır. Süre bitmeden takımın toplam puanı hedefe ulaşırsa seviye geçilir, ulaşamazsa bir can gider.

## Çalıştırma

Node.js 18 veya üstü gerekir.

```bash
npm install
npm start
```

Sonra tarayıcıda `http://localhost:3000` adresini aç. Port değiştirmek için: `PORT=8080 npm start`.

## Arkadaşlarla oynama

- **Aynı ağdaysanız (ev/LAN):** Sunucuyu çalıştıran bilgisayarın yerel IP'si ile girin, ör. `http://192.168.1.20:3000`.
- **Farklı yerlerdeyseniz (hızlı yol):** Sunucu senin bilgisayarında çalışırken bir tünel aç:
  - `cloudflared tunnel --url http://localhost:3000` (ücretsiz, hesap gerekmez) ya da
  - `ngrok http 3000`
  Verilen `https://…` linkini arkadaşlarına gönder.
- **Kalıcı yayın:** Render, Railway, Fly.io veya bir VPS'e yükleyebilirsin. Klasörde `render.yaml` ve `Dockerfile` hazır. Render'da "New → Blueprint" ile repoyu seçmen yeterli. WebSocket desteği olan her Node sunucusunda çalışır.

Oda kurduktan sonra lobideki **Davet linkini kopyala** butonuyla linki paylaş. Arkadaşlar linke tıklayıp ismini yazınca odaya girer.

## Oyun kuralları

| Mekanik | Açıklama |
|---|---|
| Seviyeler | Harf sayısı seviye ilerledikçe artar: 6 → 7 → 8 → 9 → 10 harf |
| En az harf | 1–4. seviyelerde 3 harf, sonrasında 4 harf |
| Harf puanı | Her taşın köşesinde yazar. Sık harf az, nadir harf çok puan: A E İ K L N R T = 1 · I M O S U = 2 · B D Ü Y = 3 · C Ç Ş Z = 4 · G H P = 5 · F Ö V = 7 · Ğ = 8 · J = 10 |
| Çarpanlı taş | 2. seviyeden itibaren rastgele bir taş **×2**, 6. seviyeden itibaren bir taş daha (**×2** ya da **×3**). O taştaki harfin puanı katlanır. Aynı harften iki taş varsa çarpanlı olan önce kullanılır |
| Kelime puanı | (harf puanları toplamı) × 10 × uzunluk çarpanı × seviye çarpanı. Uzunluk çarpanı: 3 harf ×1, her ek harf +0.25 (10 harf ×2.75). Büyük kelime (tüm harfler) ×2 |
| Puan hedefi | Seviyeyi geçmek için takımın toplam puanı hedefe ulaşmalı. Hedef, tahtadaki tüm kelimelerin toplam puanının bir oranıdır (seviye ve zorlukla artar). Bonus kelimeler ve seri puanı da hedefe sayılır |
| Yıldızlar | ★ hedef · ★★ hedef ile tam puanın ortası · ★★★ tam puan ya da bütün kelimeler bulundu |
| Yıldız = seviye ⭐ | Geçilen seviyede alınan yıldız kadar ilerlenir: ★ +1, ★★ +2, ★★★ +3 seviye. Patron seviyeleri (10, 20, …) atlanamaz; atlama bir sonraki patronda durur. Lobideki **İlerleme** ayarıyla her geçişte 1 seviyeye çevrilebilir |
| Bonus kelime | Tahtada olmayan ama sözlükte olan kelime: aynı kelime tahtada olsaydı alacağı puanın %40'ı |
| Hazine kelime 🗝️ | 2. seviyeden itibaren tahtadaki bir kelimenin yeri altın renkte parlar (kelimenin kendisi gizli). Bulan ×2 puan alır, takıma +8 saniye kazandırır |
| Son hamle ⏱ | Sürenin son 10 saniyesinde bulunan kelimeler (bonuslar da) ×1.5 puan |
| Patron canı | Patron seviyelerinde puan hedefi patronun canı olarak gösterilir, her kelime ona vurur |
| Gizli harf `?` | 4. seviyeden itibaren bazı seviyelerde çıkar, sürenin %40'ında açılır. Puanı da açılana kadar gizlidir |
| Sahte harf | 7. seviyeden sonra çıkabilir. Kelimede bulunmaz, çoğu zaman cazip, yüksek puanlı bir harftir. Sürenin %60'ında üstü çizilir |
| Buzlu harf ❄️ | 5. seviyeden sonra çıkabilir (~%35). Takım 2–3 kelime (tahta ya da bonus) bulana kadar kullanılamaz; kalan sayı taşın köşesinde yazar |
| Bomba harf 💣 | 8. seviyeden sonra çıkabilir (~%30). Fitili sürenin ~%30'u kadar (20–35 sn) yanar. O harfi içeren bir kelime bulunursa imha edilir ve bulan ek puan alır; bulunmazsa patlar ve takım **10 saniye** kaybeder |
| Tuzak sınırı | Aynı seviyede en çok 2 tuzak (gizli, sahte, buzlu, bomba), 10. etkin seviyeden sonra 3 |
| Kalabalık dengesi 👥 | Seviye başındaki bağlı oyuncu sayısına göre: her ek oyuncu hedefi %14 artırır (en çok %60), süreyi %5 kısaltır (en çok %25) ve tahtaya daha çok kelime çıkarır (en az 8 → 16, en çok 30 → 40). Hedef tam puanın %85'ini geçmez |
| Can | Başarısız seviye 1 can götürür. Can biterse oyun biter (lobiden 1/3/5/sınırsız seçilir) |
| Seri 🔥 | 8 saniye içinde art arda kelime bulan oyuncu seri yapar: her adım kelime puanına +%10 (en fazla +%50) |
| İpucu 💡 | Seviye başına oda genelinde 3 hak. Bulunmamış bir kelimenin bir harfini herkese açar, alanın puanından 25 düşer (takım puanı etkilenmez) |
| Otomatik karıştırma | Harfler 10 saniyede bir kendiliğinden karışır, yazarken durur |
| Tahmin geçmişi | Tahmin kutusunda ↑ / ↓ o seviyedeki son tahminleri geri getirir (yazım hatası düzeltmek için) |
| Ödüller | Seviye sonunda: ⚡ İlk Kan, 💎 En Değerli kelime, 🗝️ Hazine Avcısı, 🛡️ Kurtarıcı (hedefi geçiren), 🔥 Seri Ustası (3+ seri), 🎯 Bonus Avcısı (2+ bonus) |
| Sıradaki seviye | Sonuç ekranı bir sonraki seviyenin türünü (Hızlı / Altın / Patron) önceden duyurur |
| Seviye arası | Sonuç ekranı 16 saniye açık kalır (tahtaya bakmaya zaman kalsın). Bağlı herkes **Hazırım** derse sonraki seviye beklemeden başlar |
| Dil 🌐 | Lobide oda sahibi kelime dilini seçer: **Türkçe** (varsayılan) ya da **İngilizce**. Harf puanları dile göre değişir; arayüz Türkçe kalır |
| Rekor 🏆 | Her zorlukta geçilen en yüksek seviye ve en yüksek puan tarayıcıda saklanır, lobide gösterilir. Oyun başındaki rekor aşılınca duyurulur |
| Sohbet | Lobide ve oyunda ayrı sohbet paneli, emoji tepkileri. Tahmin kutusuna boşluklu ya da `/` ile başlayan yazılanlar da sohbete gider |

## Zorluk

Oda sahibi lobide zorluğu seçer. Zorluk süreyi, puan hedefinin yüksekliğini, harf sayısının ve gizli/sahte harflerin ne kadar erken geleceğini ve puan çarpanını belirler.

| Zorluk | Süre | Hedef | Özellikler | Puan |
|---|---|---|---|---|
| 🌱 Kolay | ×1.25 | %25 düşük | 3 seviye geç gelir, 8. seviyeye kadar 3 harfli kelimeler geçerli | ×0.8 |
| ⚔️ Normal | ×1 | — | yukarıdaki tabloya göre | ×1 |
| 🔥 Zor | ×0.85 | %15 yüksek | 2 seviye erken gelir (7 harfle başlar) | ×1.25 |
| 💀 Uzman | ×0.75 | %30 yüksek | 4 seviye erken gelir | ×1.5 |

## Özel seviyeler

| Tür | Ne zaman | Etkisi |
|---|---|---|
| ⚡ Hızlı Tur | 3. seviyeden | Süre ×0.6, hedef %25 düşük, puan ×1.25 |
| 🎯 Görev Turu | 3. seviyeden | Tahtaya göre 3 görev (ör. "5 harfli 3 kelime", "K geçen 4 kelime", "2 bonus kelime", "bir oyuncu ×3 seri", "büyük kelimeyi bul"). Tamamlanan her görev takıma ve tamamlayana hedefin %12'si kadar ödül puanı verir. Hedef %10 yüksek |
| ⏳ Kum Saati | 4. seviyeden | Sürenin %45'iyle başlar; her kelime süre ekler (2 sn + uzunluğa göre, büyük kelime 6 sn, bonus 1 sn). Süre başlangıçtaki tam süreyi aşamaz. Hedef %10 düşük, puan ×1.2 |
| 🔗 Zincir Turu | 4. seviyeden | Son bulunan kelimenin (tahta ya da bonus) son harfiyle başlayan kelime ×2 puan. Sıradaki harf ve zincir uzunluğu şeritte görünür. Hedef %15 yüksek |
| 🌪️ Fırtına | 5. seviyeden | Harfler 3,5 saniyede bir, yazarken bile karışır. Hedef %5 düşük, puan ×1.25 |
| 📏 Uzun Kelime Turu | 6. seviyeden | En az harf sayısı bir fazla (kısa kelimeler yok), süre ×1.05, puan ×1.3 |
| 🎲 Zar Turu | 7. seviyeden | Taş çarpanları 15 saniyede bir yeniden atılır (iki taşa ×2/×3); bulunmamış kelimelerin değeri değişir. Puan ×1.1 |

Altın ve patron dışındaki seviyeler 3–5. seviyelerde %40, sonrasında %50 olasılıkla özel türdür; tür, o seviyede açık olanlar arasından rastgele seçilir ve aynı özel tür art arda gelmez.
| 💰 Altın Tur | Her 5. seviye | Bütün puanlar ×2 |
| 👑 Patron Seviyesi | Her 10. seviye | Bir harf fazla, süre ×1.2, hedef %12 yüksek, puan ×1.5. Geçilirse +1 can (can sayısı sınırına kadar) |

Çarpanlar birbiriyle çarpılır: örneğin Zor + Patron = puan ×1.875. Süre 5 saniyeye yuvarlanır.

## Ses ve efektler

Sesler ve müzik Web Audio ile tarayıcıda sentezlenir, ses dosyası yoktur. Efektler hafif bir oda yankısından geçer.

- **Müzik:** Lobide sakin, oyunda tempolu bir akor yürüyüşü + arpej çalar. Son 20 saniyede tempo artar, davul girer ve akorlar gerilimli hâle geçer. Sonuç ekranında yumuşar. 🎵 düğmesiyle (oyunda üst barda, lobide sağ üstte) kapatılır, ☰ menüsünden müzik ve efekt düzeyi ayrı ayarlanır.
- **Efektler:** Bulunan kelimenin puanı tahtadan takım puanına uçar, sayaç oraya doğru sayar. Kazandığın puana göre "para" şıngırtısı çalar. Büyük kelimede konfeti ve duyuru, hazine kelimede altın konfeti ve süre halkasına uçan "+8 sn", patrona her vuruşta sarsıntı ve hasar sayısı vardır. Seri büyüdükçe ünvan değişir (SERİ → HARİKA → SÜPER → MUHTEŞEM → EFSANE). Son 10 saniyede geri sayım sesi, kırmızı kenar nabzı ve kırmızıya dönen harf paneli vardır. Seviyeler arasında büyük 3-2-1 sayacı gösterilir. Seviye geçişinde konfeti yağmuru, oyun sonunda podyum ve kişisel özet gösterilir.
- Duyurular sırayla gösterilir, üst üste binmez. Sistem "hareketi azalt" ayarındaysa animasyonlar kısılır.

Oda sahibi lobide zorluğu, taban süreyi ve can sayısını ayarlar. Oyun sırasında ☰ menüsünden seviyeyi erken bitirebilir ya da lobiye dönebilir. Oda sahibi çıkarsa sahiplik bağlı olan başka birine geçer. Sayfayı yenileyen oyuncu puanını kaybetmeden aynı odaya döner.

## Sözlük

`data/sozluk.json` iki listeden oluşur:

- `tum`: kabul edilen tüm kelimeler (~46.800). TDK tabanlı [turkish-word-list](https://github.com/mertemin/turkish-word-list) listesinden, tek kelimelik girdiler.
- `yaygin`: tahtaya çıkan kelimeler (~8.500). TDK kelimeleriyle [FrequencyWords](https://github.com/hermitdave/FrequencyWords) Türkçe sıklık listesinin kesişimi. Değer, kelimenin sıklığıdır.

Çekimli hâller (ör. "kalemler") sözlükte yoktur, kök/madde başı kelimeler geçerlidir. Bir kelimeyi tahtadan çıkarmak için `yaygin` içinden silmen yeterli. Sadece bonus olarak kabul edilmesini istiyorsan `tum` içinde bırak.

## Dosyalar

```
server.js        Express + Socket.io sunucusu, odalar, seviye akışı, puanlama
game.js          Sözlük, seviye üretimi, tahmin kontrolü
public/          Arayüz (index.html, style.css, client.js, ses.js, efekt.js)
data/sozluk.json    Türkçe kelime listesi
data/sozluk-en.json İngilizce kelime listesi (araclar/ingilizce-sozluk.js ile üretilir)
```

İngilizce sözlüğü yeniden üretmek için: ENABLE listesi (kamu malı, github.com/dolph/dictionary),
OpenSubtitles sıklık listesi `en_50k.txt` (github.com/hermitdave/FrequencyWords) ve tahtaya çıkmaması
gereken kelimeler listesi (github.com/LDNOOBW) indirilip `node araclar/ingilizce-sozluk.js <enable1.txt> <en_50k.txt> <kotu-kelimeler.txt>` çalıştırılır.

Test için belirli bir seviyeden başlatma: `BASLANGIC_SEVIYE=10 npm start`.
