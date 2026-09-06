
const API_BASE = "https://def.yacinelive.com";
const XOR_KEY = "c!xZj+N9&G@Ev@vw";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/139.0.0.0 Safari/537.36";

const REFERER = "https://x.com/";

function decrypt(base64, key) {
  const buffer = Buffer.from(
    base64.trim(),
    "base64"
  );

  let result = "";

  for (let i = 0; i < buffer.length; i++) {
    result += String.fromCharCode(
      buffer[i] ^
      key.charCodeAt(i % key.length)
    );
  }

  return result;
}

export default async function handler(req, res) {
  try {
    const channelId =
      req.query?.id || "4";

    // جلب بيانات القناة
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
      return res.status(502).send(
        `API Error: ${apiResponse.status}`
      );
    }

    const encrypted =
      await apiResponse.text();

    const timestamp =
      apiResponse.headers.get("t");

    if (!timestamp) {
      return res.status(502).send(
        "Missing t header"
      );
    }

    // فك البيانات
    const decrypted =
      decrypt(
        encrypted,
        XOR_KEY + timestamp
      );

    let data;

    try {
      data = JSON.parse(decrypted);
    } catch {
      return res.status(502).send(
        "Invalid API response"
      );
    }

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
      return res.status(404).send(
        "Stream URL not found"
      );
    }

    // متابعة التحويل
    const redirectResponse =
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
      redirectResponse.headers.get(
        "location"
      );

    const finalUrl =
      location
        ? new URL(
            location,
            streamUrl
          ).href
        : streamUrl;

    // جلب الـM3U8
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
      return res.status(
        playlistResponse.status
      ).send(
        `Playlist Error: ${playlistResponse.status}`
      );
    }

    const playlist =
      await playlistResponse.text();

    if (!playlist.includes("#EXTM3U")) {
      return res.status(502).send(
        "Invalid M3U8 playlist"
      );
    }

    /*
     * مهم:
     * نخلي روابط الـsegments الأصلية.
     * ما نسوي Proxy للـsegments.
     *
     * هذا يقلل الضغط والتأخير على Vercel.
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
      "Access-Control-Allow-Methods",
      "GET, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "*"
    );

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    res.setHeader(
      "Expires",
      "0"
    );

    return res
      .status(200)
      .send(playlist);

  } catch (error) {

    console.error(error);

    return res.status(500).send(
      "Server Error: " +
      error.message
    );
  }
}
