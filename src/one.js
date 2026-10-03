// Tek bir kararı atar: node src/one.js <kararId>
// Kurulum testi ve elle tetikleme için. Atılan karar state.posted'a yazılır,
// baseline'daysa oradan çıkarılır; normal koşular onu bir daha ele almaz.
import fs from "node:fs";
import { fetchKararDetay, BASE } from "./rtuk.js";
import { formatKarar } from "./format.js";
import { post } from "./x.js";

const STATE_FILE = process.env.STATE_FILE || "state.json";
const id = process.argv[2];
if (!/^\d+$/.test(id || "")) {
  console.error("Kullanım: node src/one.js <kararId>");
  process.exit(2);
}

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
state.posted ??= {};
state.baseline ??= {};
if (state.posted[id]) {
  console.log(`${id} zaten atılmış (${state.posted[id].tweetId}), bir şey yapılmadı.`);
  process.exit(0);
}

const d = await fetchKararDetay({ id, url: `${BASE}/UstKurulKarar/Detay/${id}` });
if (!d.turler.length) throw new Error(`${id} bir yaptırım kararı değil: ${d.konu}`);
if (!d.kanal && !d.kurulus) throw new Error(`${id}: kanal çözülemedi. Başlık: ${d.konu}`);

const { text, ilkeDustu } = formatKarar(d);
if (ilkeDustu) console.warn("Not: 280 sınırı için ilke alıntısı düşürüldü.");
console.log(text + `\n[${[...text].length} karakter]`);

const tweetId = await post(text);
state.posted[id] = { tweetId, at: new Date().toISOString(), toplantiNo: d.toplantiNo, kararNo: d.kararNo, kanal: d.kanal, note: "elle (one.js)" };
delete state.baseline[id];
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
console.log(`Atıldı: ${id} ${d.toplantiNo}#${d.kararNo} ${d.kanal} → ${tweetId}`);
