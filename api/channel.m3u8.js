const API_BASE = "https://def.yacinelive.com";
const XOR_KEY = "c!xZj+N9&G@Ev@vw";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/139.0.0.0 Safari/537.36";

function decrypt(base64, key) {
  const data = Buffer.from(base64.trim(), "base64");
  let out = "";

  for (let i = 0; i < data.length; i++) {
    out += String.fromCharCode(
      data[i] ^ key.charCodeAt(i % key.length)
    );
  }

  return out;
}

export default async function handler(req, res) {
  try {
    const id = req.query?.id || "4";

    const api = await fetch(
      `${API_BASE}/api/channel/${encodeURIComponent(id)}`,
      {
        headers: {
          "User-Agent": UA,
          "Accept": "*/*"
        },
        cache: "no-store"
      }
    );

    if (!api.ok) {
      return res.status(502).send("Source API error");
    }

    const encrypted = await api.text();
    const timestamp = api.headers.get("t");

    if (!timestamp) {
      return res.status(502).send("Missing source timestamp");
    }

    const decrypted = decrypt(
      encrypted,
      XOR_KEY + timestamp
    );

    const data = JSON.parse(decrypted);

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
      return res.status(404).send("Stream not found");
    }

    const redirect = await fetch(streamUrl, {
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        "Referer": "https://x.com/",
        "Accept": "*/*"
      },
      cache: "no-store"
    });

    const location = redirect.headers.get("location");

    const finalUrl = location
      ? new URL(location, streamUrl).href
      : streamUrl;

    const playlistResponse = await fetch(finalUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://x.com/",
        "Accept": "*/*"
      },
      cache: "no-store"
    });

    if (!playlistResponse.ok) {
      return res
        .status(playlistResponse.status)
        .send("Playlist error");
    }

    const playlist = await playlistResponse.text();

    const base = new URL(finalUrl);

    const rewritten = playlist
      .split(/\r?\n/)
      .map(line => {
        const value = line.trim();

        if (!value || value.startsWith("#")) {
          return line;
        }

        try {
          const segment = new URL(value, base).href;

          return `/api/segment?url=${encodeURIComponent(segment)}`;
        } catch {
          return line;
        }
      })
      .join("\n");

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
      "no-store, no-cache, must-revalidate"
    );

    return res.status(200).send(rewritten);

  } catch (e) {
    return res
      .status(500)
      .send("Error: " + e.message);
  }
}
