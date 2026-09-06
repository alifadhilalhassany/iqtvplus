export default async function handler(req, res) {
  const channelId = req.query.id || "1502";
  const targetApiUrl = `https://def.yacinelive.com/api/channel/${channelId}`;

  try {
    const apiRes = await fetch(targetApiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://yacinelive.com/",
        "Origin": "https://yacinelive.com/"
      }
    });

    const responseText = await apiRes.text();

    // نتحقق إذا الرد عبارة عن JSON صالح أصلاً لو لا
    let jsonData;
    try {
      jsonData = JSON.parse(responseText);
    } catch (err) {
      // إذا مو JSON، نرجع النص الحقيقي حتى نشوف السيرفر شدا يدز لنا
      return res.status(500).json({ 
        error: "Server returned non-JSON response", 
        rawResponse: responseText.substring(0, 100) // اول 100 حرف من الرد
      });
    }

    if (jsonData && jsonData.data && jsonData.data.length > 0 && jsonData.data[0].url) {
      const originalStreamUrl = jsonData.data[0].url;
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.redirect(302, originalStreamUrl);
    } else {
      return res.status(404).json({ error: "Stream URL not found in JSON data", data: jsonData });
    }

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
