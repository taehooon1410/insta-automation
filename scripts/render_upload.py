import os
import sys
import json
import time
import requests
from PIL import Image, ImageDraw, ImageFont

# 표준 출력 인코딩 안전화
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# 1. OFL 상업용 무료 폰트 다운로드
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Bold.ttf"
FONT_PATH = "NanumGothic-Bold.ttf"

def download_font():
    if not os.path.exists(FONT_PATH) or os.path.getsize(FONT_PATH) < 10000:
        print("[INFO] Downloading OFL free font...")
        res = requests.get(FONT_URL, allow_redirects=True)
        if res.status_code == 200:
            with open(FONT_PATH, "wb") as f:
                f.write(res.content)
            print("[SUCCESS] Font download completed.")

# 2. 고급스러운 Pillow 카드뉴스 슬라이드 디자인 렌더링 (1080x1080)
def generate_slides(slides_text, bg_image_url, article_title=""):
    download_font()
    
    print(f"[INFO] Downloading background image: {bg_image_url}")
    try:
        bg_res = requests.get(bg_image_url, stream=True, timeout=10)
        bg_img = Image.open(bg_res.raw).convert("RGBA").resize((1080, 1080))
    except Exception as e:
        print(f"[WARNING] Background image download failed ({e}), using fallback dark background.")
        bg_img = Image.new("RGBA", (1080, 1080), (20, 24, 33, 255))
    
    generated_files = []
    try:
        title_font = ImageFont.truetype(FONT_PATH, 28)
        content_font = ImageFont.truetype(FONT_PATH, 38)
        footer_font = ImageFont.truetype(FONT_PATH, 22)
    except Exception:
        title_font = ImageFont.load_default()
        content_font = ImageFont.load_default()
        footer_font = ImageFont.load_default()

    for idx, text in enumerate(slides_text):
        img = bg_img.copy()
        
        # 1) 고급스러운 반투명 검은색 딤 오버레이 Layer
        overlay = Image.new("RGBA", (1080, 1080), (0, 0, 0, 160))
        img = Image.alpha_composite(img, overlay)
        
        draw = ImageDraw.Draw(img)
        
        # 2) 카드 배경 박스 (Center Card Container)
        card_rect = [90, 120, 990, 960]
        draw.rounded_rectangle(card_rect, radius=24, fill=(25, 30, 42, 220), outline=(255, 255, 255, 40), width=2)
        
        # 3) 상단 모던 뱃지 태그 Header
        badge_text = "💡 SCIENCE & TECH NEWS" if idx > 0 else "🔥 DAILY ISSUE HIGHLIGHT"
        draw.rounded_rectangle([130, 150, 480, 195], radius=12, fill=(67, 97, 238, 240))
        draw.text((150, 162), badge_text, fill=(255, 255, 255), font=footer_font)

        # 4) 텍스트 줄바꿈 자동 계산
        lines = []
        raw_lines = text.split('\n')
        for raw_line in raw_lines:
            words = raw_line.split(' ')
            current_line = ""
            for word in words:
                test_line = f"{current_line} {word}".strip()
                bbox = content_font.getbbox(test_line)
                if bbox[2] - bbox[0] <= 780:  # 카드 내부 너비 860px 고려
                    current_line = test_line
                else:
                    lines.append(current_line)
                    current_line = word
            if current_line:
                lines.append(current_line)
            
        full_text = "\n".join(lines)
        
        # 5) 카드 내 중앙 텍스트 배치
        text_bbox = draw.multiline_textbbox((0, 0), full_text, font=content_font, spacing=18)
        text_w = text_bbox[2] - text_bbox[0]
        text_h = text_bbox[3] - text_bbox[1]
        
        x = (1080 - text_w) / 2
        y = 230 + (680 - text_h) / 2
        
        # 본문 텍스트 출력
        draw.multiline_text((x, y), full_text, fill=(255, 255, 255), font=content_font, align="center", spacing=18)
        
        # 6) 하단 프로필/출처 유도 안내 Footer
        footer_note = "👉 댓글에서 기사 전문 확인 가능 | 텔레그램에서 상세 출처 제공"
        draw.text((130, 905), footer_note, fill=(180, 190, 210), font=footer_font)
        
        # 7) 슬라이드 페이지 인디케이터
        page_str = f"{idx + 1} / {len(slides_text)}"
        draw.text((910, 905), page_str, fill=(255, 255, 255), font=footer_font)

        # 이미지 파일 저장
        filename = f"slide_{idx + 1}.jpg"
        img.convert("RGB").save(filename, "JPEG", quality=95)
        generated_files.append(filename)
        print(f"[INFO] Saved slide {idx + 1}: {filename}")
        
    # PDF 결합
    custom_name = os.getenv("CUSTOM_FILE_NAME", "cardnews")
    pdf_path = f"{custom_name}.pdf"
    if generated_files:
        img_objs = [Image.open(f).convert("RGB") for f in generated_files]
        img_objs[0].save(pdf_path, save_all=True, append_images=img_objs[1:])
        print(f"[SUCCESS] PDF generated: {pdf_path}")

    return generated_files, pdf_path

# 3. 텔레그램으로 슬라이드, PDF, 원문 기사 요약 및 출처 링크 전송
def send_results_to_telegram(image_paths, pdf_path, caption, article_link="", article_source="", article_summary=""):
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    
    if not bot_token or not chat_id:
        print("[NOTICE] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set.")
        return

    print("[INFO] Sending rendered images, PDF, and source details to Telegram...")

    # A. 개별 슬라이드 전송
    for idx, img_path in enumerate(image_paths):
        with open(img_path, "rb") as photo:
            url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
            requests.post(url, data={
                "chat_id": chat_id,
                "caption": f"📌 카드뉴스 슬라이드 {idx + 1}/{len(image_paths)}"
            }, files={"photo": photo})

    # B. 전체 PDF 문서 및 원문 출처/요약 전문 전송 (sendDocument)
    if os.path.exists(pdf_path):
        source_info = f"\n\n🔗 **원문 기사 출처 링크**:\n{article_link}" if article_link else ""
        summary_info = f"\n\n📜 **기사 원문 요약 전문**:\n{article_summary}" if article_summary else ""
        
        caption_full = f"📄 **[카드뉴스 전체 PDF 다운로드]**\n\n{caption}{source_info}{summary_info}\n\n💬 *댓글에서 기사 전문을 확인할 수 있습니다.*"

        with open(pdf_path, "rb") as doc:
            url = f"https://api.telegram.org/bot{bot_token}/sendDocument"
            requests.post(url, data={
                "chat_id": chat_id,
                "caption": caption_full[:1000],  # 텔레그램 캡션 길 제한 안전화
                "parse_mode": "Markdown"
            }, files={"document": doc})
            print("[SUCCESS] PDF and source details sent to Telegram successfully!")

if __name__ == "__main__":
    try:
        payload_raw = os.getenv("CLIENT_PAYLOAD", "{}")
        try:
            payload = json.loads(payload_raw) if payload_raw and payload_raw != "null" else {}
        except Exception:
            payload = {}
            
        if not isinstance(payload, dict):
            payload = {}

        slides = payload.get("slides") or [
            "📢 최신 이색 과학 이슈",
            "📌 우주 탐사선이 외계 신호를 감지했습니다.\n연구팀은 이번 발견이 지구 외 생명체 탐사에 큰 전환점이 될 것으로 전망하고 있습니다.",
            "💡 발견의 주요 의미:\n기존 연구 방식에서 벗어난 새로운 분석 기술이 적용되어 신호의 규칙성을 입증했습니다.",
            "👉 댓글에서 기사 전문을 확인해 보세요!\n상세 자료 출처 및 전문은 텔레그램 채널에서 보실 수 있습니다."
        ]
        caption = payload.get("caption", "이색 과학 알림봇 #과학 #카드뉴스 #자동화")
        bg_image_url = payload.get("imageUrl", "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1080&auto=format&fit=crop")
        file_name = payload.get("fileName", "cardnews")
        article_link = payload.get("articleLink", "")
        article_source = payload.get("articleSource", "")
        article_summary = payload.get("articleSummary", "")
        
        os.environ["CUSTOM_FILE_NAME"] = file_name

        image_files, pdf_file = generate_slides(slides, bg_image_url)
        send_results_to_telegram(image_files, pdf_file, caption, article_link, article_source, article_summary)
    except Exception as e:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
        chat_id = os.getenv("TELEGRAM_CHAT_ID")
        if bot_token and chat_id:
            requests.post(f"https://api.telegram.org/bot{bot_token}/sendMessage", data={
                "chat_id": chat_id,
                "text": f"🚨 **[GitHub Actions 렌더링 파이프라인 에러]**\n\n```\n{str(e)}\n```",
                "parse_mode": "Markdown"
            })
        sys.exit(1)
