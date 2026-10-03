// RTÜK "Üst Kurul Kararları" kaynağı.
// Liste:  https://www.rtuk.gov.tr/ust-kurul-kararlari?page=N   (sunucuda render, GET, 30 karar/sayfa)
// Detay:  https://www.rtuk.gov.tr/UstKurulKarar/Detay/<id>
//
// Liste toplantı numarasına göre yeniden eskiye sıralı. Yaptırım kararları toplantıdan
// haftalar/aylar sonra yayımlanabiliyor ve listenin ORTASINA giriyor; bu yüzden sadece
// ilk sayfaya bakmak yetmez, ilk birkaç sayfa taranır ve işlenen kayıtlar id ile tutulur.
//
// TASARIM KURALI: karar metinleri cezaya konu yayının içeriğini uzun uzun aktarır
// (bazıları yayın yasağı ihlali). Buradan SERBEST METİN ASLA ÇEKİLMEZ. Yalnızca sabit
// kalıplı alanlar alınır: toplantı/karar no, kanal, kuruluş, madde, ilke metni (kanun
// alıntısı), yayın tarihi/saati, program adı (tırnak içi), ceza oranı ve tutarı.

import * as cheerio from "cheerio";
import { kanalAdi } from "./kanal.js";
import { getHtml } from "./http.js";

export const BASE = "https://www.rtuk.gov.tr";
export const LIST_URL = `${BASE}/ust-kurul-kararlari`;

// "25.6.2026" -> "25.06.2026"
export function normDate(s) {
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return s;
  return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[3]}`;
}

const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();

// ---------- LİSTE ----------

// [{ id, url, toplantiNo, toplantiTarihi, kararNo, konu }], sayfadaki sırayla
export function parseList(html) {
  const $ = cheerio.load(html);
  // Yapı kontrolü: arama formu ve sayfalama her zaman var. Yoksa sayfa değişmiş demektir;
  // bunu "liste boş" ile karıştırmamak için ayrı hata.
  if (!$("input[name='KararKonu']").length || !$("ul.pagination").length) {
    throw new Error("Üst Kurul Kararları sayfasının yapısı değişmiş: form/sayfalama bulunamadı");
  }
  const items = [];
  $("a[href*='/UstKurulKarar/Detay/']").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/Detay\/(\d+)/);
    if (!m) return;
    const box = $(a).closest("div.row[style*='border']");
    const head = squash(box.find(".kararlar-header-p-kirmizi").text());
    const tno = head.match(/Toplantı No\s*:\s*(\d{4}\/\d+)/);
    const ttar = head.match(/Toplantı Tarihi\s*:\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
    const kno = head.match(/Karar No\s*:\s*(\d+)/);
    items.push({
      id: m[1],
      url: href.startsWith("http") ? href : BASE + href,
      toplantiNo: tno ? tno[1] : null,
      toplantiTarihi: ttar ? normDate(ttar[1]) : null,
      kararNo: kno ? Number(kno[1]) : null,
      konu: squash($(a).text()),
    });
  });
  // Aynı karar sayfada iki kez görünebilir (ekran + yazdırma kopyası); id ile tekilleştir.
  const seen = new Set();
  return items.filter((it) => !seen.has(it.id) && seen.add(it.id));
}

export async function fetchKararList(pages = 3) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const url = p === 1 ? LIST_URL : `${LIST_URL}?page=${p}`;
    out.push(...parseList(await getHtml(url)));
  }
  const seen = new Set();
  return out.filter((it) => !seen.has(it.id) && seen.add(it.id));
}

// ---------- KARAR KONUSU (başlık) ----------

// Yaptırım türleri: başlıkta "... uyarınca <TÜR> (KANAL – KURULUŞ)" biçiminde geçer.
const TURLER = [
  { re: /İPC|İdari Para Cezası/i, etiket: "idari para cezası" },
  { re: /\bUYARI\b/i, etiket: "uyarı" },
  { re: /Program(?:ın)? Yayın(?:ın)?ı(?:nın)? Durdur|Program Durdur/i, etiket: "program yayını durdurma" },
  { re: /Lisans(?:ı|ının)? İptal/i, etiket: "yayın lisansı iptali" },
  { re: /Katalogdan Çıkar/i, etiket: "katalogdan çıkarma" },
  { re: /(?<!Program )Yayın(?:ın|ının)? Durdur/i, etiket: "yayın durdurma" },
];

export function yaptirimTurleri(konu) {
  // Tür, ilk "uyarınca"dan sonra gelir. Gerekçe kısmı ("Yayın durdurma kararının uygulanmaması
  // nedeniyle ...") tür sanılmasın diye yalnızca o parça taranır; kanal parantezi atılır.
  const i = konu.indexOf("uyarınca");
  const son = (i >= 0 ? konu.slice(i) : konu).replace(/\([^()]*\)?\s*[.,]?\s*$/, "");
  return TURLER.filter((t) => t.re.test(son)).map((t) => t.etiket);
}

// Yaptırım kararı mı? Lisans/logo/çağrı işareti kararları "... Talebi / Verilmesi / Yenilenmesi"
// biçimindedir, "nedeniyle" geçmez. Yaptırımda hem gerekçe ("... ihlali nedeniyle") hem tür var.
export function isYaptirim(konu) {
  return /nedeniyle/i.test(konu) && yaptirimTurleri(konu).length > 0;
}

const SIRA = {
  birinci: 1, ikinci: 2, üçüncü: 3, dördüncü: 4, beşinci: 5, altıncı: 6, yedinci: 7,
  sekizinci: 8, dokuzuncu: 9, onuncu: 10, onbirinci: 11, onikinci: 12, onüçüncü: 13,
  ondördüncü: 14, onbeşinci: 15, onaltıncı: 16, onyedinci: 17, onsekizinci: 18,
};
function siraNo(w) {
  if (!w) return null;
  const s = w.toLowerCase().replace(/\s+/g, "");
  if (SIRA[s]) return SIRA[s];
  const n = s.match(/^(\d+)/);
  return n ? Number(n[1]) : null;
}

// "6112 sayılı Kanun'un 8'inci maddesinin birinci fıkrasının (c) bendinin ihlali ..."
//   -> { kanun: "6112", madde: 8, fikra: 1, bentler: ["c"], kisa: "6112 sayılı Kanun m. 8/1-c" }
// Bent yoksa "m. 8/2". Birden çok bent: "m. 8/1-b, ç".
const MADDE_RE = /(\d{4,5}) sayılı Kanun[’'`]?un (\d+)[’']?\s*(?:inci|nci|uncu|üncü|ıncı|ncı|ncu|ncü|\.)?\s*maddesi(?:nin)?\s+([a-zçğıöşü]+|\d+[’']?\w*)\s+fıkrası(?:nın)?(\s+(?:\([a-zçğıöşü]\)(?:,?\s*|\s+ve\s+))+ben[dt](?:inin|lerinin))?/i;

export function parseMadde(konu) {
  const m = konu.match(MADDE_RE);
  if (!m) return null;
  const kanun = m[1], madde = Number(m[2]), fikra = siraNo(m[3]);
  const bentler = m[4] ? [...m[4].matchAll(/\(([a-zçğıöşü])\)/g)].map((x) => x[1]) : [];
  let kisa = `${kanun} sayılı Kanun m. ${madde}`;
  if (fikra) kisa += `/${fikra}`;
  if (bentler.length) kisa += `-${bentler.join(", ")}`;
  return { kanun, madde, fikra, bentler, kisa };
}

// Başlığın sonundaki parantez: "(h halk– HALK RADYO VE TELEVİZYON YAYINCILIK A.Ş.)"
//   -> { kanal: "h halk", kurulus: "HALK RADYO VE TELEVİZYON YAYINCILIK A.Ş." }
export function parseKanal(konu) {
  // Parantez bazen kapanmadan bitiyor: "... İPC (NOW – HUZUR RADYO TV A.Ş"
  const m = konu.match(/\(([^()]+)\)\s*[.,]?\s*$/) || konu.match(/\(([^()]*[–—-][^()]*)$/);
  if (!m) return { kanal: null, kurulus: null };
  const ic = squash(m[1]);
  // Ayraç en/em tire; yoksa boşluklu kısa tire (kanal adındaki "CNBC-e" gibi tireleri korur)
  const parts = /[–—]/.test(ic) ? ic.split(/\s*[–—]\s*/) : ic.split(/\s+-\s+/);
  if (parts.length < 2) return { kanal: ic, kurulus: null };
  return { kanal: parts[0].trim(), kurulus: parts.slice(1).join(" – ").trim() };
}

// ---------- DETAY ----------

function kararLines($) {
  const c = $("article#content div#content").first();
  if (!c.length) throw new Error("Karar detay sayfasının yapısı değişmiş: karar metni bulunamadı");
  const body = (c.html() || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");
  return cheerio
    .load(`<div>${body}</div>`)("div")
    .text()
    .split("\n")
    .map(squash)
    .filter(Boolean);
}

// Tırnak karakterleri: " “ ” „ « »
const Q_OPEN = `["“„«]`;
const Q_CLOSE = `["”“»]`;
const Q_ANY = `"“”„«»`;

// İlk paragraf (sabit kalıp): "... <KANAL> logosuyla yayın yapan ... kuruluşun <TARİH> tarihinde
// saat <SAAT>'de yayınladığı "<PROGRAM>" ... yayınına ilişkin ... görüşmeler sonucunda;"
// Tarih ifadesi yalnızca rakam, nokta, virgül ve "ve" içerebilir — serbest metin değil.
const TARIH_RE = /((?:\d{1,2}(?:\.\d{1,2})?(?:\.\d{4})?(?:\s*,\s*|\s+ve\s+|\s*-\s*))*\d{1,2}\.\d{1,2}\.\d{4})\s+tarih(?:inde|lerinde|li)/;
const SAAT_RE = /saat(?:leri)?\s+(\d{1,2}[:.]\d{2})\b/;
const SAAT_ARALIK_RE = /((?:\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2})(?:\s*(?:,|ve)\s*\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2})*)\s+saatleri arasında/;
const PROGRAM_RE = new RegExp(`${Q_OPEN}([^${Q_ANY}]{1,120})${Q_CLOSE}`);

function parseYayin(p1) {
  if (!/Dairesi Başkanlığının .*? sayılı yazısına konu/i.test(p1)) return {}; // kalıp dışı: hiçbir şey alma
  const t = p1.match(TARIH_RE);
  const sa = p1.match(SAAT_ARALIK_RE);
  const s = p1.match(SAAT_RE);
  const tail = t ? p1.slice(t.index) : p1; // program adı tarihten sonra gelir
  const pr = tail.match(PROGRAM_RE);
  return {
    yayinTarihi: t ? t[1].replace(/\s+/g, " ").trim() : null,
    yayinSaati: sa
      ? sa[1].replace(/\./g, ":").replace(/\s*-\s*/g, "-").replace(/\s*,\s*/g, ", ")
      : s ? s[1].replace(".", ":") : null,
    program: pr ? pr[1].trim() : null,
  };
}

// İlke metni: "6112 sayılı Kanun'un 8'inci maddesinin birinci fıkrasının (c) bendinde yer alan;
//   Yayın hizmetleri "Hukukun üstünlüğü, adalet ve tarafsızlık esasına aykırı olamaz." ilkesinin ihlali nedeniyle,"
// Yalnızca kanun maddesinin alıntısı (tırnak içi) alınır; satır kanun atfıyla başlamalı.
const ILKE_RE = new RegExp(
  `^(?:[a-z0-9]\\)\\s*)?\\d{4,5} sayılı Kanun.*?yer alan[;:]?\\s*(.*?)\\s*(?:ilkesinin|ilkelerinin|hükmünün|hükümlerinin|yasağının)\\s+(?:\\S+\\s+){0,6}?ihlali nedeniyle`,
  "i",
);

function parseIlke(lines) {
  for (const l of lines) {
    const m = l.match(ILKE_RE);
    if (!m) continue;
    let seg = m[1];
    const a = seg.search(new RegExp(Q_OPEN));
    const b = seg.search(new RegExp(`${Q_CLOSE}[^${Q_ANY}]*$`));
    if (a >= 0 && b > a) seg = seg.slice(a + 1, b);
    seg = squash(seg).replace(new RegExp(`^[${Q_ANY}'’]+|[${Q_ANY}'’]+$`, "g"), "").trim();
    // Kaynak alıntıyı kısaltmışsa ("...;.." / "…") tek "…" ile bitir; tam cümlenin son noktasını kaldır.
    seg = /(\.{2,}|…)\s*$/.test(seg) ? seg.replace(/[\s.…]+$/, "") + "…" : seg.replace(/\.$/, "");
    if (seg.length >= 10 && seg.length <= 600) return seg;
  }
  return null;
}

// Tutar: "... 245.386,00 (ikiyüz...) Türk Lirası İDARİ PARA CEZASI UYGULANMASINA"
//        "... yüzde bir oranı (%1) 4.847.977,00 TL İDARİ PARA CEZASI UYGULANMASINA"
const TUTAR_RE = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:\([^)]*\)\s*)?(?:TL|Türk Lirası|TÜRK LİRASI)\s+İDARİ PARA CEZASI/i;
const ORAN_RE = /%\s?(\d+(?:[.,]\d+)?)\s*(?:\)|oranında)/;

function parseCeza(lines) {
  // Oran bazen tutarın bulunduğu satırda ("yüzde bir oranı (%1) ... TL"), bazen bir önceki
  // maddede ("%1 oranında idari para cezası uygulanmasına,") geçer; hüküm bölümü taranır.
  const bas = Math.max(0, lines.findIndex((l) => /^Bu itibarla/i.test(l)));
  let tutar = null, oran = null;
  for (const l of lines.slice(bas)) {
    const m = l.match(TUTAR_RE);
    if (m && !tutar) tutar = m[1].replace(/,00$/, "");
    const o = l.match(ORAN_RE);
    if (o && !oran) oran = `%${o[1]}`;
  }
  return { tutar, oran };
}

// Başlıkta kanal parantezi yoksa ilk paragrafın sabit kalıbından: "... yazısına konu <KANAL>
// logosuyla yayın yapan ..." — yalnızca "konu" ile "logosuyla/çağrı işaretiyle" arasındaki kısa ad.
function kanalFromP1(p1) {
  const m = p1.match(/yazısına konu,?\s+(.{1,60}?)\s+(?:logosuyla|logolu|çağrı işaretiyle|çağrı işaretli|unvanlı|ünvanlı)/i);
  return m && !new RegExp(`[${Q_ANY}]`).test(m[1]) ? m[1].trim() : null;
}

// Son çare, hüküm bölümündeki sabit kalıp: 'ABC ... A.Ş. unvanlı ve “TELE 1” logolu kuruluş'
function kanalFromHukum(lines) {
  for (const l of lines) {
    const m = l.match(new RegExp(`^(?:\\d\\)\\s*)?(.{3,120}?)\\s+[uü]nvanlı ve\\s+[${Q_ANY}]([^${Q_ANY}]{1,40})[${Q_ANY}]\\s+logolu`, "i"));
    if (m) return { kanal: m[2].trim(), kurulus: m[1].trim() };
  }
  return { kanal: null, kurulus: null };
}

// Detay HTML -> yaptırım kaydı (yalnızca sabit alanlar)
export function parseDetay(html, item = {}) {
  const $ = cheerio.load(html);
  const art = $("article#content");
  const label = (name) => {
    const el = art.find("strong").filter((_, e) => squash($(e).text()).startsWith(name)).first();
    return el.length ? squash(el.parent().text().replace(el.text(), "")) : null;
  };
  const toplantiNo = label("Toplantı No") || item.toplantiNo || null;
  const toplantiTarihi = normDate(label("Toplantı Tarihi") || item.toplantiTarihi || "");
  const kararNo = Number(label("Karar No")) || item.kararNo || null;
  const konu = label("Karar Konusu") || item.konu || "";

  const lines = kararLines($);
  let { kanal, kurulus } = parseKanal(konu);
  if (!kanal) {
    const h = kanalFromHukum(lines);
    kanal = kanalFromP1(lines[0] || "") || h.kanal;
    kurulus ||= h.kurulus;
  }
  const madde = parseMadde(konu);
  const ceza = parseCeza(lines);
  // Başlık kesik kalmış olabilir ("... Yayın Durdurma,"); hükümde İPC tutarı varsa tür listesine eklenir.
  const turler = yaptirimTurleri(konu);
  if (ceza.tutar && !turler.includes("idari para cezası")) turler.unshift("idari para cezası");
  return {
    id: item.id || null,
    url: item.url || null,
    toplantiNo,
    toplantiTarihi,
    kararNo,
    konu,
    turler,
    kanal: kanalAdi(kanal),
    kanalKaynak: kanal, // RTÜK başlığındaki ham logo adı
    kurulus,
    madde: madde ? madde.kisa : null,
    ...parseYayin(lines[0] || ""),
    ilke: parseIlke(lines),
    ...ceza,
  };
}

export async function fetchKararDetay(item) {
  return parseDetay(await getHtml(item.url), item);
}

// Toplantı sırası: "2026/35" #4 -> 2026035004 (eskiden yeniye sıralamak için)
export function toplantiSira(it) {
  const m = (it.toplantiNo || "").match(/^(\d{4})\/(\d+)$/);
  return (m ? Number(m[1]) * 1000 + Number(m[2]) : 0) * 1000 + (it.kararNo || 0);
}
