# 세은 독서 (library/)

양평도서관에서 읽고 싶은 책을 담아 두고, 다 읽은 책을 독서 기록으로 남기는 세은 님의 개인 웹앱.

- 라이브: `https://daydaisy2.github.io/flyfly-step/library/`
- 입장 잠금: 6자리 PIN (코드에는 SHA-256 해시만 있음, `LOCK_HASH`)
- 검색 차단: `noindex` 메타 + `robots.txt`

## 방(데이터) 연결

- 파이어베이스: `https://bubulife-678ac-default-rtdb.firebaseio.com/rooms/{room}/library/`
- 방 키는 **코드에 넣지 않는다.** `?room=...` 로 들어오면 `localStorage['seeun.library.room']` 에 저장해 다음부터 자동 연결.
- 방 키가 없으면 방 코드를 입력하는 화면(`#gate`)이 뜬다.
- 처음 쓰는 방은 초대 링크(`.../library/?room=방키`)로 열면 된다.

## 데이터 구조 (`library/` 노드)

```
books/{id}   = { title, author, cat, lib, section, callNo, regNo, status, checkedAt, memo, fav, read, readDate, created, updated }
records/{id} = { bookId, title, author, date, memo, rating(0~5), photo(dataURL), created }
notes/{id}   = { text, at }            // 📝 수정 요청 메모장
```

- `status`: `available`(대출가능) · `out`(대출중) · `ill`(상호대차) · `hope`(희망도서)
- `fav`: 0/1, `read`: 0/1 — `✓ 읽음`을 누르면 `records`에 기록을 만들고 `read`/`readDate`를 채운다.

## 화면 구성

- 상단: 제목 `📚 세은 독서` · 연결 상태 점 · `📝` 수정 요청 메모장 (헤더에 `＋ 추가` 없음)
- 검색창 아래 가로 꽉 차는 진남색 **`＋ 책 추가하기`** 버튼 하나로 책을 담는다.
- 바로가기 줄: `🏛 양평도서관` · `예스24` · `📮 희망도서 · 상호대차 신청`. 앞의 둘은 검색창에 적은 말로 바로 검색한다(비어 있으면 각 사이트 시작 페이지).
- 분류 필터 칩은 없다. `분야(cat)`는 저장만 되고 선택 사항(기본 `기타`)이다.
- 책 상세의 외부 보기 버튼은 `🏛 양평도서관에서 보기` · `🛒 예스24에서 보기` 두 개.

## 파일

| 파일 | 설명 |
| :--- | :--- |
| `index.html` | 앱 전체(스타일·로직 포함 단일 파일) |
| `manifest.webmanifest` | 홈 화면 설치용 (portrait, `start_url`/`scope` = `./`) |
| `sw.js` | 서비스워커. 캐시 이름 `seeun-library-vN` — **같은 도메인의 다른 앱 캐시는 건드리지 않는다** |
| `icon-*.png` | 앱 아이콘(192/512, maskable 포함) |
| `robots.txt` | 검색 로봇 차단 |

## 고칠 때

- 화면을 고치면 `sw.js`의 `CACHE` 번호를 올린다(`seeun-library-v1` → `v2`). HTML은 네트워크 우선이라 바로 반영되고, 정적 파일은 캐시가 갱신된다.
- `main`과 `gh-pages` **양쪽**의 `library/`에 같은 내용을 올린다(실제 서비스는 `gh-pages`).
- 루트(`리훨 임챌`)와 `mindset/`(훨훨 부자지도) 파일은 이 앱과 무관하므로 수정하지 않는다.
- 검증은 **임시 방**을 만들어 하고, 끝나면 `rooms/{임시방}`을 `DELETE` 로 지운다. 세은 님이 쓰는 실제 방은 열람·수정하지 않는다.
