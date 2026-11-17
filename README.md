# 리훨 임챌 👣

훨훨처럼 살고 싶은 부부의 **지역별 임장노트** PWA.
유튜브 브리핑 → 임장 루트 → 입지 요약 → 단지별 카드 → 인터뷰·총평 순서로 기록하고,
링크로 공유하면 누구나 **읽기 전용**으로 볼 수 있습니다.

## 두 가지 모드

| 모드 | 설명 |
| --- | --- |
| 보기(공개) | 링크를 연 누구나 지역·단지·인터뷰 기록을 읽기만 합니다. 추가·수정·삭제 버튼이 없습니다. |
| 기록(편집) | 오른쪽 위 🔒 를 눌러 6자리 비밀번호를 넣으면 ✏️ 로 바뀌고, 지역·단지·체크리스트를 직접 고칠 수 있습니다. |

- 잠금 해제 상태는 브라우저 `localStorage` 에 기억되어 다음 방문부터 바로 편집됩니다.
- ✏️ 를 다시 누르면 잠깁니다.
- 비밀번호는 앱 안에 평문으로 들어 있지 않고 SHA-256 해시로만 비교합니다. (클라이언트 잠금이라
  화면의 버튼을 숨기는 용도이며, 서버 권한을 나누는 장치는 아닙니다.)

## 데이터

- 저장 위치: Firebase Realtime Database `rooms/imchall-public-v1`
  (`https://bubulife-678ac-default-rtdb.firebaseio.com/rooms/imchall-public-v1.json`)
- 앱을 열면 한 번 읽고, 이후 저장할 때마다 해당 지역 노드만 `PUT`/`DELETE` 합니다.
- 다른 기기에서 고친 내용은 REST 스트리밍(EventSource)으로 받아오고, 연결이 안 되면
  15초 주기로 다시 읽습니다.
- 마지막으로 받은 내용은 `localStorage` 에 남겨, 오프라인에서도 그 화면이 열립니다.

### 구조

```json
{
  "meta": { "title": "리훨 임챌", "tagline": "…" },
  "checklist": { "pre-1": "2026-11-15" },
  "regions": {
    "<id>": {
      "name": "하남 미사강변", "date": "2026-11-15", "status": "done|plan", "stars": 4,
      "tagline": "한 줄 총평",
      "summary": { "complex": "", "price": "", "gap": "" },
      "yt": { "title": "", "url": "", "watched": "", "points": [{ "k": "", "v": "" }] },
      "route": { "line": "", "map": "", "steps": [{ "place": "", "how": "", "memo": "" }], "notes": "" },
      "place": { "transport": "", "school": "", "market": "", "redev": "", "impression": "" },
      "complexes": [{ "name": "", "households": "", "built": "", "parking": "", "area": "", "far": "",
                      "peak": "", "deal": "", "asking": "", "jeonse": "", "memo": "" }],
      "talk": { "owner": [{ "q": "", "a": "", "m": "" }],
                "resident": [{ "who": "", "q": "", "a": "" }],
                "verdict": { "line": "", "good": [], "bad": [], "rank": "", "next": "" } }
    }
  }
}
```

## 파일

| 파일 | 설명 |
| --- | --- |
| `index.html` | 앱 전체 (화면 + 잠금 + Firebase 동기화). 외부 라이브러리 없음 |
| `manifest.webmanifest` | 홈 화면 설치 정보 |
| `sw.js` | 오프라인 캐시 (Firebase 통신은 캐시하지 않음) |
| `icon-*.png` | 아이콘 4종 (192/512, maskable) — 노란 바탕 + 흰 카드 + 👣 |
| `robots.txt` | 검색 노출 차단 |

## 배포

정적 호스팅(GitHub Pages 등)에 그대로 올리면 됩니다. HTTPS 에서 열어야 잠금 해제
(WebCrypto)와 서비스워커가 동작합니다.

검색에 노출하고 싶다면 `robots.txt` 의 `Disallow: /` 를 지우고,
`index.html` 의 `<meta name="robots">` 는 원래 들어 있지 않습니다.
