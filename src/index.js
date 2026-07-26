import { fetchRSS } from './rss.js';
import { generateCardNewsContent } from './gemini.js';
import { getUnsplashImage } from './unsplash.js';
import { sendTelegramApproval, answerCallbackQuery } from './telegram.js';

export default {
  // 1. Cron Trigger (자동 정기 실행)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAutomationPipeline(env));
  },

  // 2. HTTP Endpoint (수동 실행 & 텔레그램 Webhook)
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // [수동 파이프라인 트리거] -> GET /trigger
    if (url.pathname === '/trigger') {
      try {
        const result = await runAutomationPipeline(env);
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // [텔레그램 승인 Webhook 수신] -> POST /telegram-webhook
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        
        if (update.callback_query) {
          const cb = update.callback_query;
          const data = cb.data;

          if (data.startsWith('approve_')) {
            // 텔레그램 사용자에게 승인 확인 알림 팝업
            await answerCallbackQuery(cb.id, '✅ 승인되었습니다! GitHub Actions 백분산 렌더링 & 인스타그램 업로드를 시작합니다.', env.TELEGRAM_BOT_TOKEN);

            // GitHub Repository Dispatch를 통한 파이프라인 트리거
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
        return new Response(`Webhook Error: ${err.message}`, { status: 500 });
      }
    }

    return new Response('🚀 Cloudflare Pages/Worker 인스타그램 자동화 중앙 컨트롤러 작동 중');
  }
};

/**
 * 자동화 파이프라인 실행 코어 로직
 */
async function runAutomationPipeline(env) {
  // Step 1: 해외 RSS 피드 정보 수집
  const rssItems = await fetchRSS(env.RSS_FEED_URL);
  if (!rssItems || rssItems.length === 0) {
    throw new Error('수집된 RSS 기사가 없습니다.');
  }

  // 랜덤 또는 최신 기사 선택
  const targetArticle = rssItems[0];

  // Step 2: Gemini API를 통한 한국어 100% 재창작(Paraphrasing) 카드뉴스 구성
  const cardNews = await generateCardNewsContent(targetArticle, env.GEMINI_API_KEY);

  // Step 3: Unsplash API 상업용 무료 배경 이미지 추출
  const bgImageUrl = await getUnsplashImage(cardNews.imageKeyword, env.UNSPLASH_ACCESS_KEY);

  // Step 4: 텔레그램 봇 승인 요청 발송
  const telegramRes = await sendTelegramApproval({
    title: cardNews.title,
    slides: cardNews.slides,
    caption: cardNews.caption,
    imageUrl: bgImageUrl,
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
