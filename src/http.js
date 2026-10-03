// RTÜK sunucusu ara sıra bağlantıyı kesiyor (ECONNRESET) veya geç yanıt veriyor.
// Ağ hatası ve 5xx'te 3 deneme, aralar 3 / 6 / 12 sn. 4xx yeniden denenmez.
const UA = "rtuk-yaptirim-bot/0.1 (+https://github.com/edititeala-ship-it/rtuk-ceza-bot) resmi RTUK verisini aktarir";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getHtml(url, { tries = 3, timeoutMs = 30000 } = {}) {
  let son;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(3000 * 2 ** (i - 1));
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "tr" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.text();
      son = new Error(`HTTP ${res.status} ${url}`);
      if (res.status < 500) throw son; // 404 vb. kalıcı
    } catch (e) {
      son = e;
      if (/^HTTP 4\d\d/.test(e.message)) throw e;
      console.warn(`[http] ${i + 1}. deneme başarısız: ${e.cause?.code || e.name || e.message} ${url}`);
    }
  }
  throw son;
}
