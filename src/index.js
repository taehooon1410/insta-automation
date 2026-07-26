import { fetchRSS } from './rss.js';
import { generateCardNewsContent } from './gemini.js';
import { getUnsplashImage } from './unsplash.js';
import { sendTelegramApproval, answerCallbackQuery } from './telegram.js';

export default {
// 1. Cron Trigger (자동 정기 실행)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAutomationPipeline(env).catch(async (err) => {
      await sendTelegramMessage(env.TELEGRAM_CHAT_ID, `🚨 **[자동화 파이프라인 에러 발생]**\n\n\`\`\`\n${err.stack || err.message}\n\`\`\``, env.TELEGRAM_BOT_TOKEN);
    }));
  },

  // 2. HTTP Endpoint (수동 실행 & 텔레그램 Webhook & 테스트)
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // [텔레그램 서버 직접 테스트 전송] -> GET /test-telegram
    if (url.pathname === '/test-telegram') {
      const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: '🚀 [Cloudflare Worker 백엔드 테스트 성공]\n서버리스 백엔드가 정상 가동 중입니다!'
        })
      });
      return new Response(await res.text(), { headers: { 'Content-Type': 'application/json' } });
    }

    // [수동 파이프라인 트리거] -> GET /trigger
    if (url.pathname === '/trigger') {
      try {
        const result = await runAutomationPipeline(env);
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        await sendTelegramMessage(env.TELEGRAM_CHAT_ID, `⚠️ **[수동 실행 오류]**\n\n${err.message}`, env.TELEGRAM_BOT_TOKEN);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // [텔레그램 Webhook 수신] -> POST /telegram-webhook
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        
        // 1. 일반 메세지 / 명령어 처리 ("만들기", /generate, /status, /help)
        if (update.message && update.message.text) {
          const chatId = update.message.chat.id;
          const text = update.message.text.trim();

          if (text.includes('만들기') || text === '/generate' || text === '/start') {
            const statusMsg = await sendTelegramMessage(chatId, "🚀 **[인스타그램 카드뉴스 자동 생성 시작]**\n\n⏳ [1/4] 해외 과학 RSS 뉴스 파싱 중...", env.TELEGRAM_BOT_TOKEN);
            const msgId = statusMsg.result?.message_id;

            try {
              const onProgress = async (stepText) => {
                if (msgId) {
                  await editTelegramMessage(chatId, msgId, `🚀 **[인스타그램 카드뉴스 자동 생성]**\n\n${stepText}`, env.TELEGRAM_BOT_TOKEN);
                }
              };

              await runAutomationPipeline(env, onProgress);
            } catch (pipelineErr) {
              await sendTelegramMessage(chatId, `🚨 **[카드뉴스 생성 중 에러 발생]**\n\n오류 내용:\n\`\`\`\n${pipelineErr.stack || pipelineErr.message}\n\`\`\``, env.TELEGRAM_BOT_TOKEN);
              if (msgId) {
                await editTelegramMessage(chatId, msgId, `❌ **[생성 실패]**\n\n오류: ${pipelineErr.message}`, env.TELEGRAM_BOT_TOKEN);
              }
            }
          } else if (text === '/status') {
            await sendTelegramMessage(chatId, "📊 **[시스템 상태 정보]**\n\n• 백엔드: Cloudflare Worker (정상)\n• 스케줄러: 매일 09시 / 18시\n• AI 모델: Gemini 2.0 Flash + Gemma 4 31B IT\n• 이미지: Unsplash API", env.TELEGRAM_BOT_TOKEN);
          } else if (text === '/help') {
            await sendTelegramMessage(chatId, "💡 **[텔레그램 봇 명령어 가이드]**\n\n• `만들기` 또는 `/generate` : 카드뉴스 제작 파이프라인 즉시 실행\n• `/status` : 시스템 상태 및 Cron 스케줄 확인\n• `/help` : 도움말 보기", env.TELEGRAM_BOT_TOKEN);
          }
          return new Response('OK');
        }

        // 2. 콜백 쿼리 (승인 / 거절 버튼)
        if (update.callback_query) {
          const cb = update.callback_query;
          const data = cb.data;

          if (data.startsWith('approve_')) {
            await answerCallbackQuery(cb.id, '✅ 승인되었습니다! GitHub Actions 카드뉴스 렌더링 & PDF 전송을 시작합니다.', env.TELEGRAM_BOT_TOKEN);

            const payloadData = {
              slides: env.LAST_SLIDES ? JSON.parse(env.LAST_SLIDES) : [],
              caption: env.LAST_CAPTION || '',
              imageUrl: env.LAST_IMAGE_URL || ''
            };

            if (env.GITHUB_REPO && env.GH_PAT) {
              await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${env.GH_PAT}`,
                  'User-Agent': 'Cloudflare-Worker-AutoInsta',
                  'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                  event_type: 'trigger_render_upload',
                  client_payload: payloadData
                })
              });
            }
          } else if (data === 'reject_post') {
            await answerCallbackQuery(cb.id, '❌ 포스팅이 거절되었습니다.', env.TELEGRAM_BOT_TOKEN);
          }
        }

        return new Response('OK');
      } catch (err) {
        await sendTelegramMessage(env.TELEGRAM_CHAT_ID, `🚨 **[Webhook 오류 발생]**\n\n${err.stack || err.message}`, env.TELEGRAM_BOT_TOKEN);
        return new Response(`Webhook Error: ${err.message}`, { status: 500 });
      }
    }

    return new Response('🚀 Cloudflare Pages/Worker 인스타그램 자동화 중앙 컨트롤러 작동 중');
  }
};


/**
 * 자동화 파이프라인 실행 코어 로직
 */
async function runAutomationPipeline(env, onProgress = null) {
  // Step 1: 해외 RSS 피드 정보 수집
  if (onProgress) await onProgress("⏳ [1/4] 해외 RSS 기사를 수집하는 중...");
  const rssItems = await fetchRSS(env.RSS_FEED_URL);
  if (!rssItems || rssItems.length === 0) {
    throw new Error('수집된 RSS 기사가 없습니다.');
  }
  const targetArticle = rssItems[Math.floor(Math.random() * rssItems.length)];

  // Step 2: Gemini API를 통한 한국어 100% 재창작(Paraphrasing) 카드뉴스 구성
  if (onProgress) await onProgress("🤖 [2/4] Gemini 2.0 AI가 한국어로 카드뉴스를 재창작(Paraphrasing)하는 중...");
  const cardNews = await generateCardNewsContent(targetArticle, env.GEMINI_API_KEY);

  // Step 3: Unsplash API 상업용 무료 배경 이미지 추출
  if (onProgress) await onProgress("🖼 [3/4] Unsplash CC0 무료 고화질 배경 이미지를 추출하는 중...");
  const bgImageUrl = await getUnsplashImage(cardNews.imageKeyword, env.UNSPLASH_ACCESS_KEY);

  // Step 4: 텔레그램 봇 승인 요청 발송
  if (onProgress) await onProgress("✅ [4/4] 카드뉴스 작성이 완료되었습니다! 최종 승인 요청을 전송합니다.");
  const telegramRes = await sendTelegramApproval({
    title: cardNews.title,
    slides: cardNews.slides,
    caption: cardNews.caption,
    imageUrl: bgImageUrl,
    fileName: cardNews.fileName || 'cardnews',
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID
  });


  return {
    title: cardNews.title,
    slidesCount: cardNews.slides.length,
    imageUrl: bgImageUrl,
    telegramStatus: telegramRes.ok
  };
}

