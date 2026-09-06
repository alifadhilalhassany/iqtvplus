
const API_BASE = "https://def.yacinelive.com";
const XOR_KEY = "c!xZj+N9&G@Ev@vw";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/139.0.0.0 Safari/537.36";

const REFERER = "https://x.com/";

function decrypt(base64, key) {
  const bytes = Uint8Array.from(
    atob(base64.trim()),
    c => c.charCodeAt(0)
  );

  let result = "";

  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(
      bytes[i] ^ key.charCodeAt(i % key.length)
    );
  }

  return result;
}

async function getStreamUrl(channelId) {
  const response = await fetch(
    `${API_BASE}/api/channel/${encodeURIComponent(channelId)}`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "*/*"
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `API ${response.status}`
    );
  }

  const encrypted = await response.text();

  const timestamp =
    response.headers.get("t");

  if (!timestamp) {
    throw new Error("Missing t header");
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
    throw new Error("Stream URL not found");
  }

  return streamUrl;
}

async function getFinalUrl(streamUrl) {
  const response = await fetch(
    streamUrl,
    {
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": REFERER,
        "Accept": "*/*"
      }
    }
  );

  const location =
    response.headers.get("location");

  if (!location) {
    return streamUrl;
  }

  return new URL(
    location,
    streamUrl
  ).href;
}

async function playlist(channelId) {
  const streamUrl =
    await getStreamUrl(channelId);

  const finalUrl =
    await getFinalUrl(streamUrl);

  const response = await fetch(
    finalUrl,
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": REFERER,
        "Accept": "*/*"
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Playlist ${response.status}`
    );
  }

  const text =
    await response.text();

  if (!text.includes("#EXTM3U")) {
    throw new Error(
      "Invalid M3U8"
    );
  }

  /*
   * نحول الروابط النسبية إلى روابط مطلقة.
   * الروابط المطلقة تبقى كما هي.
   */
  const base =
    new URL(finalUrl);

  const output =
    text
      .split(/\r?\n/)
      .map(line => {

        const value =
          line.trim();

        if (
          !value ||
          value.startsWith("#")
        ) {
          return line;
        }

        try {
          return new URL(
            value,
            base
          ).href;
        } catch {
          return line;
        }
      })
      .join("\n");

  return new Response(
    output,
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.apple.mpegurl",

        "Access-Control-Allow-Origin":
          "*",

        "Cache-Control":
          "no-store, no-cache, must-revalidate",

        "Pragma":
          "no-cache",

        "Expires":
          "0"
      }
    }
  );
}

async function proxySegment(request) {
  const incoming =
    new URL(request.url);

  const target =
    incoming.searchParams.get("url");

  if (!target) {
    return new Response(
      "Missing url",
      { status: 400 }
    );
  }

  let targetUrl;

  try {
    targetUrl =
      new URL(target);
  } catch {
    return new Response(
      "Invalid url",
      { status: 400 }
    );
  }

  /*
   * نمرر Range إذا كان المشغل يستخدمه.
   * والأهم: لا نستخدم arrayBuffer().
   * نرجع response.body مباشرة.
   */
  const headers =
    new Headers();

  headers.set(
    "User-Agent",
    USER_AGENT
  );

  headers.set(
    "Referer",
    REFERER
  );

  headers.set(
    "Accept",
    "*/*"
  );

  const range =
    request.headers.get("Range");

  if (range) {
    headers.set(
      "Range",
      range
    );
  }

  const response =
    await fetch(
      targetUrl.href,
      {
        method:
          request.method === "HEAD"
            ? "HEAD"
            : "GET",

        headers,

        redirect:
          "follow"
      }
    );

  const outputHeaders =
    new Headers();

  const contentType =
    response.headers.get(
      "Content-Type"
    );

  if (contentType) {
    outputHeaders.set(
      "Content-Type",
      contentType
    );
  }

  const contentLength =
    response.headers.get(
      "Content-Length"
    );

  if (contentLength) {
    outputHeaders.set(
      "Content-Length",
      contentLength
    );
  }

  const contentRange =
    response.headers.get(
      "Content-Range"
    );

  if (contentRange) {
    outputHeaders.set(
      "Content-Range",
      contentRange
    );
  }

  outputHeaders.set(
    "Access-Control-Allow-Origin",
    "*"
  );

  outputHeaders.set(
    "Accept-Ranges",
    "bytes"
  );

  outputHeaders.set(
    "Cache-Control",
    "no-store"
  );

  return new Response(
    response.body,
    {
      status:
        response.status,

      headers:
        outputHeaders
    }
  );
}

export default {
  async fetch(request) {

    const url =
      new URL(request.url);

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET,HEAD,OPTIONS",

            "Access-Control-Allow-Headers":
              "*"
          }
        }
      );
    }

    try {

      /*
       * /live/4.m3u8
       */
      const match =
        url.pathname.match(
          /^\/live\/([^/]+)\.m3u8$/
        );

      if (match) {

        const channelId =
          match[1];

        return await playlist(
          channelId
        );
      }

      /*
       * /segment?url=...
       */
      if (
        url.pathname ===
        "/segment"
      ) {
        return await proxySegment(
          request
        );
      }

      return new Response(
        "IQTV Worker OK",
        {
          status: 200
        }
      );

    } catch (error) {

      return new Response(
        "Stream error: " +
        error.message,
        {
          status: 502,
          headers: {
            "Content-Type":
              "text/plain; charset=utf-8"
          }
        }
      );
    }
  }
};
