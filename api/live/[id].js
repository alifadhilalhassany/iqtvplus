const API_BASE = "https://def.yacinelive.com";
const XOR_KEY = "c!xZj+N9&G@Ev@vw";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/139.0.0.0 Safari/537.36";

const REFERER = "https://x.com/";

function decrypt(base64, key) {
  const binary = atob(base64.trim());
  let result = "";

  for (let i = 0; i < binary.length; i++) {
    result += String.fromCharCode(
      binary.charCodeAt(i) ^
      key.charCodeAt(i % key.length)
    );
  }

  return result;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
}

async function getStream(channelId) {
  const api = await fetch(
    `${API_BASE}/api/channel/${encodeURIComponent(channelId)}`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "*/*"
      },
      cache: "no-store"
    }
  );

  if (!api.ok) {
    throw new Error(`API ${api.status}`);
  }

  const encrypted = await api.text();
  const t = api.headers.get("t");

  if (!t) {
    throw new Error("Header t غير موجود");
  }

  const decrypted = decrypt(encrypted, XOR_KEY + t);
  let data;

  try {
    data = JSON.parse(decrypted);
  } catch {
    throw new Error("فشل فك بيانات API");
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
    throw new Error("رابط البث غير موجود");
  }

  const redirect = await fetch(streamUrl, {
    redirect: "manual",
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": REFERER,
      "Accept": "*/*"
    },
    cache: "no-store"
  });

  const location = redirect.headers.get("location");

  if (location) {
    return new URL(location, streamUrl).href;
  }

  return streamUrl;
}

async function getPlaylist(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": REFERER,
      "Accept": "*/*"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Playlist ${response.status}`);
  }

  return await response.text();
}

function isAllowedHost(hostname) {
  return (
    hostname.includes("buzz") ||
    hostname.includes("online") ||
    hostname.includes("live") ||
    hostname.includes("new-redirect") ||
    hostname.endsWith(".com") ||
    hostname.endsWith(".net")
  );
}

function rewriteUriAttributes(line, origin, base) {
  return line.replace(
    /URI="([^"]+)"/gi,
    (match, uri) => {
      try {
        const absolute = new URL(uri, base).href;
        return (
          'URI="' +
          origin +
          "/api/proxy?url=" +
          encodeURIComponent(absolute) +
          '"'
        );
      } catch {
        return match;
      }
    }
  );
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).send("Method Not Allowed");
  }

  const { id, url: proxyTarget } = req.query;

  try {
    const origin = `https://${req.headers.host}`;

    // إذا الطلب تخص الـ proxy للأجزاء (.ts)
    if (req.url.includes("/api/proxy")) {
      if (!proxyTarget) {
        return res.status(400).send("Missing url");
      }

      let targetUrl;
      try {
        targetUrl = new URL(proxyTarget);
      } catch {
        return res.status(400).send("Invalid URL");
      }

      if (!isAllowedHost(targetUrl.hostname)) {
        return res.status(403).send("Host not allowed");
      }

      // إعادة توجيه سريعة جداً للمشغل لقطع الفيديو مباشرة
      return res.redirect(302, targetUrl.href);
    }

    // إذا الطلب للقناة العادية
    if (id) {
      const finalUrl = await getStream(id);
      const playlistText = await getPlaylist(finalUrl);
      const base = new URL(finalUrl);

      const lines = playlistText.split(/\r?\n/);

      const output = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.startsWith("#")) {
          if (trimmed.includes('URI="')) {
            return rewriteUriAttributes(line, origin, base);
          }
          return line;
        }

        try {
          const absolute = new URL(trimmed, base).href;
          return `${origin}/api/proxy?url=${encodeURIComponent(absolute)}`;
        } catch {
          return line;
        }
      }).join("\n");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(output);
    }

    return res.status(404).send("Not Found");

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Unknown error"
    });
  }
}
