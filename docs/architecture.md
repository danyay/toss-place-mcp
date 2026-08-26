# Architecture

## Components

### Toss POS plugin

The worker plugin is the only component that talks to `@tossplace/pos-plugin-sdk`. It reads merchant/device identity, categories, catalog, stock metadata, options, halls, tables, and orders. It listens for order/payment/catalog/table changes and periodically refreshes recent data.

The plugin never opens the merchant's MCP bearer token. Pairing returns a separate connection ID and HMAC secret stored with `posPluginSdk.secureStore`.

### Bridge

The bridge receives signed plugin data, normalizes searchable order metadata, and preserves complete Toss objects as JSON. It supports SQLite and PostgreSQL through one repository abstraction.

The same process exposes:

- authenticated data endpoints used by the local stdio MCP process;
- a bearer-protected, stateless Streamable HTTP MCP endpoint at `/mcp`;
- management endpoints for short-lived pairing codes;
- signed plugin sync and command endpoints.

### MCP server

Both transports instantiate the same tools, resources, instructions, and prompts. The MCP layer contains metric definitions rather than relying on each model to reinvent accounting semantics.

## Data flow

1. The bridge creates a hashed, expiring pairing code.
2. The plugin presents the code with merchant/device identity.
3. The bridge consumes the code and returns a random connection ID/secret.
4. The plugin stores them in Toss secure storage.
5. Plugin requests sign `timestamp.nonce.rawBody` with HMAC-SHA256.
6. The bridge rejects stale timestamps, reused nonces, unknown connections, or merchant mismatches.
7. Codex reads the bridge with a separate bearer token.

## Freshness

- Initial pairing: up to 90 days of orders plus a complete operational snapshot.
- Order/payment changes: event-driven single-order updates.
- Catalog/table changes: debounced complete operational snapshot.
- Periodic: two-day order refresh and complete snapshot every five minutes.
- Historical requests: asynchronous `orders.sync` commands polled by the POS plugin.

If the POS device is offline, no server can make local SDK data real-time. MCP instructions require checking `connection_status` before analysis.

## Provider boundary

Toss Place POS is the only v1 provider. A future Toss Payments adapter should produce a separate payment-domain model rather than pretending a payment gateway transaction is the same as a POS order. Cross-provider reconciliation belongs above both adapters.

---

# 아키텍처

## 구성요소

### Toss POS 플러그인

워커 플러그인은 `@tossplace/pos-plugin-sdk`와 통신하는 유일한 구성요소입니다. 가맹점 및 장비 정보, 카테고리, 카탈로그, 재고 메타데이터, 옵션, 홀, 테이블, 주문을 읽습니다. 주문, 결제, 카탈로그, 테이블 변경 이벤트를 수신하고 최근 데이터를 주기적으로 새로 고칩니다.

플러그인은 가맹점의 MCP Bearer 토큰에 접근하지 않습니다. 페어링이 완료되면 별도의 연결 ID와 HMAC 비밀키를 받으며, 이 값은 `posPluginSdk.secureStore`에 저장됩니다.

### 브리지

브리지는 서명된 플러그인 데이터를 수신하고, 검색 가능한 주문 메타데이터를 정규화하며, 완전한 Toss 객체를 JSON으로 보존합니다. 하나의 저장소 추상화를 통해 SQLite와 PostgreSQL을 지원합니다.

동일한 프로세스가 다음 기능을 제공합니다.

- 로컬 stdio MCP 프로세스가 사용하는 인증된 데이터 엔드포인트
- `/mcp`에 있는 Bearer 토큰 보호 방식의 무상태 Streamable HTTP MCP 엔드포인트
- 수명이 짧은 페어링 코드를 위한 관리 엔드포인트
- 서명된 플러그인 동기화 및 명령 엔드포인트

### MCP 서버

두 전송 방식은 동일한 도구, 리소스, 지침, 프롬프트를 생성합니다. MCP 계층은 각 모델이 회계 기준을 임의로 다시 정의하지 않도록 지표 정의를 포함합니다.

## 데이터 흐름

1. 브리지가 해시되어 저장되는 만료형 페어링 코드를 생성합니다.
2. 플러그인이 가맹점 및 장비 정보와 함께 코드를 제출합니다.
3. 브리지가 코드를 한 번 사용 처리하고 임의의 연결 ID와 비밀키를 반환합니다.
4. 플러그인이 이 값을 Toss 보안 저장소에 보관합니다.
5. 플러그인 요청은 `timestamp.nonce.rawBody`를 HMAC-SHA256으로 서명합니다.
6. 브리지는 오래된 타임스탬프, 재사용된 nonce, 알 수 없는 연결 또는 가맹점 불일치를 거부합니다.
7. Codex는 별도의 Bearer 토큰으로 브리지를 읽습니다.

## 데이터 최신성

- 최초 페어링: 최대 90일의 주문과 전체 운영 스냅샷
- 주문/결제 변경: 이벤트 기반 단일 주문 갱신
- 카탈로그/테이블 변경: 디바운스된 전체 운영 스냅샷
- 주기적 갱신: 최근 2일 주문과 전체 스냅샷을 5분마다 갱신
- 과거 데이터 요청: POS 플러그인이 폴링하는 비동기 `orders.sync` 명령

POS 장비가 오프라인이면 어떤 서버도 로컬 SDK 데이터를 실시간으로 만들 수 없습니다. MCP 지침은 분석 전에 `connection_status`를 확인하도록 요구합니다.

## 공급자 경계

v1의 유일한 공급자는 Toss Place POS입니다. 향후 Toss Payments 어댑터는 결제 게이트웨이 거래를 POS 주문과 동일한 것으로 간주하지 말고 별도의 결제 도메인 모델을 생성해야 합니다. 공급자 간 대사는 두 어댑터의 상위 계층에서 처리해야 합니다.
