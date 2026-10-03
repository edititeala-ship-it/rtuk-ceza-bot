// Akış:
//  1. state.json oku (hangi karar id'leri atıldı / başlangıçta atlandı)
//  2. Listenin ilk PAGES sayfasını çek, yaptırım kararlarını başlıktan ayır
//  3. Daha önce görülmemişleri eskiden yeniye sırala
//  4. Her biri için detay sayfasını oku (sabit alanlar), formatla, aralıklı at
//  5. state.json güncelle (Actions bunu commit eder)
//
// Kayıtlar artan numarayla DEĞİL, karar id'siyle tutulur. Liste toplantıya göre sıralı
// ve geç yayımlanan yaptırımlar listenin ortasına girer; id kümesi bunu sorunsuz yakalar.
// "Yeni yaptırım yok" hata değildir; 0 ile çıkılır. Sayfa yapısı bozulması rtuk.js'te ayrıca yakalanır.

import fs from "node:fs";
import { fetchKararList, fetchKararDetay, isYaptirim, toplantiSira } from "./rtuk.js";
import { formatKarar } from "./format.js";
import { post } from "./x.js";

const STATE_FILE = process.env.STATE_FILE || "state.json";
const PAGES = Number(process.env.PAGES || 4);
const MAX_POSTS_PER_RUN = Number(process.env.MAX_POSTS_PER_RUN || 3);
const GAP_MS = Number(process.env.POST_GAP_SECONDS || 180) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadState() {
  const s = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
  s.posted ??= {};   // id -> { tweetId, at, toplantiNo, kararNo, kanal }
  s.baseline ??= {}; // id -> { at, toplantiNo, kararNo }  (ilk kurulumda atlananlar)
  return s;
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
}

async function main() {
  const state = loadState();
  const list = await fetchKararList(PAGES);
  const yaptirimlar = list.filter((k) => isYaptirim(k.konu));
  console.log(`${PAGES} sayfada ${list.length} karar, ${yaptirimlar.length} yaptırım. En yeni toplantı: ${list[0]?.toplantiNo} (${list[0]?.toplantiTarihi}).`);

  // İlk kurulum: geçmişi doldurmamak için görünen yaptırımların hepsi başlangıç noktası sayılır.
  const bos = !Object.keys(state.posted).length && !Object.keys(state.baseline).length;
  if (bos && process.env.BACKFILL !== "1") {
    for (const k of yaptirimlar) state.baseline[k.id] = { at: new Date().toISOString(), toplantiNo: k.toplantiNo, kararNo: k.kararNo };
    saveState(state);
    console.log(`İlk çalıştırma: ${yaptirimlar.length} yaptırım kararı başlangıç noktası olarak işaretlendi, gönderi atılmadı.`);
    return;
  }

  const pending = yaptirimlar
    .filter((k) => !state.posted[k.id] && !state.baseline[k.id])
    .sort((a, b) => toplantiSira(a) - toplantiSira(b));
  console.log(`Yeni yaptırım: ${pending.map((k) => `${k.toplantiNo}#${k.kararNo}`).join(", ") || "yok"}`);
  if (!pending.length) return;

  let postedNow = 0;
  for (const k of pending) {
    if (postedNow >= MAX_POSTS_PER_RUN) {
      console.log(`Bu koşuda sınır (${MAX_POSTS_PER_RUN}) doldu; kalanlar sonraki koşuda.`);
      break;
    }
    const d = await fetchKararDetay(k);
    if (!d.kanal && !d.kurulus) {
      // Kalıp dışı başlık: işaretlemeyiz, uyarı yazarız; sonraki koşuda yeniden denenir.
      console.warn(`UYARI ${k.id} (${k.toplantiNo}#${k.kararNo}): kanal çözülemedi, bu koşuda atlandı. Başlık: ${k.konu}`);
      continue;
    }
    const { text, ilkeDustu } = formatKarar(d);
    if (ilkeDustu) console.warn(`Not ${k.id}: 280 sınırı için ilke alıntısı düşürüldü.`);
    try {
      const tweetId = await post(text);
      state.posted[k.id] = { tweetId, at: new Date().toISOString(), toplantiNo: d.toplantiNo, kararNo: d.kararNo, kanal: d.kanal };
      saveState(state);
      postedNow++;
      console.log(`Atıldı: ${k.id} ${d.toplantiNo}#${d.kararNo} ${d.kanal} → ${tweetId}`);
    } catch (err) {
      console.error(`HATA ${k.id}:`, err?.data || err?.message || err);
      saveState(state);
      throw err; // Actions kırmızı olsun, log görülsün
    }
    if (postedNow < MAX_POSTS_PER_RUN) await sleep(GAP_MS);
  }
  console.log(`Bitti. Bu koşuda ${postedNow} gönderi.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
