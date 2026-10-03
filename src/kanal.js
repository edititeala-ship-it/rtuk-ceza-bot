// RTÜK başlığındaki logo/çağrı işareti adını okunur kanal adına çevirir.
// Kaynak adı state.json'da ayrıca saklanır (kanalKaynak); burada yalnızca gösterim düzeltilir.
//
//   "h halk"        -> "Halk TV"       (eşleme tablosu)
//   "KOZA"          -> "Koza"          (tamamı büyük harf: Türkçe başlık düzeni)
//   "EKİNTÜRK TV"   -> "Ekintürk TV"   (TV, FM gibi kısaltmalar büyük kalır)
//   "CNBC-e"        -> "CNBC-e"        (karışık yazım: dokunulmaz)

// Logo adı -> bilinen kanal adı. Anahtarlar küçük harfle karşılaştırılır.
const ESLEME = {
  "h halk": "Halk TV",
  "halk": "Halk TV",
  "szc": "Sözcü TV",
  "now": "NOW",
  "tele 1": "Tele1",
  "kanal ege": "Kanal Ege",
};

// Büyük harf kalacak parçalar
const KISALTMA = new Set([
  "TV", "FM", "HD", "RD", "TRT", "NTV", "CNN", "ATV", "TGRT", "FOX", "CNBC", "KRT", "TLC",
  "DMAX", "BBC", "TV8", "TV2", "TV4", "TV5", "TV100", "A2", "A", "HT", "TJK", "NBA", "SRT",
  "BRT", "ERT", "RTV", "EKO", "GS", "FB", "BJK", "TS",
]);

const trLower = (s) => s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
const trUpperFirst = (s) => (s[0] === "i" ? "İ" : s[0] === "ı" ? "I" : s[0].toUpperCase()) + s.slice(1);

function baslikDuzeni(s) {
  return s
    .split(/(\s+|-)/)
    .map((p) => {
      if (!p || /^(\s+|-)$/.test(p)) return p;
      if (KISALTMA.has(p.toUpperCase())) return p.toUpperCase();
      if (/\d/.test(p) && p.length <= 5) return p.toUpperCase(); // "TV8", "A2", "1"
      return trUpperFirst(trLower(p));
    })
    .join("");
}

export function kanalAdi(raw) {
  if (!raw) return raw;
  const s = raw.replace(/\s+/g, " ").trim();
  const e = ESLEME[trLower(s)];
  if (e) return e;
  const harfler = s.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, "");
  const hepBuyuk = harfler && harfler === harfler.toUpperCase();
  const hepKucuk = harfler && harfler === trLower(harfler);
  if (hepBuyuk || hepKucuk) return baslikDuzeni(s);
  return s; // karışık yazım ("CNBC-e", "beIN SPORTS 1"): kaynaktaki gibi
}
