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

        
        output_name = f"slide_{idx + 1}.jpg"
        img.convert("RGB").save(output_name, "JPEG", quality=95)
        generated_files.append(output_name)
        print(f"[SUCCESS] Slide generated: {output_name}")
        
    return generated_files

# 3. Meta Graph API (Instagram Carousel) 자동 포스팅
def upload_to_instagram(image_paths, caption):
    access_token = os.getenv("META_ACCESS_TOKEN")
    ig_user_id = os.getenv("META_IG_USER_ID")
    host_server = os.getenv("IMAGE_HOST_SERVER", "https://imgbb.com") # 서빙용 호스트 URL
    
    if not access_token or not ig_user_id:
        print("[NOTICE] META_ACCESS_TOKEN or META_IG_USER_ID is not set. Generated slides locally.")
        return

    print("[INFO] Uploading slides to Instagram Carousel via Meta Graph API...")

    
    # 인스타그램 업로드를 위한 공개 이미지 URL 생성 및 아이템 컨테이너 생성
    item_container_ids = []
    
    for img_path in image_paths:
        # ImgBB 등 무상 이미지 호스팅 서비스로 업로드하여 공개 URL 확보
        with open(img_path, "rb") as file:
            res = requests.post("https://api.imgbb.com/1/upload", data={"key": os.getenv("IMGBB_API_KEY", "demo")}, files={"image": file})
            public_url = res.json()["data"]["url"]

        # 1) 단일 사진 컨테이너 생성
        container_url = f"https://graph.facebook.com/v18.0/{ig_user_id}/media"
        c_res = requests.post(container_url, data={
            "image_url": public_url,
            "is_carousel_item": "true",
            "access_token": access_token
        }).json()
        
        if "id" in c_res:
            item_container_ids.append(c_res["id"])
            print(f"✅ 슬라이드 컨테이너 생성 성공: {c_res['id']}")
        else:
            print(f"❌ 컨테이너 생성 실패: {c_res}")

    # 2) 카러셀 메인 컨테이너 생성
    carousel_url = f"https://graph.facebook.com/v18.0/{ig_user_id}/media"
    carousel_res = requests.post(carousel_url, data={
        "media_type": "CAROUSEL",
        "children": ",".join(item_container_ids),
        "caption": caption,
        "access_token": access_token
    }).json()

    carousel_id = carousel_res.get("id")
    if not carousel_id:
        print(f"❌ 카러셀 생성 실패: {carousel_res}")
        return

    # 3) 최종 게시물 게시 (Publish)
    publish_url = f"https://graph.facebook.com/v18.0/{ig_user_id}/media_publish"
    pub_res = requests.post(publish_url, data={
        "creation_id": carousel_id,
        "access_token": access_token
    }).json()

    print(f"🎉 인스타그램 자동 포스팅 완료! Post ID: {pub_res.get('id')}")

if __name__ == "__main__":
    payload_raw = os.getenv("CLIENT_PAYLOAD", "{}")
    payload = json.loads(payload_raw)

    slides = payload.get("slides", [
        "이색 과학 뉴스 #1",
        "우주 탐사선이 외계 신호를 감지했습니다.",
        "자세한 사항은 연구소 발표를 확인하세요.",
        "👉 프로필 링크에서 전문을 확인하고 댓글로 의견을 남겨주세요!"
    ])
    caption = payload.get("caption", "이색 과학 알림봇 #과학 #카드뉴스 #자동화")
    bg_image_url = payload.get("imageUrl", "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1080&auto=format&fit=crop")

    # 렌더링 및 업로드 수행
    image_files = generate_slides(slides, bg_image_url)
    upload_to_instagram(image_files, caption)
