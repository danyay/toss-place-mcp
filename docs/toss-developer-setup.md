# Install the Toss POS plugin

This is the human-operated part of setup. Codex can build the ZIP, start the bridge, generate the pairing code, and run diagnostics, but it cannot approve Toss portal prompts or silently install an unpublished plugin for a merchant.

Portal labels can change. If the wording differs, preserve the technical requirements in this checklist and record the Toss POS version and a screenshot before asking Toss developer support.

## Access you need

Before starting, confirm that you have:

- access to the Toss developer portal and permission to create or manage a Toss Place POS application;
- a Toss test merchant (for initial testing) or an approved distribution path for the target merchant;
- physical or remote access to the target Toss POS device;
- the merchant owner's approval for the persistent read-only sync;
- a stable public HTTPS bridge that passes the checks in [deployment.md](deployment.md).

> [!IMPORTANT]
> GitHub access alone is not enough to install this integration into Toss POS. The current flow uses a Toss POS developer plugin, not merchant OAuth. For arbitrary bars to self-install, this project will eventually need a Toss-approved/published distribution route or a separately operated onboarding service accepted by Toss.

## 1. Build and inspect the upload ZIP

From the repository root:

```bash
npm install
npm run build:plugin
npm run zip --workspace plugin
unzip -Z1 plugin/place-mcp-bridge.zip
```

Expected result: the artifact exists at `plugin/place-mcp-bridge.zip`, and the file listing includes `dist/main.js`. Upload the ZIP itself, not the `plugin/` directory and not the repository ZIP from GitHub.

## 2. Create the Toss Place developer application

In the Toss developer portal:

1. Create a new **Toss Place POS** application, or open the application dedicated to this deployment.
2. Select the worker/background-worker application type.
3. Set the entrypoint to `POS_BACKGROUND_WORKER`.
4. Set the package ID to `place-mcp-bridge`. If you intentionally fork and rename the package, the portal package ID and plugin bundle metadata must still match.
5. Save the application and copy its service code somewhere temporary. A service code is not a bridge credential and should not be committed.

Expected result: the application page identifies it as a POS background worker and shows a service code.

Do not reuse the same package identity for unrelated merchant integrations. Do not enable order/payment permissions merely because the SDK offers them; v1 is a read-only analytics integration.

## 3. Add the bridge to the HTTP ACL

Open the application's network or **HTTP ACL/allowlist** settings and add the exact origin from `.env`:

```text
https://toss-mcp.example.com
```

Use only `scheme://hostname` (and a port only if the public URL genuinely uses a nonstandard port). Do not include `/`, `/mcp`, `/v1`, a query string, or the private `127.0.0.1` address.

Expected result: the saved allowlist shows the same HTTPS origin as `TOSS_MCP_PUBLIC_URL`. Opening `https://toss-mcp.example.com/health` from the POS network succeeds without a certificate warning.

## 4. Upload and distribute a test version

1. Open the application's development/test version or deployment section.
2. Upload `plugin/place-mcp-bridge.zip`.
3. Wait for Toss to accept and process the bundle.
4. Explicitly **distribute**, **deploy**, or **release** that version to the development/test track.

Expected result: the version is shown as distributed/deployed on the test track. A successful upload by itself is not enough; the terminal cannot install a version that has not been distributed.

If Toss reports a missing entrypoint, inspect the ZIP again. It must contain `dist/main.js` at that path rather than a nested `place-mcp-bridge/dist/main.js`.

## 5. Register the target POS terminal

On the physical Toss POS device, open **Settings → POS information/software** and copy the serial number exactly.

Back in the developer portal:

1. Open the application's test-terminal settings.
2. Add that serial number.
3. Save and confirm it appears in the registered-terminal list.

Expected result: the currently running POS terminal serial is listed for the application. Registering the merchant without this terminal step is insufficient.

## 6. Enable the application for the merchant

In the developer portal:

1. Open **Test merchant management**.
2. Select the intended merchant and verify its name/merchant ID before changing anything.
3. Open the merchant's **Application** table.
4. Find **Place MCP Bridge** and toggle it **ON**.
5. Wait for and confirm Toss's success message.

Expected result: the application remains ON after refreshing the merchant page.

This merchant switch is separate from terminal registration and service-code entry. The POS may recognize a valid service code even when this switch is OFF, but the worker will not be authorized for the merchant.

## 7. Install the service on Toss POS

1. Fully quit Toss POS; do not only close a settings panel.
2. Reopen Toss POS and sign back into the intended merchant if required.
3. Open **Settings → Service integration → Connect with service code**.
4. Enter the service code from the developer application.
5. Approve the installation prompts shown by Toss POS or the operating system.
6. Confirm **Place MCP Bridge** appears in Service integration as **In use**.

Expected result: selecting **Place MCP Bridge** opens its settings fields. If the service name is recognized but connection fails before those fields appear, the failure is still in Toss's app assignment/install path; no bridge pairing request has occurred yet.

## 8. Pair the installed plugin

With the bridge running, generate a one-time code:

```bash
npm run pair
```

In **Settings → Service integration → Place MCP Bridge**:

1. Enter the public bridge URL printed by the command. It must be the allowed HTTPS URL, not `127.0.0.1`.
2. Enter the one-time pairing code.
3. Save.
4. Fully quit and restart Toss POS once more so the background worker loads with the stored secret.

The code expires after 15 minutes and works once. Generate a new code if it expires; do not put a pairing code or resulting secret in an issue, screenshot, or commit.

Expected result: the bridge receives a successful pair request and the plugin starts an initial snapshot/order sync.

## 9. Prove that the data is correct

Run:

```bash
npm run doctor
```

Then check all of the following before trusting analysis:

- the reported merchant name and ID are the intended merchant;
- device and plugin `last seen` are recent;
- catalog and table counts are plausible;
- one known completed order can be retrieved with the correct total;
- a current open table/check, if one exists, appears separately from booked sales;
- inventory quantities are `null` rather than invented when Toss stock tracking is disabled.

Finally connect Codex and ask: “What was today's booked sales total and average check? Show open checks separately and tell me the data freshness.”

## Troubleshooting before pairing

If the service code resolves to the app but installation fails, check in this order:

1. The uploaded version is explicitly distributed on the development/test track.
2. The ZIP contains `dist/main.js` and the application package ID matches `place-mcp-bridge`.
3. The exact current POS serial is registered as a test terminal.
4. **Test merchant management → merchant → Application → Place MCP Bridge** is ON.
5. The exact public HTTPS origin is in the application HTTP ACL.
6. Toss POS was fully restarted after distribution and assignment.

If all six pass and the bridge receives no `/v1/plugin/pair` request, do not rotate bridge credentials or change merchant orders. Capture the Toss POS version, package ID, terminal serial, merchant ID, and deployed plugin version, then ask Toss developer support to confirm that the worker app is activated for that terminal and merchant.

## Troubleshooting after pairing

- `/health` fails from the POS network: fix DNS, firewall, proxy/tunnel, or TLS first.
- `/health` works but pairing is rejected: generate a fresh code and confirm the URL is the same public origin in `.env`.
- Pairing succeeds but `doctor` shows no recent contact: restart Toss POS, then inspect bridge logs for signed plugin requests.
- Merchant/catalog sync works but old orders are absent: use `refresh_pos_data` for a bounded historical range; initial connection backfills up to 90 days.
- Inventory quantities are missing: confirm Toss stock tracking is enabled for those catalog prices. Availability and sold-out state can exist without tracked quantities.

## iPad status

The SDK declares iOS support, but the reference end-to-end validation used the desktop Toss POS client. Before promising an iPad-only installation, verify on the actual merchant device that:

- the installed Toss POS version accepts the deployed background worker;
- the plugin settings and secure store work;
- outbound HTTPS reaches the bridge;
- the worker continues syncing through normal app background/sleep behavior;
- freshness timestamps accurately reveal any pause.

---

# Toss POS 플러그인 설치

이 단계는 사람이 직접 진행해야 합니다. Codex는 ZIP 빌드, 브리지 시작, 페어링 코드 생성, 진단 실행을 할 수 있지만 Toss 포털의 승인 작업을 대신하거나 공개되지 않은 플러그인을 가맹점에 몰래 설치할 수는 없습니다.

포털의 메뉴 이름은 변경될 수 있습니다. 표시 문구가 이 문서와 다르더라도 이 체크리스트의 기술 요구사항을 유지하세요. Toss 개발자 지원팀에 문의하기 전 POS 버전과 화면 캡처를 기록해 두세요.

## 필요한 접근 권한

시작하기 전에 다음 항목을 확인하세요.

- Toss 개발자 포털 접근 권한과 Toss Place POS 애플리케이션을 생성하거나 관리할 권한
- 최초 테스트를 위한 Toss 테스트 가맹점 또는 대상 가맹점에 배포할 수 있도록 승인된 경로
- 대상 Toss POS 장비에 직접 또는 원격으로 접근할 수 있는 권한
- 지속적인 읽기 전용 동기화에 대한 가맹점주의 승인
- [deployment.md](deployment.md)의 검증을 통과한 안정적인 공개 HTTPS 브리지

> [!IMPORTANT]
> GitHub 접근 권한만으로는 이 통합 기능을 Toss POS에 설치할 수 없습니다. 현재 방식은 가맹점 OAuth가 아니라 Toss POS 개발자 플러그인을 사용합니다. 일반 가맹점이 직접 설치할 수 있게 하려면 향후 Toss의 검토를 거친 공개 배포 경로나 Toss가 승인한 별도 온보딩 서비스가 필요합니다.

## 1. 업로드 ZIP 빌드 및 확인

저장소 루트에서 다음을 실행합니다.

```bash
npm install
npm run build:plugin
npm run zip --workspace plugin
unzip -Z1 plugin/place-mcp-bridge.zip
```

예상 결과: `plugin/place-mcp-bridge.zip` 파일이 생성되고 파일 목록에 `dist/main.js`가 포함되어야 합니다. `plugin/` 디렉터리나 GitHub에서 받은 저장소 ZIP이 아니라 이 ZIP 파일 자체를 업로드하세요.

## 2. Toss Place 개발자 애플리케이션 생성

Toss 개발자 포털에서 다음을 진행합니다.

1. 새 **Toss Place POS** 애플리케이션을 만들거나 이 배포 전용 애플리케이션을 엽니다.
2. 워커/백그라운드 워커 애플리케이션 유형을 선택합니다.
3. 엔트리포인트를 `POS_BACKGROUND_WORKER`로 설정합니다.
4. 패키지 ID를 `place-mcp-bridge`로 설정합니다. 포크한 뒤 의도적으로 이름을 바꾸는 경우에도 포털 패키지 ID와 플러그인 번들 메타데이터가 서로 일치해야 합니다.
5. 애플리케이션을 저장하고 서비스 코드를 임시로 복사합니다. 서비스 코드는 브리지 자격 증명이 아니며 커밋하면 안 됩니다.

예상 결과: 애플리케이션 페이지에 POS 백그라운드 워커로 표시되고 서비스 코드가 보여야 합니다.

서로 관련 없는 가맹점 통합에 동일한 패키지 식별자를 재사용하지 마세요. SDK가 제공한다는 이유만으로 주문/결제 권한을 활성화하지 마세요. v1은 읽기 전용 분석 통합입니다.

## 3. 브리지를 HTTP ACL에 추가

애플리케이션의 네트워크 또는 **HTTP ACL/허용 목록** 설정을 열고 `.env`에 있는 정확한 origin을 추가합니다.

```text
https://toss-mcp.example.com
```

`scheme://hostname`만 사용하세요. 공개 URL이 실제로 비표준 포트를 사용하는 경우에만 포트를 포함합니다. `/`, `/mcp`, `/v1`, 쿼리 문자열 또는 비공개 `127.0.0.1` 주소를 포함하지 마세요.

예상 결과: 저장된 허용 목록에 `TOSS_MCP_PUBLIC_URL`과 동일한 HTTPS origin이 표시되어야 합니다. POS 네트워크에서 `https://toss-mcp.example.com/health`를 열었을 때 인증서 경고 없이 성공해야 합니다.

## 4. 테스트 버전 업로드 및 배포

1. 애플리케이션의 개발/테스트 버전 또는 배포 영역을 엽니다.
2. `plugin/place-mcp-bridge.zip`을 업로드합니다.
3. Toss가 번들을 접수하고 처리할 때까지 기다립니다.
4. 해당 버전을 개발/테스트 트랙에 명시적으로 **배포**, **출시** 또는 **릴리스**합니다.

예상 결과: 버전이 테스트 트랙에 배포된 상태로 표시되어야 합니다. 업로드 성공만으로는 충분하지 않습니다. 배포되지 않은 버전은 단말에서 설치할 수 없습니다.

Toss가 엔트리포인트 누락을 보고하면 ZIP을 다시 확인하세요. `place-mcp-bridge/dist/main.js`처럼 하위 디렉터리에 중첩된 경로가 아니라 정확히 `dist/main.js`가 포함되어야 합니다.

## 5. 대상 POS 단말 등록

실제 Toss POS 장비에서 **설정 → POS 정보/소프트웨어**를 열고 일련번호를 정확히 복사합니다.

개발자 포털로 돌아가 다음을 진행합니다.

1. 애플리케이션의 테스트 단말 설정을 엽니다.
2. 해당 일련번호를 추가합니다.
3. 저장한 뒤 등록 단말 목록에 표시되는지 확인합니다.

예상 결과: 현재 실행 중인 POS 단말의 일련번호가 애플리케이션에 등록되어 있어야 합니다. 가맹점만 등록하고 이 단말 단계를 생략하면 안 됩니다.

## 6. 가맹점에 애플리케이션 활성화

개발자 포털에서 다음을 진행합니다.

1. **테스트 가맹점 관리**를 엽니다.
2. 대상 가맹점을 선택하고 변경 전에 이름과 가맹점 ID를 확인합니다.
3. 가맹점의 **애플리케이션** 표를 엽니다.
4. **Place MCP Bridge**를 찾아 **ON**으로 전환합니다.
5. Toss의 성공 메시지가 표시되는지 확인합니다.

예상 결과: 가맹점 페이지를 새로 고친 뒤에도 애플리케이션이 ON 상태로 유지되어야 합니다.

이 가맹점 스위치는 단말 등록 및 서비스 코드 입력과 별개의 요구사항입니다. 이 스위치가 OFF여도 POS가 유효한 서비스 코드를 인식할 수 있지만, 워커는 해당 가맹점에 대해 승인되지 않습니다.

## 7. Toss POS에 서비스 설치

1. Toss POS를 완전히 종료합니다. 설정 화면만 닫아서는 안 됩니다.
2. Toss POS를 다시 열고 필요한 경우 대상 가맹점으로 다시 로그인합니다.
3. **설정 → 서비스 연동 → 서비스 코드로 연결**을 엽니다.
4. 개발자 애플리케이션의 서비스 코드를 입력합니다.
5. Toss POS 또는 운영체제가 표시하는 설치 승인 창을 승인합니다.
6. 서비스 연동 화면에서 **Place MCP Bridge**가 **사용 중**으로 표시되는지 확인합니다.

예상 결과: **Place MCP Bridge**를 선택하면 플러그인 설정 필드가 열려야 합니다. 서비스 이름은 인식되지만 이 필드가 나타나기 전에 연결이 실패한다면, 문제는 아직 Toss의 애플리케이션 할당/설치 경로에 있습니다. 이 프로젝트의 브리지에는 페어링 요청이 도달하지 않은 상태입니다.

## 8. 설치된 플러그인 페어링

브리지가 실행 중인 상태에서 일회용 코드를 생성합니다.

```bash
npm run pair
```

**설정 → 서비스 연동 → Place MCP Bridge**에서 다음을 진행합니다.

1. 명령이 출력한 공개 브리지 URL을 입력합니다. `127.0.0.1`이 아니라 ACL에 허용된 HTTPS URL이어야 합니다.
2. 일회용 페어링 코드를 입력합니다.
3. 저장합니다.
4. 저장된 비밀키로 백그라운드 워커가 로드되도록 Toss POS를 다시 한 번 완전히 종료하고 재시작합니다.

코드는 15분 후 만료되고 한 번만 사용할 수 있습니다. 만료되면 새 코드를 생성하세요. 페어링 코드나 생성된 비밀키를 이슈, 스크린샷 또는 커밋에 포함하지 마세요.

예상 결과: 브리지가 성공적인 페어링 요청을 받고 플러그인이 최초 스냅샷/주문 동기화를 시작해야 합니다.

## 9. 데이터 정확성 검증

다음을 실행합니다.

```bash
npm run doctor
```

분석 결과를 신뢰하기 전에 다음 항목을 모두 확인하세요.

- 보고된 가맹점 이름과 ID가 대상 가맹점과 일치합니다.
- 장비와 플러그인의 `last seen` 시각이 최근입니다.
- 카탈로그와 테이블 개수가 타당합니다.
- 알고 있는 완료 주문 한 건을 올바른 총액과 함께 조회할 수 있습니다.
- 현재 미결제 테이블/주문이 있다면 확정 매출과 별도로 표시됩니다.
- Toss 재고 추적이 꺼진 경우 재고 수량을 추정하지 않고 `null`로 표시합니다.

마지막으로 Codex를 연결하고 다음과 같이 질문하세요. “오늘 확정 매출과 평균 객단가는 얼마야? 현재 미결제 주문은 별도로 보여주고 데이터가 얼마나 최신인지도 알려줘.”

## 페어링 전 문제 해결

서비스 코드가 애플리케이션을 인식하지만 설치가 실패하면 다음 순서로 확인하세요.

1. 업로드한 버전이 개발/테스트 트랙에 명시적으로 배포되었습니다.
2. ZIP에 `dist/main.js`가 있고 애플리케이션 패키지 ID가 `place-mcp-bridge`와 일치합니다.
3. 현재 POS 일련번호가 테스트 단말로 등록되어 있습니다.
4. **테스트 가맹점 관리 → 가맹점 → 애플리케이션 → Place MCP Bridge**가 ON입니다.
5. 정확한 공개 HTTPS origin이 애플리케이션 HTTP ACL에 있습니다.
6. 배포 및 할당 후 Toss POS를 완전히 재시작했습니다.

여섯 항목이 모두 정상인데도 브리지가 `/v1/plugin/pair` 요청을 받지 못했다면 브리지 자격 증명을 교체하거나 가맹점 주문을 변경하지 마세요. Toss POS 버전, 패키지 ID, 단말 일련번호, 가맹점 ID, 배포된 플러그인 버전을 기록한 다음, 워커 애플리케이션이 해당 단말과 가맹점에 활성화되었는지 Toss 개발자 지원팀에 확인하세요.

## 페어링 후 문제 해결

- POS 네트워크에서 `/health`가 실패하는 경우: DNS, 방화벽, 프록시/터널 또는 TLS를 먼저 수정하세요.
- `/health`는 작동하지만 페어링이 거부되는 경우: 새 코드를 만들고 URL이 `.env`의 동일한 공개 origin인지 확인하세요.
- 페어링은 성공하지만 `doctor`에 최근 연결이 없는 경우: Toss POS를 재시작한 뒤 브리지 로그에서 서명된 플러그인 요청을 확인하세요.
- 가맹점/카탈로그는 동기화되지만 과거 주문이 없는 경우: 범위가 지정된 과거 기간에 `refresh_pos_data`를 사용하세요. 최초 연결은 최대 90일을 백필합니다.
- 재고 수량이 없는 경우: 해당 카탈로그 가격에 Toss 재고 추적이 활성화되어 있는지 확인하세요. 추적 수량 없이도 판매 가능 상태와 품절 상태가 존재할 수 있습니다.

## iPad 지원 상태

SDK에는 iOS 지원이 선언되어 있지만 기준 엔드투엔드 검증은 데스크톱 Toss POS 클라이언트에서 수행했습니다. iPad 전용 설치가 완료되었다고 안내하기 전에 실제 가맹점 장비에서 다음을 확인하세요.

- 설치된 Toss POS 버전이 배포된 백그라운드 워커를 지원합니다.
- 플러그인 설정과 보안 저장소가 작동합니다.
- 외부 HTTPS를 통해 브리지에 접근할 수 있습니다.
- 일반적인 앱 백그라운드/절전 상태에서도 워커가 계속 동기화됩니다.
- 동기화가 멈추면 최신성 타임스탬프에 정확히 반영됩니다.
