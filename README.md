# Toss Place MCP

Ask Codex about live Toss Place POS sales, orders, menu availability, tables, payments, and POS-tracked inventory.

Toss Place MCP is an open-source, self-hosted integration. A small plugin runs inside Toss POS and securely synchronizes readable POS data to your bridge. Codex connects through a standard local MCP process or the bridge's Streamable HTTP endpoint.

> [!IMPORTANT]
> This project integrates **Toss Place POS**, not Toss Payments. Toss Payments is a separate future provider with different APIs and authorization.

## What you can ask

- “How much did we sell tonight, excluding open tabs?”
- “What were our top drinks between 8 PM and midnight?”
- “Compare this Friday with last Friday.”
- “Show hourly sales and tell me when we should schedule another bartender.”
- “Which products are sold out or below 10 units?”
- “Break down card, cash, and external payments.”
- “Which tables currently have open checks?”
- “Give me the raw Toss order behind this number.”

The server provides both raw POS tools and opinionated analytics. Open checks are always reported separately from booked sales.

## How it works

```text
Toss POS plugin ──signed HTTPS──▶ self-hosted bridge + database
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
                 local stdio MCP          Streamable HTTP MCP
                         │                         │
                         └──────────▶ Codex ◀─────┘
```

This split matters when Toss POS runs on an iPad or store desktop and Codex runs on another computer. Docker is only a convenient way to deploy the bridge; it is not part of the MCP protocol and is not required for local development.

## Current platform status

- The data path is based on the Toss Place POS plugin SDK used successfully in a real desktop sandbox integration.
- The full desktop path—merchant activation, POS installation, one-time pairing, initial sync, and MCP sales/inventory queries—has been validated against a Toss test merchant on macOS.
- The SDK declares Windows, macOS, Android, and iOS device platforms. This project has **not yet validated the complete installation flow on an iPad Toss POS instance**.
- Self-hosted bridge domains generally need to be added to the Toss developer plugin's HTTP allowlist/ACL. This is the main manual onboarding step; Toss Place does not currently provide this integration as ordinary merchant OAuth.
- A merchant cannot currently install the GitHub repository into Toss POS by themselves. Someone with the required Toss developer-portal access must create/distribute the worker plugin, assign the terminal and merchant, and enter the service code on the POS. After that human installation, Codex can guide pairing and MCP setup.
- Inventory quantities are available only when the merchant enables Toss stock tracking for that catalog price. Otherwise, the MCP can report availability and sold-out state only.

## Requirements

- Node.js 22 or newer
- A stable HTTPS URL reachable from the Toss POS device for separated-device use
- Access to create or install a Toss Place developer plugin
- Docker and Docker Compose only if you choose container deployment

## Quick start

### 1. Clone and initialize

```bash
git clone https://github.com/danyay/toss-place-mcp.git
cd toss-place-mcp
npm install
npm run build:all
node dist/cli.js init
```

The generated `.env` is mode `0600` and ignored by Git. Set `TOSS_MCP_PUBLIC_URL` to the stable HTTPS URL that the POS device can reach.

### 2. Start the bridge

Locally:

```bash
npm run bridge
```

Or with Docker:

```bash
docker compose up -d --build
```

Before installing the POS plugin, give the bridge a stable HTTPS hostname. The recommended path is Docker plus Caddy; a persistent Cloudflare Tunnel is useful behind NAT. Follow [docs/deployment.md](docs/deployment.md) for DNS, firewall, Caddyfile, tunnel, verification, and restart instructions. Do not send pairing or POS traffic over public plain HTTP.

### 3. Build and install the Toss POS plugin

```bash
npm run build:plugin
npm run zip --workspace plugin
```

The upload artifact is `plugin/place-mcp-bridge.zip`, with the Toss entrypoint at `dist/main.js` inside the ZIP.

This section requires a person with Toss developer-portal access. In the Toss developer portal:

1. Create a POS worker plugin application with the `POS_BACKGROUND_WORKER` entrypoint. Keep its package ID consistent with the uploaded bundle (`place-mcp-bridge` for this repository).
2. Add your bridge origin, such as `https://toss-mcp.example.com`, to the application's HTTP ACL/allowlist.
3. Upload `plugin/place-mcp-bridge.zip` to the development/test track, then distribute or deploy that version to the test track. Uploading alone is not enough.
4. Register the POS terminal under the application's test-terminal settings. Use the serial number shown in Toss POS under **Settings → POS information/software**.
5. Open **Test merchant management**, select the merchant, find **Place MCP Bridge** in the **Application** table, and toggle it **ON**. Confirm that Toss reports the update succeeded.
6. Fully quit and restart Toss POS.
7. In Toss POS, open **Settings → Service integration → Connect with service code**, enter the service code shown for the developer application, and confirm that **Place MCP Bridge** appears as **In use**.

Both test-terminal registration and the per-merchant **Application → ON** switch are required. Recognizing the service code does not mean the worker is authorized for that merchant. Only enable it for a merchant whose owner has approved the persistent read-only data connection.

See [docs/toss-developer-setup.md](docs/toss-developer-setup.md) for the full click-by-click checklist, expected result after each stage, failure diagnosis, and the limits of public merchant onboarding.

### 4. Pair the POS

With the bridge running:

```bash
npm run pair
```

Enter the displayed bridge URL and one-time code in the Toss POS plugin settings. The code expires after 15 minutes and can be used once. The resulting connection secret is stored in Toss secure storage; plugin requests are timestamped, nonce-protected, and HMAC-signed.

The fields are under **Settings → Service integration → Place MCP Bridge**. Save them, then fully restart Toss POS once so the background worker loads and performs its initial sync.

Verify the connection:

```bash
npm run doctor
```

The first connection backfills up to 90 days of orders. Large merchants can request other ranges later through the `refresh_pos_data` MCP tool.

### 5. Connect Codex

For a local stdio MCP server:

```bash
codex mcp add toss-place \
  --env TOSS_MCP_BRIDGE_URL=http://127.0.0.1:8787 \
  --env TOSS_MCP_ACCESS_TOKEN=YOUR_LOCAL_ENV_TOKEN \
  -- npx -y toss-place-mcp mcp
```

Until the package is published to npm, replace the command after `--` with the built repository path:

```bash
node /absolute/path/to/toss-place-mcp/dist/cli.js mcp
```

For remote Streamable HTTP, add this to `~/.codex/config.toml`:

```toml
[mcp_servers.toss_place]
url = "https://toss-mcp.example.com/mcp"
bearer_token_env_var = "TOSS_MCP_ACCESS_TOKEN"
default_tools_approval_mode = "writes"
```

Then export `TOSS_MCP_ACCESS_TOKEN` in the environment that launches Codex. Codex desktop, CLI, and IDE clients on the same host share this configuration. See the [official Codex MCP documentation](https://developers.openai.com/codex/mcp/).

## Give this repository to Codex

This is the intended non-developer onboarding experience:

> Install the Toss Place MCP server from this repository. Keep all credentials out of git. Deploy the bridge locally or with Docker, help me assign a stable HTTPS URL, build the Toss POS plugin ZIP, and stop when I need to approve or operate the Toss developer portal. Create a one-time pairing code, verify the POS is syncing, add the MCP to my Codex configuration, then show me today's booked sales separately from open checks.

Codex can perform the local installation and verification. A person must still complete Toss portal/device steps when the account requires them.

## MCP tools

| Tool                    | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `connection_status`     | Merchant, device, plugin version, and freshness                      |
| `get_pos_data`          | Raw merchant, device, category, catalog, option, hall, or table data |
| `inventory`             | Availability, sold-out state, and POS-tracked quantities             |
| `list_orders`           | Filtered raw orders, line items, discounts, and embedded payments    |
| `get_order`             | One complete Toss order                                              |
| `sales_summary`         | Booked sales, open checks, AOV, discount, tax, and tip totals        |
| `top_items`             | Item revenue, quantity, and order counts                             |
| `sales_timeseries`      | Hour, day, or weekday breakdown                                      |
| `payment_breakdown`     | Card, cash, external, barcode, and transfer totals                   |
| `compare_sales_periods` | Absolute and percentage period comparison                            |
| `refresh_pos_data`      | Queue a read-only snapshot or historical order refresh               |

The MCP also publishes `toss-place://capabilities` and `toss-place://data-dictionary` resources plus a `daily-sales-review` prompt.

This is **not every callable namespace in the Toss Place SDK**. It covers the read-only merchant data needed for common sales, order, payment, menu, table, and inventory analysis. KDS state, live draft orders, device/UI controls, and every mutation are excluded from v1. The [SDK coverage matrix](docs/api-coverage.md) distinguishes full, partial, internal, and unsupported surfaces.

## Safety model

This version is analytics-first and read-only. The underlying Toss SDK includes order, payment, cash-receipt, and draft-order mutations, but those are intentionally not exposed as MCP tools. Accidentally cancelling a live tab is not an acceptable default capability for a sales-analysis server.

- The bridge API and remote MCP require a long bearer token.
- POS sync requests use HMAC-SHA256, timestamps, and single-use nonces.
- Pairing codes are hashed, short-lived, and single-use.
- Secrets are excluded through `.gitignore`; examples contain placeholders only.
- The bridge binds to `127.0.0.1` by default.
- Logs do not intentionally include access tokens or plugin secrets.

Read [SECURITY.md](SECURITY.md) before exposing the bridge to the internet.

## Data and metrics

Default day boundaries use `Asia/Seoul`. “Booked sales” means the sum of Toss `chargePrice.chargePriceValue` for completed, non-cancelled orders. Current table checks are shown separately even if a tab was opened before the requested sales range; they are never counted as booked sales. Raw signed discount fields are preserved because refunds and reversals can affect their sign.

See [docs/api-coverage.md](docs/api-coverage.md) and [docs/architecture.md](docs/architecture.md).

## Database

SQLite is the default:

```dotenv
TOSS_MCP_DATABASE_URL=sqlite:./data/toss-place.sqlite
```

PostgreSQL uses the same repository:

```dotenv
TOSS_MCP_DATABASE_URL=postgresql://user:password@localhost:5432/toss_mcp
```

The database contains merchant sales data and encrypted-transport connection secrets. Protect it like other production POS data and back it up according to your own retention policy.

## Development

```bash
npm install
npm run check
npm run build:all
```

Tests use synthetic fixtures. Live integration credentials must be supplied only through ignored environment variables and are never required for the normal test suite.

The macOS sandbox test app and all local POS data are excluded from Git. Never copy a merchant bridge URL, access token, pairing code, database, or Toss POS application bundle into a commit.

## Roadmap

- Validate and document iPad deployment on a real merchant
- Toss-reviewed/published plugin onboarding, if the platform permits it
- Configurable retention and incremental long-range backfill checkpoints
- PostgreSQL integration testing in CI
- Optional OAuth for the remote MCP endpoint
- Separate Toss Payments provider
- Carefully gated operational tools only after an explicit approval and audit model exists

## License and trademarks

MIT. Toss and Toss Place are trademarks of their respective owners. This community project is not affiliated with or endorsed by Toss unless stated otherwise.

---

# Toss Place MCP

Codex에게 실시간 Toss Place POS 매출, 주문, 메뉴 판매 가능 여부, 테이블, 결제, POS에서 추적하는 재고를 질문할 수 있습니다.

Toss Place MCP는 오픈 소스 셀프 호스팅 통합 도구입니다. 작은 플러그인이 Toss POS 안에서 실행되며 읽을 수 있는 POS 데이터를 사용자의 브리지로 안전하게 동기화합니다. Codex는 표준 로컬 MCP 프로세스 또는 브리지의 Streamable HTTP 엔드포인트를 통해 연결됩니다.

> [!IMPORTANT]
> 이 프로젝트는 Toss Payments가 아니라 **Toss Place POS**를 연동합니다. Toss Payments는 API와 인증 방식이 다른 별도의 향후 공급자입니다.

## 질문할 수 있는 내용

- “미결제 주문을 제외하면 오늘 밤 매출이 얼마야?”
- “오후 8시부터 자정까지 가장 많이 팔린 주류는 뭐야?”
- “이번 주 금요일과 지난주 금요일을 비교해 줘.”
- “시간대별 매출을 보여주고 바텐더를 한 명 더 배치해야 할 시간을 알려줘.”
- “품절이거나 재고가 10개 미만인 상품은 뭐야?”
- “카드, 현금, 외부 결제 비중을 나눠서 보여줘.”
- “현재 미결제 주문이 있는 테이블은 어디야?”
- “이 수치의 근거가 된 원본 Toss 주문을 보여줘.”

서버는 원시 POS 도구와 기준이 명확한 분석 도구를 모두 제공합니다. 현재 미결제 주문은 항상 확정 매출과 별도로 보고합니다.

## 작동 방식

```text
Toss POS 플러그인 ──서명된 HTTPS──▶ 셀프 호스팅 브리지 + 데이터베이스
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                       로컬 stdio MCP             Streamable HTTP MCP
                              │                           │
                              └──────────▶ Codex ◀────────┘
```

Toss POS는 iPad 또는 매장 데스크톱에서 실행되고 Codex는 다른 컴퓨터에서 실행될 수 있으므로 이 분리가 중요합니다. Docker는 브리지를 편리하게 배포하는 방법일 뿐 MCP 프로토콜의 일부가 아니며 로컬 개발에 필수도 아닙니다.

## 현재 플랫폼 상태

- 실제 데스크톱 샌드박스 연동에 성공한 Toss Place POS 플러그인 SDK를 기반으로 데이터 경로를 구현했습니다.
- 가맹점 활성화, POS 설치, 일회성 페어링, 최초 동기화, MCP 매출/재고 조회를 포함한 전체 데스크톱 경로를 macOS의 Toss 테스트 가맹점에서 검증했습니다.
- SDK는 Windows, macOS, Android, iOS 장비 플랫폼을 선언합니다. 이 프로젝트는 **아직 iPad Toss POS에서 전체 설치 과정을 검증하지 않았습니다**.
- 일반적으로 셀프 호스팅 브리지 도메인을 Toss 개발자 플러그인의 HTTP 허용 목록/ACL에 추가해야 합니다. 이것이 가장 중요한 수동 온보딩 단계이며, Toss Place는 현재 이 연동을 일반적인 가맹점 OAuth로 제공하지 않습니다.
- 현재 가맹점이 GitHub 저장소만으로 Toss POS에 직접 설치할 수는 없습니다. 필요한 Toss 개발자 포털 권한을 가진 사람이 워커 플러그인을 생성/배포하고, 단말과 가맹점을 할당하고, POS에서 서비스 코드를 입력해야 합니다. 사람이 설치를 마치면 Codex가 페어링과 MCP 설정을 안내할 수 있습니다.
- 재고 수량은 가맹점이 해당 카탈로그 가격에 Toss 재고 추적을 활성화한 경우에만 제공됩니다. 그렇지 않으면 MCP는 판매 가능 여부와 품절 상태만 보고할 수 있습니다.

## 요구사항

- Node.js 22 이상
- POS와 브리지가 다른 장비에 있는 경우 Toss POS 장비에서 접근 가능한 안정적인 HTTPS URL
- Toss Place 개발자 플러그인을 만들거나 설치할 수 있는 권한
- 컨테이너 배포를 선택한 경우에만 Docker 및 Docker Compose

## 빠른 시작

### 1. 복제 및 초기화

```bash
git clone https://github.com/danyay/toss-place-mcp.git
cd toss-place-mcp
npm install
npm run build:all
node dist/cli.js init
```

생성된 `.env`는 권한 모드 `0600`이며 Git에서 무시됩니다. `TOSS_MCP_PUBLIC_URL`을 POS 장비에서 접근할 수 있는 안정적인 HTTPS URL로 설정하세요.

### 2. 브리지 시작

로컬 실행:

```bash
npm run bridge
```

Docker 실행:

```bash
docker compose up -d --build
```

POS 플러그인을 설치하기 전에 브리지에 안정적인 HTTPS 호스트명을 지정하세요. Docker와 Caddy 조합을 권장하며, NAT 뒤에서는 영구 Cloudflare Tunnel이 유용합니다. DNS, 방화벽, Caddyfile, 터널, 검증, 재시작 방법은 [docs/deployment.md](docs/deployment.md)를 따르세요. 페어링 또는 POS 트래픽을 공개 일반 HTTP로 전송하지 마세요.

### 3. Toss POS 플러그인 빌드 및 설치

```bash
npm run build:plugin
npm run zip --workspace plugin
```

업로드 파일은 `plugin/place-mcp-bridge.zip`이며 ZIP 안의 Toss 엔트리포인트는 `dist/main.js`입니다.

이 단계는 Toss 개발자 포털 권한을 가진 사람이 진행해야 합니다. Toss 개발자 포털에서 다음을 진행합니다.

1. `POS_BACKGROUND_WORKER` 엔트리포인트를 사용하는 POS 워커 플러그인 애플리케이션을 만듭니다. 패키지 ID가 업로드 번들과 일치해야 합니다. 이 저장소에서는 `place-mcp-bridge`입니다.
2. `https://toss-mcp.example.com`과 같은 브리지 origin을 애플리케이션 HTTP ACL/허용 목록에 추가합니다.
3. `plugin/place-mcp-bridge.zip`을 개발/테스트 트랙에 업로드한 뒤 해당 버전을 테스트 트랙에 배포합니다. 업로드만 해서는 충분하지 않습니다.
4. 애플리케이션의 테스트 단말 설정에 POS 단말을 등록합니다. Toss POS의 **설정 → POS 정보/소프트웨어**에 표시되는 일련번호를 사용합니다.
5. **테스트 가맹점 관리**를 열고 가맹점을 선택한 뒤 **애플리케이션** 표에서 **Place MCP Bridge**를 찾아 **ON**으로 전환합니다. Toss가 변경 성공을 표시하는지 확인합니다.
6. Toss POS를 완전히 종료하고 다시 시작합니다.
7. Toss POS에서 **설정 → 서비스 연동 → 서비스 코드로 연결**을 열고 개발자 애플리케이션의 서비스 코드를 입력한 뒤 **Place MCP Bridge**가 **사용 중**으로 표시되는지 확인합니다.

테스트 단말 등록과 가맹점별 **애플리케이션 → ON** 스위치가 모두 필요합니다. 서비스 코드를 인식한다고 해서 워커가 해당 가맹점에 승인된 것은 아닙니다. 지속적인 읽기 전용 데이터 연결을 가맹점주가 승인한 경우에만 활성화하세요.

전체 단계별 체크리스트, 각 단계의 예상 결과, 장애 진단, 일반 가맹점 온보딩의 제약은 [docs/toss-developer-setup.md](docs/toss-developer-setup.md)를 참고하세요.

### 4. POS 페어링

브리지가 실행 중인 상태에서 다음을 실행합니다.

```bash
npm run pair
```

표시된 브리지 URL과 일회용 코드를 Toss POS 플러그인 설정에 입력합니다. 코드는 15분 후 만료되며 한 번만 사용할 수 있습니다. 생성된 연결 비밀키는 Toss 보안 저장소에 저장됩니다. 플러그인 요청에는 타임스탬프와 재사용 방지 nonce가 포함되고 HMAC으로 서명됩니다.

입력 필드는 **설정 → 서비스 연동 → Place MCP Bridge**에 있습니다. 저장한 뒤 Toss POS를 완전히 한 번 재시작하여 백그라운드 워커가 로드되고 최초 동기화를 수행하게 합니다.

연결을 확인합니다.

```bash
npm run doctor
```

최초 연결은 최대 90일의 주문을 백필합니다. 대규모 가맹점은 나중에 `refresh_pos_data` MCP 도구로 다른 기간을 요청할 수 있습니다.

### 5. Codex 연결

로컬 stdio MCP 서버:

```bash
codex mcp add toss-place \
  --env TOSS_MCP_BRIDGE_URL=http://127.0.0.1:8787 \
  --env TOSS_MCP_ACCESS_TOKEN=YOUR_LOCAL_ENV_TOKEN \
  -- npx -y toss-place-mcp mcp
```

패키지가 npm에 공개되기 전에는 `--` 뒤의 명령을 빌드된 저장소 경로로 바꾸세요.

```bash
node /absolute/path/to/toss-place-mcp/dist/cli.js mcp
```

원격 Streamable HTTP를 사용하려면 `~/.codex/config.toml`에 다음을 추가합니다.

```toml
[mcp_servers.toss_place]
url = "https://toss-mcp.example.com/mcp"
bearer_token_env_var = "TOSS_MCP_ACCESS_TOKEN"
default_tools_approval_mode = "writes"
```

그런 다음 Codex를 실행하는 환경에 `TOSS_MCP_ACCESS_TOKEN`을 내보냅니다. 같은 호스트의 Codex 데스크톱, CLI, IDE 클라이언트는 이 설정을 공유합니다. [공식 Codex MCP 문서](https://developers.openai.com/codex/mcp/)를 참고하세요.

## 이 저장소를 Codex에 맡기기

다음은 개발자가 아닌 사용자를 위해 의도한 온보딩 방식입니다.

> 이 저장소에서 Toss Place MCP 서버를 설치해 줘. 모든 자격 증명은 Git에 포함하지 마. 브리지를 로컬 또는 Docker로 배포하고, 안정적인 HTTPS URL을 지정하도록 도와주고, Toss POS 플러그인 ZIP을 빌드해 줘. 내가 Toss 개발자 포털에서 승인하거나 직접 조작해야 하는 단계에서는 멈춰 줘. 일회용 페어링 코드를 생성하고 POS가 동기화되는지 확인한 뒤 MCP를 내 Codex 설정에 추가해 줘. 마지막으로 오늘 확정 매출과 현재 미결제 주문을 나눠서 보여줘.

Codex는 로컬 설치와 검증을 수행할 수 있습니다. 계정에서 요구하는 Toss 포털 및 장비 단계는 사람이 직접 완료해야 합니다.

## MCP 도구

| 도구                    | 용도                                                               |
| ----------------------- | ------------------------------------------------------------------ |
| `connection_status`     | 가맹점, 장비, 플러그인 버전, 데이터 최신성                         |
| `get_pos_data`          | 원시 가맹점, 장비, 카테고리, 카탈로그, 옵션, 홀 또는 테이블 데이터 |
| `inventory`             | 판매 가능 상태, 품절 상태, POS 추적 재고 수량                      |
| `list_orders`           | 필터링된 원시 주문, 품목, 할인, 포함된 결제                        |
| `get_order`             | 하나의 완전한 Toss 주문                                            |
| `sales_summary`         | 확정 매출, 미결제 주문, 평균 객단가, 할인, 세금, 팁 합계           |
| `top_items`             | 품목별 매출, 수량, 주문 수                                         |
| `sales_timeseries`      | 시간/일/요일별 분석                                                |
| `payment_breakdown`     | 카드, 현금, 외부, 바코드, 계좌이체 결제 합계                       |
| `compare_sales_periods` | 기간별 절대값 및 백분율 비교                                       |
| `refresh_pos_data`      | 읽기 전용 스냅샷 또는 과거 주문 갱신 요청                          |

MCP는 `toss-place://capabilities`, `toss-place://data-dictionary` 리소스와 `daily-sales-review` 프롬프트도 제공합니다.

이 프로젝트는 **Toss Place SDK에서 호출할 수 있는 모든 네임스페이스를 제공하지 않습니다**. 일반적인 매출, 주문, 결제, 메뉴, 테이블, 재고 분석에 필요한 읽기 전용 가맹점 데이터를 지원합니다. KDS 상태, 실시간 임시 주문, 장비/UI 제어, 모든 데이터 변경 기능은 v1에서 제외합니다. [SDK 지원 범위 표](docs/api-coverage.md)에서 전체 지원, 일부 지원, 내부 사용, 미지원 표면을 구분합니다.

## 안전 모델

이 버전은 분석 우선의 읽기 전용 서비스입니다. Toss SDK에는 주문, 결제, 현금영수증, 임시 주문 변경 기능이 있지만 MCP 도구로 의도적으로 노출하지 않습니다. 매출 분석 서버가 실수로 실제 미결제 주문을 취소할 수 있어서는 안 됩니다.

- 브리지 API와 원격 MCP는 긴 Bearer 토큰을 요구합니다.
- POS 동기화 요청은 HMAC-SHA256, 타임스탬프, 일회용 nonce를 사용합니다.
- 페어링 코드는 해시되어 저장되고 수명이 짧으며 한 번만 사용할 수 있습니다.
- 비밀정보는 `.gitignore`를 통해 제외되며 예제에는 자리표시자만 들어 있습니다.
- 브리지는 기본적으로 `127.0.0.1`에 바인딩됩니다.
- 로그에는 액세스 토큰이나 플러그인 비밀키를 의도적으로 기록하지 않습니다.

브리지를 인터넷에 공개하기 전에 [SECURITY.md](SECURITY.md)를 읽으세요.

## 데이터 및 지표

기본 일자 경계는 `Asia/Seoul` 시간대를 사용합니다. “확정 매출”은 완료되고 취소되지 않은 주문의 Toss `chargePrice.chargePriceValue` 합계입니다. 현재 테이블 주문이 요청한 매출 기간보다 먼저 시작되었더라도 별도로 표시하며 확정 매출에 포함하지 않습니다. 환불과 취소 처리가 부호에 영향을 줄 수 있으므로 원시 할인 필드의 부호를 보존합니다.

[docs/api-coverage.md](docs/api-coverage.md)와 [docs/architecture.md](docs/architecture.md)를 참고하세요.

## 데이터베이스

기본 데이터베이스는 SQLite입니다.

```dotenv
TOSS_MCP_DATABASE_URL=sqlite:./data/toss-place.sqlite
```

동일한 저장소에서 PostgreSQL도 사용할 수 있습니다.

```dotenv
TOSS_MCP_DATABASE_URL=postgresql://user:password@localhost:5432/toss_mcp
```

데이터베이스에는 가맹점 매출 데이터와 암호화된 전송 연결 비밀키가 들어 있습니다. 다른 운영 POS 데이터와 동일하게 보호하고 자체 보존 정책에 따라 백업하세요.

## 개발

```bash
npm install
npm run check
npm run build:all
```

테스트는 합성 픽스처를 사용합니다. 실제 통합 자격 증명은 Git에서 무시되는 환경 변수로만 제공해야 하며 일반 테스트 스위트에는 필요하지 않습니다.

macOS 샌드박스 테스트 앱과 모든 로컬 POS 데이터는 Git에서 제외됩니다. 가맹점 브리지 URL, 액세스 토큰, 페어링 코드, 데이터베이스, Toss POS 애플리케이션 번들을 커밋에 복사하지 마세요.

## 로드맵

- 실제 가맹점에서 iPad 배포 검증 및 문서화
- 플랫폼이 허용하는 경우 Toss 검토/공개 플러그인 온보딩
- 설정 가능한 보존 기간 및 증분 장기 백필 체크포인트
- CI에서 PostgreSQL 통합 테스트
- 원격 MCP 엔드포인트의 선택적 OAuth
- 별도의 Toss Payments 공급자
- 명시적 승인 및 감사 모델이 준비된 후에만 신중하게 제한된 운영 도구 제공

## 라이선스 및 상표

MIT 라이선스입니다. Toss 및 Toss Place는 각 소유자의 상표입니다. 별도 명시가 없는 한 이 커뮤니티 프로젝트는 Toss와 제휴 관계가 없으며 Toss의 보증을 받지 않습니다.
