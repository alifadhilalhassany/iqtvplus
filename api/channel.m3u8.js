const ORIGIN_M3U8 =
  "https://def.yacinelive.com";

export default async function handler(req, res) {
  try {
    const response = await fetch(ORIGIN_M3U8, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    });

    if (!response.ok) {
      return res.status(response.status).send("Origin error");
    }

    const text = await response.text();

    const base = new URL(ORIGIN_M3U8);

    const rewritten = text
      .split("\n")
      .map(line => {
        const value = line.trim();

        if (!value || value.startsWith("#")) {
          return line;
        }

        try {
          const segmentUrl = new URL(value, base).href;

          return `/api/stream?url=${encodeURIComponent(segmentUrl)}`;
        } catch {
          return line;
        }
      })
      .join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    return res.status(200).send(rewritten);

  } catch (error) {
    console.error(error);
    return res.status(500).send("Proxy error");
  }
}
