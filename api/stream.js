const API_BASE = "https://def.yacinelive.com";
const XOR_KEY = "c!xZj+N9&G@Ev@vw";

const USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 12; M2101K7AG Build/SKQ1.210908.001)";

function decrypt(base64, key) {
  let binary;
  try {
    binary = atob(base64.trim());
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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*"
  };
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
    } catch (e) {
      if (i === retries - 1) throw e;
    }
  }
  throw new Error("Max retries reached");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const liveMatch = url.pathname.match(/^\/live\/([^/]+)$/);
    if (liveMatch) {
      const channelId = decodeURIComponent(liveMatch[1]);
      const targetApiUrl = `${API_BASE}/api/channel/${encodeURIComponent(channelId)}`;

      try {
        const apiRes = await fetchWithRetry(targetApiUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://yacinelive.com/",
            "Cache-Control": "no-cache"
          },
          cf: { cacheTtl: 0 }
        });

        if (!apiRes.ok) {
          return new Response(`API Error: ${apiRes.status}`, { status: 500, headers: corsHeaders() });
        }

        const encryptedText = await apiRes.text();
        const tHeader = apiRes.headers.get("t");

        if (!tHeader) {
          return new Response("Security token 't' missing", { status: 403, headers: corsHeaders() });
        }

        const decrypted = decrypt(encryptedText, XOR_KEY + tHeader);
        let jsonData;
        try {
          jsonData = JSON.parse(decrypted);
        } catch (e) {
          return new Response("Failed to parse JSON", { status: 500, headers: corsHeaders() });
        }

        const channelObj = jsonData?.data?.[0] || jsonData?.data || jsonData;
        const streamUrl = channelObj?.url || channelObj?.stream_url || channelObj?.link;

        if (!streamUrl) {
          return new Response("Stream URL not found", { status: 404, headers: corsHeaders() });
        }

        const m3u8Res = await fetchWithRetry(streamUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            "Referer": "https://yacinelive.com/",
            "Accept": "*/*",
            "Cache-Control": "no-cache"
          },
          cf: { cacheTtl: 0 }
        });

        const m3u8Text = await m3u8Res.text();
        const baseStreamUrl = new URL(streamUrl);

        const modifiedLines = m3u8Text.split(/\r?\n/).map(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) {
            if (trimmed.startsWith("#") && trimmed.includes('URI="')) {
              return trimmed.replace(/URI="([^"]+)"/, (match, uri) => {
                const absUri = new URL(uri, baseStreamUrl).href;
                return `URI="${url.origin}/proxy?url=${encodeURIComponent(absUri)}"`;
              });
            }
            return line;
          }

          try {
            const absoluteSegmentUrl = new URL(trimmed, baseStreamUrl).href;
            return `${url.origin}/proxy?url=${encodeURIComponent(absoluteSegmentUrl)}`;
          } catch (e) {
            return line;
          }
        }).join("\n");

        return new Response(modifiedLines, {
          status: 200,
          headers: {
            ...corsHeaders(),
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store, no-cache, must-revalidate"
          }
        });

      } catch (err) {
        return new Response(`Worker Exception: ${err.message}`, { status: 500, headers: corsHeaders() });
      }
    }

    // Proxy مباشر: سحب القطعة وإرسالها للمشغل بسلامة بدون مشاكل الـ Redirect
    if (url.pathname === "/proxy") {
      const target = url.searchParams.get("url");
      if (!target) {
        return new Response("Missing target url", { status: 400, headers: corsHeaders() });
      }

      try {
        const targetUrl = new URL(target);
        const proxyRes = await fetch(targetUrl.href, {
          method: request.method,
          headers: {
            "User-Agent": USER_AGENT,
            "Referer": "https://yacinelive.com/",
            "Accept": "*/*"
          },
          cf: { cacheTtl: 2 }
        });

        const newHeaders = new Headers(proxyRes.headers);
        Object.entries(corsHeaders()).forEach(([k, v]) => newHeaders.set(k, v));

        return new Response(proxyRes.body, {
          status: proxyRes.status,
          headers: newHeaders
        });

      } catch (e) {
        return new Response(`Proxy Error: ${e.message}`, { status: 500, headers: corsHeaders() });
      }
    }

    return new Response("IQTV Engine Online", { status: 200, headers: corsHeaders() });
  }
};
