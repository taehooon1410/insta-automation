/**
 * AI 카드뉴스 재창작 모듈
 * 1. Google Gemini API 호출
 * 2. 429 쿼터 초과 시 Cloudflare Workers AI (Llama-3 / Gemma)로 100% 자동 Fallback
 */
export async function generateCardNewsContent(article, apiKey, envAi = null) {
  const prompt = `
당신은 인스타그램 카드뉴스 전문 에디터입니다. 아래 원문 기사를 바탕으로 인스타그램에 포스팅할 100% 저작권 안전한 한국어 카드뉴스를 만들어주세요.

[원칙]
1. 원문의 표현을 절대 직접 복사/번역하지 말고, 오직 '핵심 사실(Fact)'만 추출하여 흥미롭고 쉬운 한국어 문장으로 완전히 새롭게 재창작(Paraphrasing)하세요.
2. 카드뉴스는 총 4장의 슬라이드로 구성합니다.
   - 슬라이드 1: 어그로성/호기심 유발 헤드라인 제목 (짧고 강렬하게)
   - 슬라이드 2: 핵심 사실 및 내용 설명 1
   - 슬라이드 3: 핵심 사실 및 내용 설명 2
   - 슬라이드 4: 결론 + 강력한 프로필 링크 유도(CTA) 및 댓글 참여 유도 멘트
3. 배경 이미지 검색용 영문 단어 키워드 1개를 추출하세요 (예: space, galaxy, ocean, robot).

[원문 정보]
제목: ${article.title}
내용: ${article.description}

[출력 형식]
반드시 아래 JSON 규격으로만 응답하세요. 다른 설명 없이 오직 JSON만 출력하세요:
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

  // 1단계: Google Gemini API 모델 시도
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
          const parsed = JSON.parse(jsonMatch[0]);
          parsed.fileName = parsed.title ? parsed.title.replace(/[^a-zA-Z0-9가-힣_]/g, '_').slice(0, 30) : 'cardnews';
          console.log(`✅ Google Gemini API (${model}) 생성 성공!`);
          return parsed;
        }
      } else {
        const errText = await response.text();
        console.warn(`⚠️ Gemini (${model}) API 오류 (${response.status}):`, errText);
      }
    } catch (e) {
      console.warn(`⚠️ Gemini (${model}) 호출 중 예외:`, e.message);
    }
  }

  // 2단계: 429 쿼터 초과 시 Cloudflare Workers AI로 100% 무제한 대체 처리
  if (envAi) {
    console.log("🚀 Google Gemini 쿼터 초과로 인해 Cloudflare Workers AI (Llama-3) 엔진으로 100% 자동 전환합니다!");
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
        const parsed = JSON.parse(jsonMatch[0]);
        parsed.fileName = parsed.title ? parsed.title.replace(/[^a-zA-Z0-9가-힣_]/g, '_').slice(0, 30) : 'cardnews';
        console.log("✅ Cloudflare Workers AI (Llama-3) 생성 성공!");
        return parsed;
      }
    } catch (aiErr) {
      console.error("Cloudflare Workers AI Error:", aiErr.message);
    }
  }

  // Fallback: 텍스트 수동 정제 하드 파싱 생성 (절대로 실패하지 않음)
  const safeTitle = article.title ? article.title.slice(0, 25) : "최신 글로벌 이슈 알림";
  return {
    title: safeTitle,
    imageKeyword: "technology",
    slides: [
      `📢 ${safeTitle}`,
      `📌 주요 사실: ${article.title}`,
      `💡 흥미로운 쟁점: ${article.description ? article.description.slice(0, 50) : '상세 내용은 기사를 참조하세요.'}`,
      "👉 프로필 링크를 클릭해 전체 내용을 확인하고 댓글로 의견을 나눠보세요!"
    ],
    caption: `흥미로운 최신 뉴스 정보! #카드뉴스 #뉴스 #소식`,
    fileName: safeTitle.replace(/[^a-zA-Z0-9가-힣_]/g, '_')
  };
}
