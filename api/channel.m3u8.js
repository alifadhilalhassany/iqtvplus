export default async function handler(req, res) {
  // جلب رقم القناة، الافتراضي هو 1502
  const channelId = req.query.id || "1502";
  const targetApiUrl = `https://def.yacinelive.com/api/channel/${channelId}`;

  try {
    // 1. طلب الرابط المحدث من API ياسين تيفي مع هيدرات تخطي الحظر
    const apiRes = await fetch(targetApiUrl, {
      headers: {
        "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 12; M2101K7AG Build/SKQ1.210908.001)",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://yacinelive.com/",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!apiRes.ok) {
      return res.status(500).json({ error: "Failed to fetch from API", status: apiRes.status });
    }

    const jsonData = await apiRes.json();

    // 2. التحقق من وجود رابط البث الأصلي
    if (jsonData && jsonData.data && jsonData.data.length > 0 && jsonData.data[0].url) {
      const originalStreamUrl = jsonData.data[0].url;

      // 3. إعادة توجيه (Redirect) حية ودائمية للرابط المؤقت الجديد
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.redirect(302, originalStreamUrl);
    } else {
      return res.status(404).json({ error: "Stream URL not found in API" });
    }

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
