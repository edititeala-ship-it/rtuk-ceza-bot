// Akış (her koşu):
//  1. state.json oku
//  2. Yaptırım kararları: listenin ilk PAGES sayfası, yeni olanları eskiden yeniye at
//  3. Mahkeme yayın yasakları: listenin ilk YASAK_PAGES sayfası, yeni olanları eskiden yeniye at
//  4. Ay başında: geçen ayın yayın yasağı sayısını tek gönderiyle duyur
//  5. state.json güncelle (Actions bunu commit eder)
//
// Koşu başına toplam gönderi sınırı (MAX_POSTS_PER_RUN) üç akış için ortaktır; kalanlar
// sonraki koşuya sarkar. Kayıtlar artan numarayla DEĞİL, id ile tutulur. "Yeni bir şey yok"
// hata değildir; 0 ile çıkılır. Sayfa yapısı bozulması kazıyıcılarda ayrıca yakalanır.

import fs from "node:fs";
import { fetchKararList, fetchKararDetay, isYaptirim, toplantiSira } from "./rtuk.js";
import { formatKarar } from "./format.js";
import { fetchYasakList, fetchYasakDetay, formatYasak, formatAylikOzet, ayYasakSayisi, ayAdi } from "./yasak.js";
import { post } from "./x.js";

const STATE_FILE = process.env.STATE_FILE || "state.json";
const PAGES = Number(process.env.PAGES || 4);
const YASAK_PAGES = Number(process.env.YASAK_PAGES || 2);
const MAX_POSTS_PER_RUN = Number(process.env.MAX_POSTS_PER_RUN || 3);
const GAP_MS = Number(process.env.POST_GAP_SECONDS || 180) * 1000;
const BACKFILL = process.env.BACKFILL === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadState() {
  const s = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
  s.posted ??= {};   // yaptırım: id -> { tweetId, at, toplantiNo, kararNo, kanal }
  s.baseline ??= {}; // yaptırım: ilk kurulumda atlananlar
  s.yasak ??= {};
  s.yasak.posted ??= {};   // yasak id -> { tweetId, at, mahkeme, kararTarihi }
  s.yasak.baseline ??= {}; // ilk kurulumda atlananlar
  s.yasak.aylik ??= {};    // "2026-09" -> { n, tweetId, at }
  return s;
}
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");

// Ortak gönderi bütçesi
const budget = { used: 0 };
const kaldi = () => MAX_POSTS_PER_RUN - budget.used;

async function gonder(text, kaydet) {
  if (budget.used > 0) await sleep(GAP_MS); // gönderiler arası aralık; son gönderiden sonra boşuna beklenmez
  const tweetId = await post(text);
  kaydet(tweetId);
  budget.used++;
}

// ---------- 1. Yaptırım kararları ----------
async function yaptirimlar(state) {
  const list = await fetchKararList(PAGES);
  const y = list.filter((k) => isYaptirim(k.konu));
  console.log(`[yaptırım] ${PAGES} sayfada ${list.length} karar, ${y.length} yaptırım. En yeni toplantı: ${list[0]?.toplantiNo} (${list[0]?.toplantiTarihi}).`);

  const bos = !Object.keys(state.posted).length && !Object.keys(state.baseline).length;
  if (bos && !BACKFILL) {
    for (const k of y) state.baseline[k.id] = { at: new Date().toISOString(), toplantiNo: k.toplantiNo, kararNo: k.kararNo };
    saveState(state);
    console.log(`[yaptırım] İlk çalıştırma: ${y.length} karar başlangıç noktası olarak işaretlendi, gönderi atılmadı.`);
    return;
  }

  const pending = y.filter((k) => !state.posted[k.id] && !state.baseline[k.id]).sort((a, b) => toplantiSira(a) - toplantiSira(b));
  console.log(`[yaptırım] Yeni: ${pending.map((k) => `${k.toplantiNo}#${k.kararNo}`).join(", ") || "yok"}`);

  for (const k of pending) {
    if (kaldi() <= 0) { console.log(`[yaptırım] Koşu sınırı (${MAX_POSTS_PER_RUN}) doldu; kalanlar sonraki koşuda.`); return; }
    const d = await fetchKararDetay(k);
    if (!d.kanal && !d.kurulus) {
      console.warn(`UYARI ${k.id} (${k.toplantiNo}#${k.kararNo}): kanal çözülemedi, bu koşuda atlandı. Başlık: ${k.konu}`);
      continue;
    }
    const { text, ilkeDustu } = formatKarar(d);
    if (ilkeDustu) console.warn(`Not ${k.id}: 280 sınırı için ilke alıntısı düşürüldü.`);
    await gonder(text, (tweetId) => {
      state.posted[k.id] = { tweetId, at: new Date().toISOString(), toplantiNo: d.toplantiNo, kararNo: d.kararNo, kanal: d.kanal, kanalKaynak: d.kanalKaynak };
      saveState(state);
      console.log(`[yaptırım] Atıldı: ${k.id} ${d.toplantiNo}#${d.kararNo} ${d.kanal} → ${tweetId}`);
    });
  }
}

// ---------- 2. Mahkeme yayın yasakları ----------
async function yasaklar(state) {
  const list = await fetchYasakList(YASAK_PAGES);
  console.log(`[yasak] ${YASAK_PAGES} sayfada ${list.length} karar. En yeni: ${list[0]?.baslik} (${list[0]?.duyuruTarihi}).`);

  const s = state.yasak;
  const bos = !Object.keys(s.posted).length && !Object.keys(s.baseline).length;
  if (bos && !BACKFILL) {
    for (const k of list) s.baseline[k.id] = { at: new Date().toISOString(), duyuruTarihi: k.duyuruTarihi };
    saveState(state);
    console.log(`[yasak] İlk çalıştırma: ${list.length} karar başlangıç noktası olarak işaretlendi, gönderi atılmadı.`);
    return;
  }

  const pending = list.filter((k) => !s.posted[k.id] && !s.baseline[k.id]).sort((a, b) => Number(a.id) - Number(b.id));
  console.log(`[yasak] Yeni: ${pending.map((k) => k.id).join(", ") || "yok"}`);

  for (const k of pending) {
    if (kaldi() <= 0) { console.log(`[yasak] Koşu sınırı (${MAX_POSTS_PER_RUN}) doldu; kalanlar sonraki koşuda.`); return; }
    const d = await fetchYasakDetay(k);
    if (!d.mahkeme) {
      console.warn(`UYARI yasak ${k.id}: mahkeme çözülemedi, bu koşuda atlandı. Başlık: ${k.baslik}`);
      continue;
    }
    await gonder(formatYasak(d), (tweetId) => {
      s.posted[k.id] = { tweetId, at: new Date().toISOString(), mahkeme: d.mahkeme, kararTarihi: d.kararTarihi, duyuruTarihi: d.duyuruTarihi };
      saveState(state);
      console.log(`[yasak] Atıldı: ${k.id} ${d.mahkeme} ${d.kararTarihi} → ${tweetId}`);
    });
  }
}

// ---------- 3. Aylık yasak sayısı ----------
// Geçen ay (Türkiye saati) için bir kez. Sayı listeden sayılır; sayfalar yetmezse uyarı, sonraki koşuda yeniden.
async function aylikOzet(state) {
  const tr = new Date(Date.now() + 3 * 3600 * 1000);
  const once = new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth() - 1, 1));
  const ym = `${once.getUTCFullYear()}-${String(once.getUTCMonth() + 1).padStart(2, "0")}`;
  if (state.yasak.aylik[ym]) return;
  if (kaldi() <= 0) { console.log(`[aylık] ${ayAdi(ym)} özeti için bütçe kalmadı; sonraki koşuda.`); return; }
  const n = await ayYasakSayisi(ym);
  if (n === null) { console.warn(`[aylık] ${ayAdi(ym)} sayısı için sayfalar yetmedi; sonraki koşuda yeniden denenir.`); return; }
  if (n === 0) { state.yasak.aylik[ym] = { n: 0, at: new Date().toISOString() }; saveState(state); console.log(`[aylık] ${ayAdi(ym)}: 0 yasak, gönderi yok.`); return; }
  await gonder(formatAylikOzet(ym, n), (tweetId) => {
    state.yasak.aylik[ym] = { n, tweetId, at: new Date().toISOString() };
    saveState(state);
    console.log(`[aylık] Atıldı: ${ayAdi(ym)} ${n} yasak → ${tweetId}`);
  });
}

async function main() {
  const state = loadState();
  await yaptirimlar(state);
  await yasaklar(state);
  await aylikOzet(state);
  console.log(`Bitti. Bu koşuda ${budget.used} gönderi.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
