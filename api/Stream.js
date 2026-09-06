export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).send("Missing url");
    }

    let target;

    try {
      target = new URL(url);
    } catch {
      return res.status(400).send("Invalid URL");
    }

    const response = await fetch(target.href, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    });

    if (!response.ok) {
      return res.status(response.status).send("Stream error");
    }

    if (response.headers.get("content-type")) {
      res.setHeader(
        "Content-Type",
        response.headers.get("content-type")
      );
    } else {
      res.setHeader("Content-Type", "video/mp2t");
    }

    res.setHeader("Cache-Control", "no-store");

    if (response.body) {
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        res.write(Buffer.from(value));
      }

      return res.end();
    }

    return res.status(502).send("No stream body");

  } catch (error) {
    console.error(error);
    return res.status(500).send("Stream proxy error");
  }
}
