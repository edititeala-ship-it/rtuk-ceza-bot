// RTÜK "Mahkeme Yayın Yasakları" kaynağı.
// Liste:  https://www.rtuk.gov.tr/mahkeme-yayin-yasaklari?page=N   (tarihe göre yeniden eskiye)
// Detay:  https://www.rtuk.gov.tr/Yasak/YasakDetay/<id>
//   "İstanbul 8. Aile Mahkemesinin 28.09.2026 tarihli ve 2025/450 E. sayılı kararı ile
//    yayın yasağı getirilmiştir. (29.09.2026-13:47)"
//
// Yalnızca üç sabit alan alınır: mahkeme, karar tarihi, karar sayısı. Yasağın konusu
// sitede herkese açık değil ve zaten alınmaz; yasağın konusunu anlatmak ihlaldir,
// kararın varlığını duyurmak değildir (RTÜK bunu "tüm kuruluşlara duyurur").

import * as cheerio from "cheerio";
import { BASE, normDate } from "./rtuk.js";
import { getHtml } from "./http.js";

export const YASAK_LIST_URL = `${BASE}/mahkeme-yayin-yasaklari`;
const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();

// [{ id, url, baslik, duyuruTarihi }] — sayfadaki sırayla (yeniden eskiye)
export function parseYasakList(html) {
  const $ = cheerio.load(html);
  if (!$("ul.pagination").length || !$("h5:contains('Yayın Yasakları')").length) {
    throw new Error("Mahkeme Yayın Yasakları sayfasının yapısı değişmiş");
  }
  const items = [];
  $("h3.list-heading a[href*='/Yasak/YasakDetay/']").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/YasakDetay\/(\d+)/);
    if (!m) return;
    const tarih = squash($(a).closest("li").find("time").text());
    items.push({
      id: m[1],
      url: href.startsWith("http") ? href : BASE + href,
      baslik: squash($(a).text()),
      duyuruTarihi: /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(tarih) ? normDate(tarih) : null,
    });
  });
  const seen = new Set();
  return items.filter((it) => !seen.has(it.id) && seen.add(it.id));
}

export async function fetchYasakList(pages = 2) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    out.push(...parseYasakList(await getHtml(p === 1 ? YASAK_LIST_URL : `${YASAK_LIST_URL}?page=${p}`)));
  }
  const seen = new Set();
  return out.filter((it) => !seen.has(it.id) && seen.add(it.id));
}

// Sabit cümle: "<MAHKEME>nin <TARİH> tarihli ve <SAYI> sayılı kararı ile yayın yasağı getirilmiştir."
const KARAR_RE = /^(.{5,120}?)(?:['’]?n[iıuü]n)\s+(\d{1,2}\.\d{1,2}\.\d{4})\s+tarihli\s+(?:ve\s+)?(.{3,40}?)\s+sayılı\s+karar/i;

export function parseYasakDetay(html, item = {}) {
  const $ = cheerio.load(html);
  const art = $("article#content");
  const baslik = squash(art.find("h3").first().text()) || item.baslik || "";
  const p = squash(art.find("p").filter((_, e) => /yayın yasağı/i.test($(e).text())).first().text());
  const m = p.match(KARAR_RE);
  // Mahkeme adı başlıktan da çıkar: "T.C. İstanbul 8. Aile Mahkemesinin Yayın Yasağı Kararı"
  const b = baslik.match(/^(?:T\.?C\.?\s+)?(.+?)(?:['’]?n[iıuü]n)\s+Yayın Yasağı/i);
  return {
    id: item.id || null,
    url: item.url || null,
    baslik,
    mahkeme: (m ? m[1] : b ? b[1] : null)?.replace(/^T\.?C\.?\s+/i, "").replace(/Hakimli/g, "Hâkimli") || null,
    kararTarihi: m ? normDate(m[2]) : null,
    kararSayisi: m ? m[3] : null,
    duyuruTarihi: item.duyuruTarihi || null,
  };
}

export async function fetchYasakDetay(item) {
  return parseYasakDetay(await getHtml(item.url), item);
}

export const YASAK_ONEK = process.env.YASAK_PREFIX ?? "⛔ ";

//   ⛔ Yayın yasağı
//
//   Turgutlu Sulh Ceza Hâkimliği
//   22.09.2026 · 2026/4943 D. İş
//
//   Kaynak: RTÜK
export function formatYasak(y) {
  const satir2 = [y.kararTarihi, y.kararSayisi].filter(Boolean).join(" · ");
  return [
    `${YASAK_ONEK}Yayın yasağı`,
    "",
    y.mahkeme,
    satir2 || null,
    "",
    `Kaynak: RTÜK`,
  ].filter((l) => l !== null).join("\n");
}

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// "2026-09" -> "Eylül 2026"
export function ayAdi(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${AYLAR[m - 1]} ${y}`;
}

// Listeden bir ayın duyurulan yasak sayısı. Liste yeniden eskiye sıralı olduğundan
// o aydan eski bir kayıt görülünce sayfalar yeterli demektir; yoksa sayfa eksik (null döner).
export async function ayYasakSayisi(ym, maxPages = 6) {
  let count = 0;
  for (let p = 1; p <= maxPages; p++) {
    const items = parseYasakList(await getHtml(p === 1 ? YASAK_LIST_URL : `${YASAK_LIST_URL}?page=${p}`));
    if (!items.length) return null;
    for (const it of items) {
      const k = aySlug(it.duyuruTarihi);
      if (!k) continue;
      if (k === ym) count++;
      else if (k < ym) return count; // daha eski aya geçildi
    }
  }
  return null;
}

// "22.09.2026" -> "2026-09"
export function aySlug(ddmmyyyy) {
  const m = (ddmmyyyy || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}` : null;
}

//   ⛔ Eylül 2026: RTÜK 14 yayın yasağı kararı duyurdu.
//
//   Kaynak: RTÜK
export function formatAylikOzet(ym, n) {
  return [`${YASAK_ONEK}${ayAdi(ym)}: RTÜK ${n} yayın yasağı kararı duyurdu.`, "", "Kaynak: RTÜK"].join("\n");
}
