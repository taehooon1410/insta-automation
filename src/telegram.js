/**
 * 텔레그램 승인 알림 봇 연동 모듈
 */

// 1. 관리자 텔레그램 채널로 생성된 콘텐츠 승인 요청 전송
export async function sendTelegramApproval({ title, slides, caption, imageUrl, fileName, articleLink, articleSource, articleSummary, botToken, chatId }) {
  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const slidePreview = slides.map((s, i) => `📌 **[슬라이드 ${i + 1}]**\n${s}`).join('\n\n');
  
  let sourceText = '';
  if (articleLink) {
    sourceText = `\n🔗 **원문 기사 출처**: [${articleSource || '기사 출처 링크 보기'}](${articleLink})`;
  }
  let summaryText = '';
  if (articleSummary) {
    summaryText = `\n📜 **원문 기사 요약 전문**:\n> ${articleSummary.slice(0, 300)}...`;
  }

  const messageText = `🚀 **[인스타 카드뉴스 생성 완료 - 승인 요청]**\n\n` +
    `📖 **제목**: ${title}\n` +
    `📁 **Gemma 지정 파일명**: \`${fileName}.pdf\`\n` +
    `${sourceText}${summaryText}\n\n` +
    `${slidePreview}\n\n` +
    `📝 **인스타 캡션**:\n${caption}\n\n` +
    `💬 *'👉 댓글에서 전문을 확인해 보세요' 멘트가 4번 슬라이드와 캡션에 기본 적용되었습니다.*`;


  // 승인 데이터 유지를 위해 인코딩
  const payloadData = JSON.stringify({ slides, caption, imageUrl, fileName });

  const encodedPayload = btoa(encodeURIComponent(payloadData)).replace(/=/g, '').slice(0, 60); // 텔레그램 callback_data 길이 제한 호환


  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ 게시 승인 (업로드)', callback_data: 'approve_now' },
        { text: '❌ 거절 (취소)', callback_data: 'reject_post' }
      ]
    ]
  };


  const response = await fetch(telegramUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: messageText,
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`텔레그램 전송 실패: ${err}`);
  }

  return await response.json();
}

// 2. 텔레그램 메세지 수정 (실시간 진행 상황 업데이트용)
export async function editTelegramMessage(chatId, messageId, text, botToken) {
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'Markdown'
    })
  });
}

// 3. 텔레그램 메세지 신규 전송
export async function sendTelegramMessage(chatId, text, botToken) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    })
  });
  return await res.json();
}

// 4. 텔레그램 콜백 응답 (승인 알림 메시지 업데이트)
export async function answerCallbackQuery(callbackQueryId, text, botToken) {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text,
      show_alert: true
    })
  });
}

