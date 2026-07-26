/**
 * RSS 피드에서 최신 기사 수집 (XML 파싱)
 */
export async function fetchRSS(feedUrl) {
  const targetUrl = feedUrl || 'https://www.sciencedaily.com/rss/top/science.xml';
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`RSS 요청 실패: ${response.statusText}`);
  }

  const xmlText = await response.text();
  
  // 간단한 정규표현식 파싱 (Worker 브라우저/서버리스 환경 호환)
  const items = [];
  const itemMatches = xmlText.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const itemXml of itemMatches.slice(0, 5)) {
    const titleMatch = itemXml.match(/<title>(.*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link>(.*?)<\/link>/i);
    const descMatch = itemXml.match(/<description>(.*?)<\/description>/i);

    const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
    const link = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
    const description = descMatch ? descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';

    if (title && description) {
      items.push({ title, link, description });
    }
  }

  return items;
}
