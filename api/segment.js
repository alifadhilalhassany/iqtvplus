const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/139.0.0.0 Safari/537.36";

export default async function handler(req, res) {
  try {
    const url = req.query?.url;

    if (!url) {
      return res.status(400).send("Missing url");
    }

    const target = new URL(url);

    const response = await fetch(target.href, {
      headers: {
        "User-Agent": UA,
        "Referer": "https://x.com/",
        "Accept": "*/*"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return res.status(response.status).send("Segment error");
    }

    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") ||
      "video/mp2t"
    );

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.status(200).send(
      Buffer.from(await response.arrayBuffer())
    );

  } catch (e) {
    return res
      .status(500)
      .send("Proxy error: " + e.message);
  }
}
