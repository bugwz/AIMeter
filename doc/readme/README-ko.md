# AIMeter

AIMeter는 여러 AI provider의 사용량, quota, 이력 데이터를 한 화면에서 추적할 수 있는 self-hosted 대시보드입니다.

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [**한국어**](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## 주요 기능

- 다중 provider 통합 대시보드
- provider 설정 및 자격 증명 관리
- 사용량 이력 및 차트 보기
- endpoint 및 widget 관련 페이지
- `node` 실행 모드에서 자동 예약 갱신
- 로컬 개발 및 데모용 mock 모드
- 저장소 백엔드: SQLite, PostgreSQL, MySQL
- 환경 변수 우선 구성 모델

## 지원 Provider

현재 어댑터 목록:

- Aliyun
- Claude
- Codex
- Kimi
- MiniMax
- z.ai
- Copilot
- OpenRouter
- Ollama
- OpenCode
- Cursor

## 기술 스택

- 프론트엔드: React 18, TypeScript, Vite, Tailwind CSS
- 백엔드: Node.js, Express, TypeScript
- 데이터베이스: better-sqlite3, pg, mysql2

## 프로젝트 구조

```text
.
├─ src/                 # 프론트엔드 앱
├─ server/              # 백엔드 API, 인증, 작업, 저장소
├─ doc/                 # 설계 문서, provider 예시, 다국어 문서
├─ config.example.yaml  # 전체 구성 템플릿
└─ .env.example         # 환경 변수 템플릿
```

## 빠른 시작

### 1. 의존성 설치

```bash
npm install
```

### 2. 구성 준비

```bash
cp .env.example .env
cp config.example.yaml config.yaml
```

배포 환경에 맞게 `config.yaml` 및/또는 `.env`를 수정하세요.

### 3. 프론트엔드 + 백엔드 실행

```bash
npm run dev:all
```

기본 로컬 엔드포인트:

- 프론트엔드: `http://localhost:3000`
- 백엔드: `http://localhost:3001`

## 주요 스크립트

```bash
npm run dev            # 프론트엔드만 실행
npm run start:server   # 백엔드만 실행
npm run dev:all        # 프론트엔드 + 백엔드
npm run dev:mock:all   # 프론트엔드 + 백엔드 (mock 모드)
npm run build          # 타입 검사 + 프론트엔드 빌드
npm run preview        # 프로덕션 빌드 미리보기
```

## 구성 모델

우선순위:

1. 환경 변수(`.env`)
2. `config.yaml`
3. 내장 기본값

핵심 영역:

- `server`: API URL, 프론트엔드/백엔드 포트, CORS, trust proxy
- `runtime`: `node` 또는 `serverless`, mock 스위치
- `database`: 엔진, DSN/경로, 암호화 키
- `auth`: 세션 시크릿, 쿠키 옵션, rate limit, bootstrap/admin 시크릿
- `providers`: provider 목록 (데이터베이스 모드 비활성화 시 사용)

## 런타임 모드

- `node`: 주기적 갱신을 위한 프로세스 내 스케줄러를 시작합니다.
- `serverless`: 스케줄러를 비활성화하고 요청 기반으로 갱신합니다.

## 데이터베이스 엔진

AIMeter 지원 엔진:

- SQLite (기본값)
- PostgreSQL
- MySQL



## 보안 참고

프로덕션 배포 시 권장 사항:

- 세션/암호화 시크릿에 강력한 값을 사용하세요.
- HTTPS 환경에서 secure cookie를 활성화하세요.
- CORS origin을 제한하세요.
- bootstrap/admin/cron 시크릿을 안전하게 보관하세요.
