// Kural: yorum, sıfat, etiket, link yok. Yalnızca RTÜK kararındaki sabit alanlar.
// Link yok: X API'de linkli gönderi 13 kat pahalı ($0.20 / $0.015).
//
//   RTÜK idari para cezası
//
//   h halk — 245.386 TL
//
//   Yayın: "Ana Haber Bülteni", 19.06.2026, 18:00
//
//   İhlal: 6112 sayılı Kanun m. 8/1-c
//   "Hukukun üstünlüğü, adalet ve tarafsızlık esasına aykırı olamaz"
//
//   Üst Kurul toplantısı 2026/24 · 25.06.2026
//   Kaynak: RTÜK

// 280 = X Premium'suz sınır. Premium alınırsa POST_LIMIT=4000 ile ilke alıntıları hep sığar.
export const LIMIT = Number(process.env.POST_LIMIT || 280);
const len = (s) => [...s].length; // X, Türkçe harfleri ve — · “ ” karakterlerini 1 sayar

// Her gönderinin başındaki sabit işaret. Emoji link sayılmaz, ek ücret yok; X'te 2'şer karakter.
export const ONEK = process.env.POST_PREFIX ?? "🚨 ";

function baslik(turler) {
  const b = !turler.length ? "RTÜK yaptırım kararı"
    : turler.join(" ve ") === "idari para cezası" ? "RTÜK idari para cezası"
    : `RTÜK ${turler.join(" ve ")} kararı`;
  return ONEK + b;
}

function build(k, { ilkeyiKoy = true, program = k.program } = {}) {
  const out = [baslik(k.turler), ""];

  const kanal = k.kanal || k.kurulus || "—";
  out.push(k.tutar ? `${kanal} — ${k.tutar} TL` : kanal, "");

  const yayin = [program ? `"${program}"` : null, k.yayinTarihi, k.yayinSaati].filter(Boolean);
  if (yayin.length) out.push(`Yayın: ${yayin.join(", ")}`, "");

  if (k.madde) {
    // Başlıkta "ihlali" geçmiyorsa (örn. yayın durdurma kararının uygulanmaması) madde
    // ihlal edilen değil, yaptırımın dayanağıdır.
    out.push(`${/ihlali/i.test(k.konu || "") ? "İhlal" : "Dayanak"}: ${k.madde}`);
    if (k.ilke && ilkeyiKoy) out.push(`"${k.ilke}"`);
    out.push("");
  }

  out.push(`Üst Kurul toplantısı ${k.toplantiNo} · ${k.toplantiTarihi}`, "Kaynak: RTÜK");
  return out.join("\n");
}

// 280'i aşarsa önce ilke alıntısı düşer (madde atfı kalır), sonra program adı kısaltılır.
export function formatKarar(k) {
  let text = build(k);
  if (len(text) <= LIMIT) return { text, ilkeDustu: false };
  text = build(k, { ilkeyiKoy: false });
  if (len(text) <= LIMIT) return { text, ilkeDustu: true };
  let program = k.program || "";
  while (len(text) > LIMIT && program.length > 10) {
    program = program.slice(0, -5).trimEnd() + "…";
    text = build(k, { ilkeyiKoy: false, program });
  }
  return { text, ilkeDustu: true };
}
