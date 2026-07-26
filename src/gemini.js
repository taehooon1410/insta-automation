/**
 * AI 카드뉴스 재창작 모듈
 */
export async function generateCardNewsContent(article, apiKey, envAi = null) {
  const articleTitle = article.title || '';
  const articleDesc = article.description || article.summary || '';
  const articleLink = article.link || '';
  const articleSource = article.source || '해외 과학 기술 저널';

  const prompt = `
당신은 인스타그램 카드뉴스 전문 에디터입니다. 아래 원문 기사를 바탕으로 인스타그램에 포스팅할 100% 저작권 안전한 한국어 카드뉴스를 만들어주세요.

[원칙]
1. 원문의 표현을 절대 직접 복사/번역하지 말고, 오직 '핵심 사실(Fact)'만 추출하여 흥미롭고 풍성한 한국어 문장으로 완전히 새롭게 재창작(Paraphrasing)하세요.
2. 카드뉴스는 총 4장의 슬라이드로 구성합니다.
   - 슬라이드 1: 호기심을 자극하는 강렬한 헤드라인 제목 (핵심 질문 포함)
   - 슬라이드 2: 주요 연구 내용 및 핵심 배경 상세 설명
   - 슬라이드 3: 발견의 의의, 구체적 영향 및 최신 성과
   - 슬라이드 4: 결론 + "👉 댓글에서 전문을 확인해보세요! 프로필 링크 클릭" 인스타그램 참여 유도 멘트 (텔레그램 등 타 플랫폼 단어 절대 사용 금지)

3. 배경 이미지 검색용 영문 단어 키워드 1개를 추출하세요 (예: space, galaxy, robot, ocean, brain).

[원문 정보]
제목: ${articleTitle}
내용: ${articleDesc}

[출력 형식]
반드시 아래 JSON 규격으로만 응답하세요:
{
  "title": "카드뉴스 대표 제목",
  "imageKeyword": "영문키워드",
  "slides": [
    "1번 슬라이드 문구",
    "2번 슬라이드 문구",
    "3번 슬라이드 문구",
    "4번 슬라이드 문구"
  ],
  "caption": "인스타그램 게시글 캡션 (해시태그 포함)"
}
`;

  let parsed = null;

  // 1. Google Gemini API 시도
  const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  for (const model of geminiModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (response.ok) {
        const result = await response.json();
        const parts = result.candidates?.[0]?.content?.parts || [];
        const targetPart = parts.find(p => !p.thought) || parts[parts.length - 1] || {};
        const textOutput = targetPart.text || '';
        const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
          console.log(`✅ Gemini (${model}) 성공!`);
          break;
        }
      }
    } catch (e) {
      console.warn("Gemini API attempt failed:", e.message);
    }
  }

  // 2. Cloudflare Workers AI Fallback
  if (!parsed && envAi) {
    try {
      const aiRes = await envAi.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a professional Korean Card News Editor. Output ONLY valid JSON.' },
          { role: 'user', content: prompt }
        ]
      });

      const responseText = aiRes.response || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn("Workers AI attempt failed:", e.message);
    }
  }

  // Fallback 기사 정제
  if (!parsed) {
    parsed = {
      title: articleTitle.slice(0, 30) || "최신 해외 기술 소식",
      imageKeyword: "technology",
      slides: [
        `📢 ${articleTitle}`,
        `📌 연구/기사 주요 내용:\n${articleDesc.slice(0, 100)}...`,
        `💡 핵심 쟁점:\n해당 성과는 향후 기술/과학 분야에 큰 영향을 미칠 것으로 기대됩니다.`,
        `👉 댓글에서 전문을 확인하고 의견을 나눠보세요!\n프로필 링크를 통해 더 많은 이슈를 확인해 보세요!`

      ],
      caption: `최신 이슈 알림 #과학 #기술 #카드뉴스`
    };
  }

  // 추가 메타데이터 부여 (출처 및 원문 전문)
  parsed.articleLink = articleLink;
  parsed.articleSource = articleSource;
  parsed.articleSummary = articleDesc;
  parsed.fileName = parsed.title ? parsed.title.replace(/[^a-zA-Z0-9가-힣_]/g, '_').slice(0, 30) : 'cardnews';

  return parsed;
}
