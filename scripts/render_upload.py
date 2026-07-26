import os
import sys
import json
import time
import requests
from PIL import Image, ImageDraw, ImageFont

# 표준 출력 인코딩 안전화
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')


# 1. OFL 상업용 무료 폰트 (나눔고딕 / Pretendard) 다운로드
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

# 2. Pillow 기반 카드뉴스 슬라이드 합성 (1080x1080)
def generate_slides(slides_text, bg_image_url):
    download_font()
    
    # 배경 이미지 가져오기
    print(f"[INFO] Downloading background image: {bg_image_url}")
    bg_res = requests.get(bg_image_url, stream=True)
    bg_img = Image.open(bg_res.raw).convert("RGBA").resize((1080, 1080))
    
    generated_files = []
    try:
        font = ImageFont.truetype(FONT_PATH, 42)
        page_font = ImageFont.truetype(FONT_PATH, 24)
    except Exception as e:
        print(f"[WARNING] Loading font failed ({e}), using load_default()")
        font = ImageFont.load_default()
        page_font = ImageFont.load_default()

    
    for idx, text in enumerate(slides_text):
        img = bg_img.copy()
        
        # 가독성을 위한 반투명 검은색 오버레이 레이어 (Black Overlay Layer)
        overlay = Image.new("RGBA", (1080, 1080), (0, 0, 0, 140))
        img = Image.alpha_composite(img, overlay)
        
        draw = ImageDraw.Draw(img)
        
        # 텍스트 줄바꿈 가공
        lines = []
        words = text.split(' ')
        current_line = ""
        for word in words:
            test_line = f"{current_line} {word}".strip()
            bbox = font.getbbox(test_line)
            if bbox[2] - bbox[0] <= 880:  # 패딩 영역 확보
                current_line = test_line
            else:
                lines.append(current_line)
                current_line = word
        if current_line:
            lines.append(current_line)
            
        full_text = "\n".join(lines)
        
        # 중앙 배치 계산
        text_bbox = draw.textbbox((0, 0), full_text, font=font, spacing=15)
        text_w = text_bbox[2] - text_bbox[0]
        text_h = text_bbox[3] - text_bbox[1]
        
        x = (1080 - text_w) / 2
        y = (1080 - text_h) / 2
        
        # 카드뉴스 텍스트 그리기
        draw.multiline_text((x, y), full_text, fill=(255, 255, 255), font=font, align="center", spacing=15)
        
        # 슬라이드 번호 표시
        page_str = f"{idx + 1} / {len(slides_text)}"
        draw.text((512, 1010), page_str, fill=(200, 200, 200), font=page_font)

        # 이미지 파일 저장
        filename = f"slide_{idx + 1}.jpg"
        img.convert("RGB").save(filename, "JPEG", quality=95)
        generated_files.append(filename)
        print(f"[INFO] Saved slide {idx + 1}: {filename}")
        
    # 슬라이드들을 Gemma가 정해준 제목의 PDF 문서로 결합
    custom_name = os.getenv("CUSTOM_FILE_NAME", "cardnews")
    pdf_path = f"{custom_name}.pdf"
    if generated_files:
        img_objs = [Image.open(f).convert("RGB") for f in generated_files]
        img_objs[0].save(pdf_path, save_all=True, append_images=img_objs[1:])
        print(f"[SUCCESS] PDF generated with Gemma title: {pdf_path}")


    return generated_files, pdf_path


# 3. 텔레그램으로 이미지 슬라이드 및 PDF 파일 직접 전송
def send_results_to_telegram(image_paths, pdf_path, caption):
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    
    if not bot_token or not chat_id:
        print("[NOTICE] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set.")
        return

    print("[INFO] Sending rendered images and PDF to Telegram...")

    # A. 각 카드뉴스 슬라이드 이미지 전송 (sendPhoto)
    for idx, img_path in enumerate(image_paths):
        with open(img_path, "rb") as photo:
            url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
            requests.post(url, data={
                "chat_id": chat_id,
                "caption": f"📌 카드뉴스 슬라이드 {idx + 1}/{len(image_paths)}"
            }, files={"photo": photo})

    # B. 전체 PDF 문서 전송 (sendDocument)
    if os.path.exists(pdf_path):
        with open(pdf_path, "rb") as doc:
            url = f"https://api.telegram.org/bot{bot_token}/sendDocument"
            requests.post(url, data={
                "chat_id": chat_id,
                "caption": f"📄 **[카드뉴스 전체 PDF 다운로드]**\n\n{caption}"
            }, files={"document": doc})
            print("[SUCCESS] PDF sent to Telegram successfully!")

if __name__ == "__main__":
    try:
        payload_raw = os.getenv("CLIENT_PAYLOAD", "{}")
        try:
            payload = json.loads(payload_raw) if payload_raw else {}
        except Exception:
            payload = {}

        slides = payload.get("slides") or [
            "이색 과학 뉴스 #1",
            "우주 탐사선이 외계 신호를 감지했습니다.",
            "자세한 사항은 연구소 발표를 확인하세요.",
            "👉 프로필 링크에서 전문을 확인하고 댓글로 의견을 남겨주세요!"
        ]
        caption = payload.get("caption", "이색 과학 알림봇 #과학 #카드뉴스 #자동화")
        bg_image_url = payload.get("imageUrl", "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1080&auto=format&fit=crop")
        file_name = payload.get("fileName", "cardnews")
        os.environ["CUSTOM_FILE_NAME"] = file_name

        # 렌더링 및 텔레그램으로 이미지 & PDF 직접 전송
        image_files, pdf_file = generate_slides(slides, bg_image_url)
        send_results_to_telegram(image_files, pdf_file, caption)
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



