/**
 * Unsplash API를 통한 상업용 무료 CC0 배경 이미지 검색 및 다운로드 URL 확보
 */
export async function getUnsplashImage(keyword, accessKey) {
  if (!accessKey) {
    // 키가 없는 경우 고품질 기본 백그라운드 이미지 반환
    return 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1080&auto=format&fit=crop';
  }

  const query = encodeURIComponent(keyword || 'science');
  const url = `https://api.unsplash.com/photos/random?query=${query}&orientation=squarish&client_id=${accessKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unsplash API 오류: ${response.statusText}`);
    }

    const data = await response.json();
    // 1080x1080 규격에 맞는 직사각형/정사각형 고화질 URL 추출
    return data.urls?.regular || data.urls?.full || 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1080&auto=format&fit=crop';
  } catch (err) {
    console.error('Unsplash 이미지 가져오기 실패, 폴백 이미지 사용:', err.message);
    return 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1080&auto=format&fit=crop';
  }
}
