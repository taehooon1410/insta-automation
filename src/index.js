import { fetchRSS } from './rss.js';
import { generateCardNewsContent } from './gemini.js';
import { getUnsplashImage } from './unsplash.js';
import { sendTelegramApproval, sendTelegramMessage, editTelegramMessage, answerCallbackQuery } from './telegram.js';


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
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
      }
    }

    // 텔레그램 Webhook 수신 -> POST /telegram-webhook
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        
        if (update && update.message) {
          const chatId = update.message.chat.id;
          const text = (update.message.text || '').trim().toLowerCase();

          if (text.includes('만들기') || text.includes('/generate') || text.includes('/start')) {
            ctx.waitUntil((async () => {
              const statusMsg = await sendTelegramMessage(chatId, "🚀 **[Cloudflare 백엔드] 인스타그램 카드뉴스 생성 시작**\n\n⏳ [1/4] 해외 과학 RSS 뉴스 파싱 중...", env.TELEGRAM_BOT_TOKEN);
              const msgId = statusMsg.result?.message_id;

              const onProgress = async (stepText) => {
                if (msgId) {
                  await editTelegramMessage(chatId, msgId, `🚀 **[Cloudflare 백엔드] 인스타그램 카드뉴스 생성**\n\n${stepText}`, env.TELEGRAM_BOT_TOKEN);
                }
              };

              try {
                const currentEnv = { ...env, TELEGRAM_CHAT_ID: String(chatId) };
                await runAutomationPipeline(currentEnv, onProgress);
              } catch (pipelineErr) {
                await sendTelegramMessage(chatId, `🚨 **[카드뉴스 생성 에러]**\n\n\`\`\`\n${pipelineErr.stack || pipelineErr.message}\n\`\`\``, env.TELEGRAM_BOT_TOKEN);
              }
            })());
          } else if (text.includes('/status')) {
            await sendTelegramMessage(chatId, "📊 **[시스템 상태 정보]**\n\n• 백엔드: Cloudflare Worker (정상 연동)\n• 스케줄러: 매일 09시 / 18시\n• AI 모델: Gemini 2.0 Flash + Gemma 4 31B IT\n• 이미지: Unsplash API", env.TELEGRAM_BOT_TOKEN);
          } else if (text.includes('/help')) {
            await sendTelegramMessage(chatId, "💡 **[텔레그램 봇 명령어 가이드]**\n\n• `만들기` 또는 `/generate` : 카드뉴스 제작 파이프라인 즉시 실행\n• `/status` : 시스템 상태 확인\n• `/help` : 도움말 보기", env.TELEGRAM_BOT_TOKEN);
          } else {
            await sendTelegramMessage(chatId, `🤖 **[Cloudflare Workers 클라우드 백엔드]**\n\n안녕하세요! **\`만들기\`** 또는 **\`/generate\`**를 입력하시면 카드뉴스가 자동 생성됩니다.`, env.TELEGRAM_BOT_TOKEN);
          }
        }

        if (update && update.callback_query) {
          const cb = update.callback_query;
          if (cb.data && cb.data.startsWith('approve_')) {
            await answerCallbackQuery(cb.id, '✅ 승인되었습니다! GitHub Actions에서 카드뉴스 PDF를 텔레그램으로 전송합니다.', env.TELEGRAM_BOT_TOKEN);
            
            if (env.GITHUB_REPO && env.GH_PAT) {
              await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${env.GH_PAT}`,
                  'User-Agent': 'Cloudflare-Worker',
                  'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                  event_type: 'trigger_render_upload',
                  client_payload: {}
                })
              });
            }
          }
        }

        return new Response('OK', { status: 200 });
      } catch (err) {
        console.error("Worker Webhook Error:", err);
        return new Response('OK', { status: 200 });
      }
    }


    return new Response('🚀 Cloudflare Worker 백엔드 작동 중');
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

  // Step 2: Gemini API & Cloudflare Workers AI를 통한 한국어 100% 재창작 카드뉴스 구성
  if (onProgress) await onProgress("🤖 [2/4] AI 엔진이 한국어로 카드뉴스를 재창작(Paraphrasing)하는 중...");
  const cardNews = await generateCardNewsContent(targetArticle, env.GEMINI_API_KEY, env.AI);


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

