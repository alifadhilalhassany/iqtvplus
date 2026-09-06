const API_BASE = "https://def.yacinelive.com";
const XOR_KEY = "c!xZj+N9&G@Ev@vw";
const USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 12; M2101K7AG Build/SKQ1.210908.001)";

function decrypt(base64, key) {
  let binary;
  try {
    binary = Buffer.from(base64.trim(), 'base64').toString('binary');
  } catch (e) {
    throw new Error("Base64 decode failed");
  }
  let result = "";
  for (let i = 0; i < binary.length; i++) {
    result += String.fromCharCode(
      binary.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const { channel, url: proxyTarget } = req.query;

  // 1. التعامل مع البروكسي (جلب قطع الـ TS والـ M3U8 الفرعية)
  if (proxyTarget) {
    try {
      const upstreamRes = await fetch(proxyTarget, {
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": "https://yacinelive.com/",
          "Accept": "*/*"
        }
      });

      res.status(upstreamRes.status);
      upstreamRes.headers.forEach((value, key) => {
        if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      setCorsHeaders(res);

      const buffer = Buffer.from(await upstreamRes.arrayBuffer());
      return res.send(buffer);
    } catch (e) {
      return res.status(500).json({ error: `Proxy Error: ${e.message}` });
    }
  }

  // 2. جلب القناة وتوليد ملف الـ M3U8
  if (channel) {
    const targetApiUrl = `${API_BASE}/api/channel/${encodeURIComponent(channel)}`;

    try {
      const apiRes = await fetch(targetApiUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://yacinelive.com/",
          "Cache-Control": "no-cache"
        }
      });

      if (!apiRes.ok) {
        return res.status(500).send(`API Error: ${apiRes.status}`);
      }

      const encryptedText = await apiRes.text();
      const tHeader = apiRes.headers.get("t");

      if (!tHeader) {
        return res.protocolVersion ? res.status(403).send("Security token 't' missing") : res.status(403).send("Security token 't' missing");
      }

      const decrypted = decrypt(encryptedText, XOR_KEY + tHeader);
      let jsonData;
      try {
        jsonData = JSON.parse(decrypted);
      } catch (e) {
        return res.status(500).send("Failed to parse JSON");
      }

      const channelObj = jsonData?.data?.[0] || jsonData?.data || jsonData;
      const streamUrl = channelObj?.url || channelObj?.stream_url || channelObj?.link;

      if (!streamUrl) {
        return res.status(404).send("Stream URL not found");
      }

      const m3u8Res = await fetch(streamUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": "https://yacinelive.com/",
          "Accept": "*/*",
          "Cache-Control": "no-cache"
        }
      });

      const m3u8Text = await m3u8Res.text();
      const baseStreamUrl = new URL(streamUrl);
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const baseUrl = `${protocol}://${host}`;

      const modifiedLines = m3u8Text.split(/\r?\n/).map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          if (trimmed.startsWith("#") && trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/, (match, uri) => {
              const absUri = new URL(uri, baseStreamUrl).href;
              return `URI="${baseUrl}/api/live?url=${encodeURIComponent(absUri)}"`;
            });
          }
          return line;
        }

        try {
          const absoluteSegmentUrl = new URL(trimmed, baseStreamUrl).href;
          return `${baseUrl}/api/live?url=${encodeURIComponent(absoluteSegmentUrl)}`;
        } catch (e) {
          return line;
        }
      }).join("\n");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.status(200).send(modifiedLines);

    } catch (err) {
      return res.status(500).send(`Server Exception: ${err.message}`);
    }
  }

  return res.status(200).send("Vercel IQTV Engine Online");
}
