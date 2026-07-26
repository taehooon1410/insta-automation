/**
 * Gemini API & Gemma API 조합
 * - 내용 재창작: 고성능 Gemini API (gemini-2.0-flash)
 * - 파일명 및 제목 설정: 한도가 넉넉한 Google Gemma API (gemma-4-31b-it)
 */
export async function generateCardNewsContent(article, apiKey) {
  // 1. Gemma 모델로 적절한 파일명/제목 생성
  const gemmaEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${apiKey}`;
  const gemmaPrompt = `다음 기사 제목을 참고하여 텔레그램 PDF/이미지 저장을 위한 짧고 명확한 한글 파일명(제목) 1개를 추천해줘. 파일명에 특수문자 없이 띄어쓰기는 언더바(_)로 대체해서 오직 파일명 텍스트만 출력해줘.\n기사제목: ${article.title}`;

  let customFileName = "cardnews";
  try {
    const gemmaRes = await fetch(gemmaEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: gemmaPrompt }] }] })
    });
    if (gemmaRes.ok) {
      const gemmaData = await gemmaRes.json();
      const parts = gemmaData.candidates?.[0]?.content?.parts || [];
      const targetPart = parts.find(p => !p.thought) || parts[parts.length - 1] || {};
      const cleanName = (targetPart.text || '').trim().replace(/[^a-zA-Z0-9가-힣_]/g, '');
      if (cleanName) customFileName = cleanName;
    }
  } catch (err) {
    console.error("Gemma 파일명 생성 실패, 기본값 사용:", err.message);
  }

  // 2. Gemini 모델로 카드뉴스 고급 텍스트 생성
  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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

  const response = await fetch(geminiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
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
