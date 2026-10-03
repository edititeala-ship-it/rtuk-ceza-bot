// Test aracı: hiçbir şey atmaz, ne çıkardığımızı gösterir.
//   node src/peek.js              ilk PAGES sayfadaki yaptırımları listeler, ilk 5'ini formatlar
//   node src/peek.js --all        hepsini formatlar
//   node src/peek.js 20767 20758  belirli karar id'leri
import { fetchKararList, fetchKararDetay, isYaptirim, BASE } from "./rtuk.js";
import { formatKarar } from "./format.js";

const args = process.argv.slice(2);
const ids = args.filter((a) => /^\d+$/.test(a));
const all = args.includes("--all");
const PAGES = Number(process.env.PAGES || 4);

let items;
if (ids.length) {
  items = ids.map((id) => ({ id, url: `${BASE}/UstKurulKarar/Detay/${id}` }));
} else {
  const list = await fetchKararList(PAGES);
  const y = list.filter((k) => isYaptirim(k.konu));
  console.log(`${PAGES} sayfada ${list.length} karar, ${y.length} yaptırım.\n`);
  for (const k of y) console.log(`${k.id}  ${k.toplantiNo}#${String(k.kararNo).padEnd(3)} ${k.konu.slice(0, 120)}`);
  console.log();
  items = all ? y : y.slice(0, 5);
}

for (const it of items) {
  const d = await fetchKararDetay(it);
  const { text, ilkeDustu } = formatKarar(d);
  console.log("=".repeat(70));
  console.log(`${d.id}  ${d.toplantiNo}#${d.kararNo}  ${d.url || ""}`);
  console.log(`alanlar: kanal=${JSON.stringify(d.kanal)} kurulus=${JSON.stringify(d.kurulus)} madde=${JSON.stringify(d.madde)} oran=${d.oran} tutar=${d.tutar}`);
  console.log(`         program=${JSON.stringify(d.program)} tarih=${JSON.stringify(d.yayinTarihi)} saat=${JSON.stringify(d.yayinSaati)} ilke=${d.ilke ? d.ilke.length + " kr" : null}`);
  console.log("-".repeat(70));
  console.log(text);
  console.log(`[${[...text].length} karakter${ilkeDustu ? ", ilke düşürüldü" : ""}]`);
}
