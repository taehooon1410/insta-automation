# 🚀 Cloudflare Pages/Workers 기반 100% 무료 인스타그램 자동화 시스템

해외 이색 과학 커뮤니티/RSS 소스를 자동 수집하여 Gemini API로 한국어 카드뉴스 콘텐츠로 100% 저작권 안전 재창작(Paraphrasing)을 수행한 뒤, 텔레그램 승인 봇을 거쳐 무상 백엔드(GitHub Actions + Pillow)에서 렌더링 및 인스타그램에 포스팅하는 자동화 파이프라인 프로젝트입니다.

---

## 🏗 전체 시스템 아키텍처

```
[해외 RSS 소스]
       │
       ▼
[Cloudflare Workers/Pages (중앙 통제)] ──(Gemini API 패러프레이징 + Unsplash API 이미지)
       │
       ▼
[텔레그램 봇 승인 요청 (승인/거절)]
       │ (승인 버튼 클릭 시 GitHub Dispatch)
       ▼
[GitHub Actions (분산 백엔드)]
       │
       ├─► [Python Pillow] SIL OFL Pretendard 폰트 + 오버레이 카드뉴스 렌더링 (1080x1080)
       └─► [Meta Graph API] Instagram Carousel 자동 업로드
```

---

## 🛠️ 설정 및 설치 방법

### 1. 필수 시크릿 (Environment Variables / Secrets)

#### A. Cloudflare Workers / Pages 설정 (`wrangler secret put <KEY>`)
- `GEMINI_API_KEY`: Google AI Studio 무료 API 키
- `UNSPLASH_ACCESS_KEY`: Unsplash API Access Key
- `TELEGRAM_BOT_TOKEN`: 텔레그램 BotFather에서 생성한 토큰
- `TELEGRAM_CHAT_ID`: 알림을 수신할 Telegram Chat ID
- `GITHUB_REPO`: GitHub 레포지토리 (예: `username/insta-automation`)
- `GH_PAT`: Repository Dispatch 권한이 포함된 GitHub Personal Access Token

#### B. GitHub Actions Secrets 설정 (`Settings -> Secrets and variables -> Actions`)
- `META_ACCESS_TOKEN`: Meta for Developers 페이지에서 발급받은 인스타그램 Graph API 토큰
- `META_IG_USER_ID`: 인스타그램 비즈니스/크리에이터 계정 ID
- `IMGBB_API_KEY`: ImgBB 이미지 호스팅 API 키 (무료)

---

## 🚀 배포 방법

### 1. Cloudflare Worker 배포
```bash
npm install
npx wrangler deploy
```

### 2. 텔레그램 웹훅 등록 (Cloudflare Worker 배포 후 주소 연결)
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/telegram-webhook"
```

---

## ⚖️ 저작권 및 정책 준수
1. **문장 저작권**: 원문 복사/번역이 아닌, '사실(Fact)'만 추출하여 Gemini API를 활용해 100% 새로운 문장으로 재창작(Paraphrasing)합니다.
2. **폰트 저작권**: SIL OFL(Open Font License) 상업용 무료 라이선스를 준수하는 Pretendard 폰트를 적용합니다.
3. **이미지 저작권**: Unsplash 상업용 무료 API 사용 규정을 준수합니다.
