/**
 * Gemini API를 통한 원문 텍스트 패러프레이징 및 카드뉴스 구성 생성
 */
export async function generateCardNewsContent(article, apiKey) {
  // Google Gemma 모델 (gemma-4-31b-it) 사용
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${apiKey}`;








  const prompt = `
당신은 인스타그램 카드뉴스 전문 에디터입니다. 아래 원문 기사를 바탕으로 인스타그램에 포스팅할 100% 저작권 안전한 한국어 카드뉴스를 만들어주세요.

[원칙]
1. 원문의 표현을 절대 직접 복사/번역하지 말고, 오직 '핵심 사실(Fact)'만 추출하여 흥미롭고 쉬운 한국어 문장으로 완전히 새롭게 재창작(Paraphrasing)하세요.
2. 카드뉴스는 총 4장의 슬라이드로 구성합니다.
   - 슬라이드 1: 어그로성/호기심 유발 헤드라인 제목 (짧고 강렬하게)
   - 슬라이드 2: 핵심 사실 및 내용 설명 1
   - 슬라이드 3: 핵심 사실 및 내용 설명 2
   - 슬라이드 4: 결론 + 강력한 프로필 링크 유도(CTA) 및 댓글 참여 유도 멘트
3. 배경 이미지 검색용 영문 단어 키워드 1개를 추출하세요 (예: space, galaxy, ocean, robot, brain).

[원문 정보]
제목: ${article.title}
내용: ${article.description}

[출력 형식]
반드시 다른 설명 없이 아래 JSON 규격으로만 응답하세요:
{
  "title": "카드뉴스 전체 대표 제목",
  "imageKeyword": "영문키워드",
  "slides": [
    "1번 슬라이드 문구 (제목)",
    "2번 슬라이드 문구 (본문1)",
    "3번 슬라이드 문구 (본문2)",
    "4번 슬라이드 문구 (CTA 및 댓글 유도)"
  ],
  "caption": "인스타그램 게시글에 들어갈 캡션 텍스트 (해시태그 포함)"
}
`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 오류 (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const parts = result.candidates?.[0]?.content?.parts || [];
  // 생각(thought) 부분을 제외한 실제 응답 텍스트 추출
  const targetPart = parts.find(p => !p.thought) || parts[parts.length - 1] || {};
  const textOutput = targetPart.text || '';

  
  // JSON 추출
  const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Gemini 응답에서 JSON 파싱 실패');
  }

  return JSON.parse(jsonMatch[0]);
}
