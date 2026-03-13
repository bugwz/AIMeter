<div align="center">

<img src="../../public/img/logo-light.svg" width="80" height="80" align="center" alt="AIMeter logo">

# AIMeter

AIMeter는 AI provider 사용량, quota, 이력 추세를 추적하는 self-hosted 대시보드입니다.

</div>

<div align="center">

[![React](https://img.shields.io/badge/React-Frontend-61dafb?logo=react&logoColor=white)](#기술-스택)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express)](#기술-스택)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](#기술-스택)
[![Runtime](https://img.shields.io/badge/Runtime-Node%20%7C%20Serverless-22c55e)](#런타임-모드)
[![Providers](https://img.shields.io/badge/Providers-Multi-0ea5e9)](#지원-provider)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](../../deploy/vercel/README.md)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare-f38020?logo=cloudflare&logoColor=white)](../../deploy/cloudflare/README.md)

</div>

<div align="center">

[English](../../README.md) | [简体中文](README-zh-CN.md) | [繁體中文](README-zh-TW.md) | [日本語](README-ja.md) | [Français](README-fr.md) | [Deutsch](README-de.md) | [Español](README-es.md) | [Português](README-pt.md) | [Русский](README-ru.md) | [**한국어**](README-ko.md)

</div>

<div align="center">
  <img src="../img/dashboard.png" alt="AIMeter dashboard" width="100%" />
</div>

## 주요 기능

- React 프론트엔드 대시보드
- Express 백엔드 API
- 다중 provider 어댑터 아키텍처
- 런타임 모드: `node`, `serverless`
- 데이터베이스 기반 저장소 및 bootstrap 흐름
- 여러 AI provider를 위한 통합 대시보드
- provider 자격 증명 관리 및 quota 표시
- 사용량 이력 및 차트 페이지
- endpoint/proxy 관련 API 페이지
- bootstrap + admin 라우트 초기화 플로우
- DB 엔진 지원: `sqlite`, `d1`, `postgres`, `mysql`

## 지원 Provider

<div align="center">
<table>
  <tr>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/aliyun.svg" alt="Aliyun" width="40" height="40" style="object-fit: contain;" /><br />
      Aliyun
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/antigravity.svg" alt="Antigravity" width="40" height="40" style="object-fit: contain;" /><br />
      Antigravity
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/claude.svg" alt="Claude" width="40" height="40" style="object-fit: contain;" /><br />
      Claude
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/codex.svg" alt="Codex" width="40" height="40" style="object-fit: contain;" /><br />
      Codex
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/kimi.svg" alt="Kimi" width="40" height="40" style="object-fit: contain;" /><br />
      Kimi
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/minimax.svg" alt="MiniMax" width="40" height="40" style="object-fit: contain;" /><br />
      MiniMax
    </td>
  </tr>
  <tr>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/zai.svg" alt="z.ai" width="40" height="40" style="object-fit: contain;" /><br />
      z.ai
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/copilot.svg" alt="Copilot" width="40" height="40" style="object-fit: contain;" /><br />
      Copilot
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/openrouter.svg" alt="OpenRouter" width="40" height="40" style="object-fit: contain;" /><br />
      OpenRouter
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/ollama.svg" alt="Ollama" width="40" height="40" style="object-fit: contain;" /><br />
      Ollama
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/opencode.svg" alt="OpenCode" width="40" height="40" style="object-fit: contain;" /><br />
      OpenCode
    </td>
    <td align="center" valign="middle" width="140" height="110">
      <img src="../../public/providers/cursor.svg" alt="Cursor" width="40" height="40" style="object-fit: contain;" /><br />
      Cursor
    </td>
  </tr>
</table>
</div>
provider별 예제 및 통합 노트: [doc/providers](../providers)

## 기술 스택

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Node.js, Express, TypeScript
- Storage: SQLite / Cloudflare D1 / PostgreSQL / MySQL

## 프로젝트 구조

```text
.
├─ src/                  # 프론트엔드 앱
├─ server/               # 백엔드 API, 인증, 작업, 저장소
├─ deploy/               # 플랫폼별 배포 가이드
├─ doc/                  # API 문서, provider 예제, 번역, 설정 문서
├─ config.all.yaml       # 전체 구성 템플릿
├─ config.yaml           # 활성 로컬 구성(복사해서 생성)
└─ .env.all              # 전체 환경 변수 템플릿
```

## 빠른 시작

### 1. 설치

```bash
npm install
```

### 2. 구성

```bash
cp .env.all .env
cp config.all.yaml config.yaml
```

이후 배포 대상에 맞게 `.env` 및/또는 `config.yaml`을 수정하세요.

### 3. 실행

```bash
npm run dev:all
```

기본 로컬 엔드포인트:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## 스크립트

```bash
npm run dev            # 프론트엔드만
npm run start:server   # 백엔드만
npm run dev:all        # 프론트엔드 + 백엔드
npm run dev:mock:all   # 프론트엔드 + 백엔드 (mock 모드)
npm run build          # 타입 검사 및 프론트엔드 빌드
npm run preview        # 프론트엔드 빌드 미리보기
npm run cf:dev         # Cloudflare Workers 로컬 개발
npm run cf:deploy      # Cloudflare Workers 배포
```

## 구성

현재 구현의 구성 소스 및 우선순위:

1. `config.yaml` (`AIMETER_CONFIG_FILE` 경로 지정 가능)
2. 환경 변수
3. 내장 기본값

중요 사항:

- `database.engine` / `AIMETER_DATABASE_ENGINE` 필수
- `database.connection` / `AIMETER_DATABASE_CONNECTION` 필수
- `serverless` 모드에서는 스케줄러 비활성화
- `node` 모드에서는 프로세스 내 스케줄러 자동 시작

필드 매핑 및 상세 설명:

- [doc/conf/README.md](../conf/README.md)

## 배포

지원 배포 모드 및 링크:

- [deploy/README.md](../../deploy/README.md)
- [deploy/container/README.md](../../deploy/container/README.md)
- [deploy/cloudflare/README.md](../../deploy/cloudflare/README.md)
- [deploy/vercel/README.md](../../deploy/vercel/README.md)

## API 문서

- [doc/api/README.md](../api/README.md)

## 보안 노트

- 데이터베이스 모드에서 세션 시크릿 및 암호화 관련 설정은 bootstrap 과정에서 시스템 저장소에 초기화되어 영속화됩니다.
- `AIMETER_CRON_SECRET` 및 `AIMETER_ENDPOINT_SECRET`는 선택적 통합 시크릿이며, 설정 시 32자 강랜덤 값을 사용하세요.
- 운영 환경에서는 `AIMETER_SERVER_PROTOCOL=https`를 설정해 더 엄격한 전송 보안 헤더를 활성화하세요.
