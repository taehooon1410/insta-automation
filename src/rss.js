/**
 * 글로벌 다양한 해외 과학/기술 RSS 피드 수집 모듈 (매회 100% 무작위 신규 주제 추출)
 */
export async function fetchRSS(feedUrl) {
  // 다양한 해외 주요 피드 목록 (우주, 과학, 최신 기술, AI)
  const defaultFeeds = [
    'https://www.sciencedaily.com/rss/top/science.xml',
    'https://phys.org/rss-feed/science-news/',
    'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
    'https://www.wired.com/feed/category/science/latest/rss',
    'https://www.space.com/feeds/all'
  ];

  // 전달받은 feedUrl이 없으면 다변화된 피드 중 무작위 1개 선택
  const targetUrl = feedUrl || defaultFeeds[Math.floor(Math.random() * defaultFeeds.length)];
  console.log(`[RSS] Target Feed Selected: ${targetUrl}`);

  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    // 특정 피드 장애 시 대체 피드로 한 번 더 시도
    const fallbackUrl = defaultFeeds[0];
    const fbResponse = await fetch(fallbackUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!fbResponse.ok) {
      throw new Error(`RSS 요청 실패: ${response.statusText}`);
    }
    return parseXml(await fbResponse.text());
  }

  const xmlText = await response.text();
  return parseXml(xmlText);
}

function parseXml(xmlText) {
  const items = [];
  const itemMatches = xmlText.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title>(.*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link>(.*?)<\/link>/i);
    const descMatch = itemXml.match(/<description>(.*?)<\/description>/i);

    const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';
    const link = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
    const description = descMatch ? descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';

    if (title && description && title.length > 5) {
      items.push({ title, link, description });
    }
  }

  // 기사 무작위 셔플 (Fisher-Yates Shuffle)
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}
