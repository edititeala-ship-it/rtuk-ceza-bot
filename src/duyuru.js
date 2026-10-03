// RTÜK "Basın Açıklamaları" içindeki yayın yasağı duyuruları.
// Liste:  https://www.rtuk.gov.tr/basin-aciklamalari-4944   (tarihe göre yeniden eskiye)
// Detay:  https://www.rtuk.gov.tr/kamuoyuna-duyuru/<id>
//
// RTÜK büyük olaylarda yasağı ayrıca "Kamuoyuna Duyuru" ile ilan eder ve konuyu KENDİSİ yazar:
//   "Manisa ili Turgutlu ilçesinde 22 Eylül 2026 tarihinde meydana gelen silahlı saldırıya ilişkin
//    olarak yürütülen adli soruşturma kapsamında, Turgutlu Sulh Ceza Hâkimliğinin 22.09.2026
//    tarihli ve 2026/4943 D. İş sayılı kararıyla yayın yasağı getirilmiştir."
// Bot bu cümleyi aynen alıntılar (düzenleyici kurumun kamuya açık resmi açıklaması), tek kelime
// eklemez. Cümleden mahkeme / tarih / sayı da sabit kalıpla çözülür. Yasak içermeyen duyurular
// (uyarılar, görüşler) alınmaz.

import * as cheerio from "cheerio";
import { BASE, normDate } from "./rtuk.js";
import { YASAK_ONEK } from "./yasak.js";

export const DUYURU_LIST_URL = `${BASE}/basin-aciklamalari-4944`;
const UA = "rtuk-yaptirim-bot/0.1 (+https://github.com/edititeala-ship-it/rtuk-ceza-bot) resmi RTUK verisini aktarir";
const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();
const LIMIT = Number(process.env.POST_LIMIT || 280);

async function getHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.text();
}

// [{ id, url, baslik, tarih }] yeniden eskiye
export function parseDuyuruList(html) {
  const $ = cheerio.load(html);
  if (!$("h3.list-heading a").length || !$("ul.pagination").length) {
    throw new Error("Basın Açıklamaları sayfasının yapısı değişmiş");
  }
  const items = [];
  $("h3.list-heading a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/\/(\d+)\/?$/);
    if (!m) return;
    const tarih = squash($(a).closest("li").find("time").text());
    items.push({
      id: m[1],
      url: href.startsWith("http") ? href : BASE + href,
      baslik: squash($(a).text()),
      tarih: /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(tarih) ? normDate(tarih) : null,
    });
  });
  const seen = new Set();
  return items.filter((it) => !seen.has(it.id) && seen.add(it.id));
}

export async function fetchDuyuruList(pages = 1) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    out.push(...parseDuyuruList(await getHtml(p === 1 ? DUYURU_LIST_URL : `${DUYURU_LIST_URL}?page=${p}`)));
  }
  const seen = new Set();
  return out.filter((it) => !seen.has(it.id) && seen.add(it.id));
}

// Yasak cümlesi: "... yayın yasağı getirilmiştir." / "... yayın yasağı kararı verilmiştir."
const YASAK_CUMLE_RE = /^.*?yayın yasağı(?: kararı)? (?:getirilmiş|verilmiş)tir\./is;

// Cümleden mahkeme: "... Turgutlu Sulh Ceza Hâkimliğinin 22.09.2026 tarihli ve 2026/4943 D. İş sayılı kararı"
function mahkemeBilgisi(cumle) {
  const m = cumle.match(/(Hâkimliği|Hakimliği|Mahkemesi)(?:['’]?n[iıuü]n)\s+(?:(\d{1,2}[./]\d{1,2}[./]\d{4})\s+tarihli\s+(?:ve\s+)?)?(\d{4}\/\d+(?:\s+D\.\s*İş|\s+E\.)?)\s+sayılı/i);
  if (!m) return { mahkeme: null, kararTarihi: null, kararSayisi: null };
  // Mahkeme adı: eşleşmeden geriye doğru büyük harfle başlayan veya "2." gibi sıra belirten sözcükler
  const once = cumle.slice(0, m.index).split(/\s+/).filter(Boolean);
  const ad = [];
  for (let i = once.length - 1; i >= 0 && ad.length < 6; i--) {
    const w = once[i];
    if (/[,;:]$/.test(w)) break; // önceki cümle parçası bitti ("kapsamında, Turgutlu ...")
    if (/^(\d+\.|[A-ZÇĞİÖŞÜ][\wçğıöşüâîû.'’-]*)$/.test(w)) ad.unshift(w);
    else break;
  }
  return {
    mahkeme: (ad.join(" ") + " " + m[1]).replace(/Hakimliği/g, "Hâkimliği").trim() || null,
    kararTarihi: m[2] ? normDate(m[2].replace(/\//g, ".")) : null,
    kararSayisi: m[3].replace(/\s+/g, " "),
  };
}

export function parseDuyuruDetay(html, item = {}) {
  const $ = cheerio.load(html);
  const art = $("article");
  const baslik = squash(art.find("h5").first().text()) || item.baslik || "";
  const tarihEtiket = squash(art.find("label").text()).match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
  const paragraflar = art.find("#content div, #content p").map((_, e) => squash($(e).text())).get().filter(Boolean);
  const metin = paragraflar.length ? paragraflar : [squash(art.find("#content").text())];
  // Yasak cümlesini içeren ilk paragraf; cümle, yasak ifadesiyle biter (devamı alınmaz)
  let cumle = null;
  for (const p of metin) {
    const m = p.match(YASAK_CUMLE_RE);
    if (m) { cumle = squash(m[0]); break; }
  }
  const yasak = !!cumle;
  return {
    id: item.id || null,
    url: item.url || null,
    baslik,
    tarih: tarihEtiket ? normDate(tarihEtiket[1]) : item.tarih || null,
    yasak,
    cumle,
    ...(yasak ? mahkemeBilgisi(cumle) : { mahkeme: null, kararTarihi: null, kararSayisi: null }),
  };
}

export async function fetchDuyuruDetay(item) {
  return parseDuyuruDetay(await getHtml(item.url), item);
}

//   ⛔ Yayın yasağı
//
//   RTÜK: "Manisa ili Turgutlu ilçesinde ... yayın yasağı getirilmiştir."
//
//   Turgutlu Sulh Ceza Hâkimliği · 22.09.2026 · 2026/4943 D. İş
//   RTÜK duyurusu: 22.09.2026
//   Kaynak: RTÜK
export function formatDuyuru(d) {
  const build = (cumle) => {
    const kunye = [d.mahkeme, d.kararTarihi, d.kararSayisi].filter(Boolean).join(" · ");
    return [
      `${YASAK_ONEK}Yayın yasağı`,
      "",
      `RTÜK: "${cumle}"`,
      "",
      kunye || null,
      d.tarih ? `RTÜK duyurusu: ${d.tarih}` : null,
      "Kaynak: RTÜK",
    ].filter((l) => l !== null).join("\n");
  };
  let text = build(d.cumle);
  let kisaldi = false;
  if ([...text].length > LIMIT) {
    // Sığmazsa alıntı kısaltılır, "…" ile biter; künye kalır
    const fazla = [...text].length - LIMIT + 1;
    const c = [...d.cumle];
    text = build(c.slice(0, Math.max(40, c.length - fazla)).join("").trimEnd() + "…");
    kisaldi = true;
  }
  return { text, kisaldi };
}
