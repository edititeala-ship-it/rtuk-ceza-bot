// Tek bir kaydı atar (kurulum testi, elle tetikleme):
//   node src/one.js 20767          yaptırım kararı (Üst Kurul karar id)
//   node src/one.js yasak:1590     mahkeme yayın yasağı (yasak id)
//   node src/one.js aylik:2026-09  o ayın yayın yasağı sayısı
// Atılan kayıt state'e yazılır, baseline'daysa oradan çıkarılır.
import fs from "node:fs";
import { fetchKararDetay, BASE } from "./rtuk.js";
import { formatKarar } from "./format.js";
import { fetchYasakDetay, formatYasak, formatAylikOzet, ayYasakSayisi } from "./yasak.js";
import { fetchDuyuruDetay, formatDuyuru } from "./duyuru.js";
import { post } from "./x.js";

const STATE_FILE = process.env.STATE_FILE || "state.json";
const arg = process.argv[2] || "";
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
state.posted ??= {}; state.baseline ??= {};
state.yasak ??= {}; state.yasak.posted ??= {}; state.yasak.baseline ??= {}; state.yasak.aylik ??= {};
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
const say = (text) => console.log(text + `\n[${[...text].length} karakter]`);

if (/^\d+$/.test(arg)) {
  if (state.posted[arg]) { console.log(`${arg} zaten atılmış (${state.posted[arg].tweetId}).`); process.exit(0); }
  const d = await fetchKararDetay({ id: arg, url: `${BASE}/UstKurulKarar/Detay/${arg}` });
  if (!d.turler.length) throw new Error(`${arg} bir yaptırım kararı değil: ${d.konu}`);
  if (!d.kanal && !d.kurulus) throw new Error(`${arg}: kanal çözülemedi. Başlık: ${d.konu}`);
  const { text, ilkeDustu } = formatKarar(d);
  if (ilkeDustu) console.warn("Not: 280 sınırı için ilke alıntısı düşürüldü.");
  say(text);
  const tweetId = await post(text);
  state.posted[arg] = { tweetId, at: new Date().toISOString(), toplantiNo: d.toplantiNo, kararNo: d.kararNo, kanal: d.kanal, kanalKaynak: d.kanalKaynak, note: "elle (one.js)" };
  delete state.baseline[arg];
  save();
  console.log(`Atıldı: ${arg} ${d.toplantiNo}#${d.kararNo} ${d.kanal} → ${tweetId}`);
} else if (/^yasak:\d+$/.test(arg)) {
  const id = arg.slice(6);
  if (state.yasak.posted[id]) { console.log(`yasak ${id} zaten atılmış (${state.yasak.posted[id].tweetId}).`); process.exit(0); }
  const d = await fetchYasakDetay({ id, url: `${BASE}/Yasak/YasakDetay/${id}` });
  if (!d.mahkeme) throw new Error(`yasak ${id}: mahkeme çözülemedi. Başlık: ${d.baslik}`);
  const text = formatYasak(d);
  say(text);
  const tweetId = await post(text);
  state.yasak.posted[id] = { tweetId, at: new Date().toISOString(), mahkeme: d.mahkeme, kararTarihi: d.kararTarihi, note: "elle (one.js)" };
  delete state.yasak.baseline[id];
  save();
  console.log(`Atıldı: yasak ${id} ${d.mahkeme} → ${tweetId}`);
} else if (/^duyuru:\d+$/.test(arg)) {
  const id = arg.slice(7);
  state.duyuru ??= {}; state.duyuru.posted ??= {}; state.duyuru.baseline ??= {}; state.duyuru.gecilen ??= {};
  if (state.duyuru.posted[id]) { console.log(`duyuru ${id} zaten atılmış (${state.duyuru.posted[id].tweetId}).`); process.exit(0); }
  const d = await fetchDuyuruDetay({ id, url: `${BASE}/kamuoyuna-duyuru/${id}` });
  if (!d.yasak) throw new Error(`duyuru ${id} yayın yasağı duyurusu değil: ${d.baslik}`);
  const { text, kisaldi } = formatDuyuru(d);
  if (kisaldi) console.warn("Not: sınır için alıntı kısaltıldı.");
  say(text);
  const tweetId = await post(text);
  state.duyuru.posted[id] = { tweetId, at: new Date().toISOString(), tarih: d.tarih, mahkeme: d.mahkeme, kararTarihi: d.kararTarihi, kararSayisi: d.kararSayisi, note: "elle (one.js)" };
  delete state.duyuru.baseline[id];
  save();
  console.log(`Atıldı: duyuru ${id} ${d.mahkeme} → ${tweetId}`);
} else if (/^aylik:\d{4}-\d{2}$/.test(arg)) {
  const ym = arg.slice(6);
  if (state.yasak.aylik[ym]?.tweetId) { console.log(`${ym} özeti zaten atılmış (${state.yasak.aylik[ym].tweetId}).`); process.exit(0); }
  const n = await ayYasakSayisi(ym);
  if (n === null) throw new Error(`${ym}: sayfalar yetmedi`);
  const text = formatAylikOzet(ym, n);
  say(text);
  const tweetId = await post(text);
  state.yasak.aylik[ym] = { n, tweetId, at: new Date().toISOString(), note: "elle (one.js)" };
  save();
  console.log(`Atıldı: ${ym} ${n} yasak → ${tweetId}`);
} else {
  console.error("Kullanım: node src/one.js <kararId> | yasak:<id> | aylik:<YYYY-MM>");
  process.exit(2);
}
