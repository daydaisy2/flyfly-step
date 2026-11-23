# 📄 세은 한글·PDF

아래한글(`.hwpx`·`.hwp`)과 PDF를 폰에서 바로 열어 보고, **PDF로 저장·인쇄**하거나 **PDF를 `.hwpx`로 변환**하는 개인용 웹앱입니다.
모든 파일은 **서버로 보내지 않고 이 기기(브라우저) 안에서만** 처리합니다.

- 주소: https://daydaisy2.github.io/flyfly-step/hangul-pdf/
- 입장 잠금: 6자리 비밀번호(`261213`), `?relock=1`로 다시 잠금
- 검색 노출 차단: `noindex, nofollow` 메타 + `robots.txt`
- 홈 화면 설치(PWA): `manifest.webmanifest`(portrait, `start_url`·`scope` = `./`), `sw.js` 캐시 `seeun-hangul-pdf-v1`

## 기능

| 구분 | 내용 |
| :--- | :--- |
| 파일 열기 | 끌어다 놓기 · 파일 선택 (`.hwpx`, `.hwp`, `.pdf`) |
| `.hwpx` 보기 | ZIP + XML(OWPML) 파싱 → 문단·표(병합 셀)·그림·글자 크기/색/정렬 그대로 렌더링 |
| `.hwp` 보기 | OLE2(CFB) + zlib 레코드 파싱 → `BodyText/Section*`의 문단·텍스트 추출 (암호 걸린 파일은 안내) |
| 한글 → PDF | `window.print()` + `@media print` 전용 조판 → 브라우저의 **PDF로 저장 / 인쇄** |
| PDF 보기 | pdf.js로 쪽별 캔버스 렌더링 + 글자 추출(한국어 CMap 포함) |
| PDF → `.hwpx` | 추출한 줄을 표준 OWPML 패키지로 조립해 내려받기 (쪽 나눔 유지, 제목은 큰 글자로) |
| 그 밖에 | 확대/맞춤, 안드로이드 뒤로가기로 문서·메모 닫기, 📝 수정 요청 메모장 |

## 파일 구조

```
hangul-pdf/
  index.html            화면(잠금 · 홈 · 문서 보기 · 메모장)
  styles.css            노란 바탕·흰 카드·진남색 포인트 (인쇄 스타일 포함)
  app.js                잠금, 파일 받기, hwpx/hwp/pdf 파싱·렌더링, 변환, 인쇄
  hwpx-template.js      PDF→.hwpx 변환용 표준 OWPML 템플릿(약 7KB, base64)
  libs/                 jszip · pako · cfb · pdf.js(3.11.174) + 한국어 CMap
  manifest.webmanifest  PWA 설정(portrait)
  sw.js                 오프라인 캐시(seeun-hangul-pdf-v1)
  icon-*.png            홈 화면 아이콘(192/512, maskable 포함)
  robots.txt            검색 차단
```

## 쓰는 라이브러리

| 라이브러리 | 버전 | 용도 | 라이선스 |
| :--- | :--- | :--- | :--- |
| JSZip | 3.10.1 | `.hwpx`(ZIP) 읽기·쓰기 | MIT |
| pako | 2.1.0 | `.hwp` 압축(zlib/deflate) 풀기 | MIT |
| cfb | 1.2.2 | `.hwp`(OLE2 복합 파일) 읽기 | Apache-2.0 |
| pdf.js | 3.11.174 | PDF 렌더링·글자 추출 | Apache-2.0 |

`hwpx-template.js`의 템플릿은 표준 OWPML(한글 5.1) 문서로, 제목용 글자 모양(`charPr` 7, 16pt 굵게)만 추가해 두었습니다.
변환할 때 이 템플릿의 `Contents/section0.xml`만 새 문단으로 바꾸고 `mimetype`을 첫 항목·무압축으로 다시 묶습니다.

## 알려진 제약

- **스캔 PDF**(글자 없이 그림만 있는 PDF)는 `.hwpx`로 바꿀 내용이 없습니다 → 화면에 안내를 띄우고 변환 버튼을 끕니다.
- 구형 `.hwp`는 글자 중심으로 보여 줍니다. 표·그림 배치는 일부 다를 수 있고, HWP 3.0 시절 옛 글자(PUA)는 네모로 보일 수 있습니다.
- `.hwpx`는 한 쪽짜리 긴 종이로 이어서 보여 줍니다(쪽 나눔 위치는 인쇄할 때 A4로 다시 나뉩니다).
- 파일은 60MB까지, 한 번에 한 개씩 엽니다.

## 검증(2026-11-24)

- 로컬·라이브에서 PIN 입력 → 홈 → `.hwpx`(표·그림) / 실제 한글 저장 문서(시험지 234문단·표 16개) / 구형 `.hwp`(26문단) / 암호 걸린 `.hwp` 안내 / PDF 2쪽 → `.hwpx` 변환 다운로드까지 확인, 콘솔 오류 0건.
- 변환 결과물은 `python-hwpx` 검증기로 패키지 오류 0건, 다시 열어 문단 텍스트 일치 확인.
- 인쇄(PDF 저장) 결과: A4 1쪽(한글 문서) / 2쪽(PDF), 화면 버튼·머리글은 인쇄물에 나오지 않음.
