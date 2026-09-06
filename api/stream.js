export default async function handler(req, res) {
  // استقبال الرابط الممرر بعد علامة stream=
  const targetUrl = req.query.stream;

  if (!targetUrl) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(400).send("الرجاء وضع رابط البث مع متغير stream");
  }

  try {
    // جلب البث الحقيقي من المصدر مع تخطي الحماية والهيدرات
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
        "Referer": "https://x.com/",
        "Accept": "*/*"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch stream source");
    }

    // فتح صلاحيات الـ CORS وسحب محتوى البث أو إعادة توجيهه
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

    // نقل نوع المحتوى الحقيقي (سواء كان m3u8 أو أجزاء فيديو)
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    // قراءة البيانات وإرسالها للمشغل
    const buffer = Buffer.from(await response.arrayBuffer());
    return res.status(response.status).send(buffer);

  } catch (error) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).json({ error: error.message });
  }
}
