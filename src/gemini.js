/**
 * Gemini API 모듈 (429 Rate Limit 회피 및 다양한 무료 모델 Fallback 지원)
 */
export async function generateCardNewsContent(article, apiKey) {
  // 구글 무료 티어 쿼터 회피용 가용 모델 순서
  const candidateModels = [
    'gemini-2.0-flash-lite-preview',
    'gemini-1.5-pro',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash'
  ];

  let cardNewsResult = null;
  let lastError = null;

  for (const model of candidateModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const prompt = `
당신은 인스타그램 카드뉴스 전문 에디터입니다. 아래 원문 기사를 바탕으로 인스타그램에 포스팅할 100% 저작권 안전한 한국어 카드뉴스를 만들어주세요.

[원칙]
1. 원문의 표현을 절대 직접 복사/번역하지 말고, 오직 '핵심 사실(Fact)'만 추출하여 흥미롭고 쉬운 한국어 문장으로 완전히 새롭게 재창작(Paraphrasing)하세요.
2. 카드뉴스는 총 4장의 슬라이드로 구성합니다.
   - 슬라이드 1: 어그로성/호기심 유발 헤드라인 제목 (짧고 강렬하게)
   - 슬라이드 2: 핵심 사실 및 내용 설명 1
   - 슬라이드 3: 핵심 사실 및 내용 설명 2
   - 슬라이드 4: 결론 + 강력한 프로필 링크 유도(CTA) 및 댓글 참여 유도 멘트
3. 배경 이미지 검색용 영문 단어 키워드 1개를 추출하세요.

[원문 정보]
제목: ${article.title}
내용: ${article.description}

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

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Model ${model} (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      const parts = result.candidates?.[0]?.content?.parts || [];
      const targetPart = parts.find(p => !p.thought) || parts[parts.length - 1] || {};
      const textOutput = targetPart.text || '';

      const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cardNewsResult = JSON.parse(jsonMatch[0]);
        console.log(`✅ AI 모델 (${model})로 카드뉴스 생성 성공!`);
        break;
      }
    } catch (err) {
      console.warn(`⚠️ 모델 ${model} 호출 실패, 다음 모델로 자동 전환 시도:`, err.message);
      lastError = err;
    }
  }

  if (!cardNewsResult) {
    throw new Error(`Google AI API 사용량(쿼터) 초과 429 에러입니다. 약 1분 후 다시 /generate 또는 만들기를 실행해 주세요!\n상세오류: ${lastError?.message}`);
  }

  cardNewsResult.fileName = cardNewsResult.title ? cardNewsResult.title.replace(/[^a-zA-Z0-9가-힣_]/g, '_').slice(0, 30) : 'cardnews';
  return cardNewsResult;
}
