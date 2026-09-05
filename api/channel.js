const API_BASE = "https://def.yacinelive.com";
const XOR_KEY = "c!xZj+N9&G@Ev@vw";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/139.0.0.0 Safari/537.36";

const REFERER = "https://x.com/";

function decrypt(base64, key) {
  const binary = Buffer.from(
    base64.trim(),
    "base64"
  );

  let result = "";

  for (let i = 0; i < binary.length; i++) {
    result += String.fromCharCode(
      binary[i] ^
      key.charCodeAt(i % key.length)
    );
  }

  return result;
}

export default async function handler(req, res) {

  try {

    const channelId =
      req.query?.id || "4";

    /*
     * 1 — جلب بيانات القناة
     */

    const apiResponse = await fetch(
      `${API_BASE}/api/channel/${encodeURIComponent(channelId)}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "*/*"
        },
        cache: "no-store"
      }
    );

    if (!apiResponse.ok) {
      return res
        .status(apiResponse.status)
        .send("API unavailable");
    }

    const encrypted =
      await apiResponse.text();

    const timestamp =
      apiResponse.headers.get("t");

    if (!timestamp) {
      return res
        .status(500)
        .send("Missing API timestamp");
    }

    /*
     * 2 — فك البيانات
     */

    const decrypted =
      decrypt(
        encrypted,
        XOR_KEY + timestamp
      );

    const data =
      JSON.parse(decrypted);

    /*
     * 3 — استخراج رابط القناة
     */

    const channel =
      data?.data?.[0] ||
      data?.data ||
      data?.channel ||
      data;

    const streamUrl =
      channel?.url ||
      channel?.stream_url ||
      channel?.stream ||
      channel?.link;

    if (!streamUrl) {
      return res
        .status(404)
        .send("Stream URL not found");
    }

    /*
     * 4 — الحصول على الرابط النهائي
     */

    const redirect =
      await fetch(
        streamUrl,
        {
          redirect: "manual",
          headers: {
            "User-Agent": USER_AGENT,
            "Referer": REFERER,
            "Accept": "*/*"
          },
          cache: "no-store"
        }
      );

    const location =
      redirect.headers.get("location");

    const finalUrl =
      location
        ? new URL(
            location,
            streamUrl
          ).href
        : streamUrl;

    /*
     * 5 — جلب الـM3U8
     */

    const playlistResponse =
      await fetch(
        finalUrl,
        {
          headers: {
            "User-Agent": USER_AGENT,
            "Referer": REFERER,
            "Accept": "*/*"
          },
          cache: "no-store"
        }
      );

    if (!playlistResponse.ok) {
      return res
        .status(playlistResponse.status)
        .send("Playlist unavailable");
    }

    const playlist =
      await playlistResponse.text();

    /*
     * 6 — إرجاع M3U8 مباشرة
     */

    res.setHeader(
      "Content-Type",
      "application/vnd.apple.mpegurl"
    );

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res
      .status(200)
      .send(playlist);

  } catch (error) {

    return res
      .status(500)
      .send(
        "Error: " +
        error.message
      );
  }
}
