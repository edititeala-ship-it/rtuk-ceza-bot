import { TwitterApi } from "twitter-api-v2";

const DRY = process.env.DRY_RUN === "1";

function client() {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    throw new Error("X anahtarları eksik: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET");
  }
  return new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_SECRET,
  }).readWrite;
}

let _c = null;

// Gönderi atar, tweet id döner. DRY_RUN=1 ise sadece yazdırır.
export async function post(text) {
  if (DRY) {
    console.log("----- DRY RUN (gönderilmedi) -----\n" + text + "\n----------------------------------");
    return "dry-" + Date.now();
  }
  _c ??= client();
  const res = await _c.v2.tweet({ text });
  return res.data.id;
}
