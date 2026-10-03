# rtuk-yaptirim-bot

RTÜK Üst Kurulu'nun yaptırım kararlarını (idari para cezası, uyarı, program/yayın durdurma,
lisans iptali) X'te paylaşan bot. [meclis-bot](../meclis/meclis-bot) ile aynı mimari:
Node 20, ESM, cheerio + twitter-api-v2, GitHub Actions cron, state.json repoda.

## Kaynak

- Liste: `https://www.rtuk.gov.tr/ust-kurul-kararlari?page=N` — sunucuda render, 30 karar/sayfa,
  toplantı numarasına göre yeniden eskiye sıralı.
- Detay: `https://www.rtuk.gov.tr/UstKurulKarar/Detay/<id>`

Sitede toplantı başına yalnızca bir kısım karar yayımlanıyor (lisans/logo/çağrı işareti ve
yaptırımlar). Yaptırım kararları toplantıdan haftalar sonra, küçük gruplar halinde çıkıyor ve
listenin **ortasına** giriyor (liste toplantıya göre sıralı). 2024/29–2026/35 arası 450 karardan
178'i yaptırım, yani haftada ~1,5–2 gönderi.

## Kapsam ve kurallar

- Yalnızca yaptırım kararları. Başlıkta hem gerekçe ("... ihlali nedeniyle") hem tür
  ("uyarınca İPC / UYARI / Yayın Durdurma / ...") olan kararlar alınır. Lisans/logo kararları alınmaz.
- **Serbest metin asla çekilmez.** Karar metinleri cezaya konu yayının içeriğini aktarıyor
  (bazıları yayın yasağı ihlali). Bot yalnızca sabit kalıplı alanları alır:
  toplantı/karar no, kanal ve kuruluş (başlık parantezi), madde (başlık), ilke metni
  (hüküm bölümündeki kanun alıntısı, tırnak içi), yayın tarihi/saati (sadece rakam), program adı
  (ilk paragrafta tırnak içi, 120 karakter sınırı), ceza oranı ve tutarı.
- Yorum, sıfat, etiket yok. **Link yok** (X API'de linkli gönderi $0.20, linksiz $0.015).
- Kanal adı RTÜK başlığındaki logo adıyla aynen yazılır ("h halk", "NOW", "SZC"); düzeltilmez.

## Gönderi biçimi

```
RTÜK idari para cezası

h halk — 245.386 TL

Yayın: "Ana Haber Bülteni", 19.06.2026, 18:00

İhlal: 6112 sayılı Kanun m. 8/1-c
"Hukukun üstünlüğü, adalet ve tarafsızlık esasına aykırı olamaz"

Üst Kurul toplantısı 2026/24 · 25.06.2026
Kaynak: RTÜK
```

280 karakteri aşarsa önce ilke alıntısı düşer (madde atfı kalır), sonra program adı kısaltılır.
Uzun ilke metinleri (8/1-ı, 8/2, 4207 s.K.) çoğunlukla sığmaz. X Premium alınırsa
`POST_LIMIT=4000` ile hepsi sığar.

Tutarsız yaptırımlarda (uyarı, durdurma) ikinci satır yalnızca kanal adıdır; başlık
"RTÜK uyarı kararı", "RTÜK yayın durdurma kararı" vb. olur. Başlıkta "ihlali" geçmeyen
kararlarda (örn. durdurma kararının uygulanmaması) madde "Dayanak:" diye verilir.

## İkinci akış: RTÜK'ün duyurduğu yayın yasakları

Kaynak: `https://www.rtuk.gov.tr/basin-aciklamalari-4944`, detay `/kamuoyuna-duyuru/<id>`
(`src/duyuru.js`). RTÜK büyük olaylarda yasağı "Kamuoyuna Duyuru" ile ilan eder ve konuyu
kendisi yazar. Bot yalnızca "... yayın yasağı getirilmiştir/kararı verilmiştir." cümlesini
içeren açıklamaları alır; cümleyi aynen alıntılar, mahkeme/tarih/sayıyı cümleden sabit kalıpla
çözer. Yasak içermeyen açıklamalar (uyarı, görüş) `duyuru.gecilen`e yazılır, bir daha bakılmaz.

```
⛔ Yayın yasağı

RTÜK: "Manisa ili Turgutlu ilçesinde 22 Eylül 2026 tarihinde meydana gelen silahlı saldırıya
ilişkin olarak yürütülen adli soruşturma kapsamında, Turgutlu Sulh Ceza Hâkimliğinin 22.09.2026
tarihli ve 2026/4943 D. İş sayılı kararıyla yayın yasağı getirilmiştir."

Turgutlu Sulh Ceza Hâkimliği · 22.09.2026 · 2026/4943 D. İş
RTÜK duyurusu: 22.09.2026
Kaynak: RTÜK
```

Bu gönderiler 280'i aşar; hesap Premium olduğu için workflow'da `POST_LIMIT=4000`. Premium
biterse 280'e çekilir, alıntı "…" ile kısalır.

Mahkeme yayın yasakları listesindeki (`/mahkeme-yayin-yasaklari`) tekil kararlar otomatik
atılmaz (konu olmadığı için kuru kalıyor); `src/yasak.js` yalnızca aylık sayı ve elle atım için
kalır. Ay başında geçen ayın sayısı tek gönderiyle: `⛔ Eylül 2026: RTÜK 14 yayın yasağı kararı
duyurdu.` Sayı listeden sayılır (o aydan eski ilk kayıt görülene kadar sayfalar okunur).

Gönderi bütçesi (`MAX_POSTS_PER_RUN`) yaptırım, yasak ve aylık özet için ortaktır.

## Durum (state.json)

- `posted`: karar id → tweet id. Mükerrer kontrolü bununla.
- `baseline`: ilk çalıştırmada görünen yaptırımlar; geçmiş doldurulmaz.

Artan numaraya göre filtreleme yok (TBMM dersi); kayıtlar karar id'siyle tutulur. Liste
yapısı bozulursa (form/sayfalama yok) ayrı hata atılır; "yeni yaptırım yok" hata değildir.

## Çalıştırma

```
npm install
node src/peek.js              # ilk 4 sayfadaki yaptırımları listeler, 5'ini formatlar; hiçbir şey atmaz
node src/peek.js 20767 20758  # belirli kararlar
node src/peek.js --all
DRY_RUN=1 node src/run.js     # ilk koşu: baseline yazar, gönderi atmaz
DRY_RUN=1 BACKFILL=1 node src/run.js   # baseline'ı atlayıp hepsini kuru çalıştırır
```

Ortam değişkenleri: `X_API_KEY X_API_SECRET X_ACCESS_TOKEN X_ACCESS_SECRET`,
`PAGES` (4), `MAX_POSTS_PER_RUN` (3), `POST_GAP_SECONDS` (180), `POST_LIMIT` (280),
`DRY_RUN`, `BACKFILL`, `STATE_FILE`.

## Actions

`.github/workflows/bot.yml`: günde bir (09:23 UTC), `workflow_dispatch` ile elle de tetiklenir.
Koşu başına en fazla 3 gönderi, aralarında 3 dk; kalanlar sonraki güne sarkar.
Secrets: dört X anahtarı.

## Kurulum sırası

1. Yeni X hesabı + developer app (Read and Write), dört anahtar.
2. Yeni GitHub repo, bu dosyalar, secrets.
3. İlk `workflow_dispatch` koşusu baseline yazar (gönderi yok). Sonraki koşular yeni yaptırımları atar.
