# Toss Place SDK coverage

This project does **not** expose every callable capability of the Toss Place SDK. Version 1 intentionally covers the read-only data needed for merchant analytics and excludes operational writes and terminal controls.

The matrix is based on `@tossplace/pos-plugin-sdk` 0.0.27, inspected and integration-tested on 2026-08-26. A merchant's account, POS version, plugin permissions, and enabled features can still limit returned fields.

## Coverage definitions

- **Full read coverage**: the SDK's business-data read is synchronized and available through a raw or analytical MCP tool.
- **Partial read coverage**: useful data is present, but a separate SDK read or operational state is not yet exposed.
- **Internal**: the namespace runs the plugin/bridge but is not merchant business data.
- **Excluded**: deliberately unavailable to MCP v1.

## Namespace matrix

| SDK namespace                                         | SDK surface                           | MCP v1 coverage       | Details                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merchant`                                            | `getMerchant`                         | Full read coverage    | Raw merchant identity and business/franchise metadata in `get_pos_data`; used by `connection_status`.                                                                                                                                                           |
| `device`                                              | `getDeviceInfo`                       | Full read coverage    | Platform, serial, POS version, and business/operation mode.                                                                                                                                                                                                     |
| `category`                                            | List/get + change events              | Full read coverage    | Complete raw categories synchronized initially and on events.                                                                                                                                                                                                   |
| `catalog`                                             | List/get + change events              | Full read coverage    | Prices, SKUs, barcodes, availability, stock fields, and option references.                                                                                                                                                                                      |
| `option`                                              | List/get + change events              | Full read coverage    | Choices, prices, availability/sold-out state, and quantity rules.                                                                                                                                                                                               |
| `table`                                               | Halls/tables/get + change events      | Full read coverage    | Raw halls/tables and each table's current open order/check. Current checks are included even if opened before the requested sales range.                                                                                                                        |
| `order`                                               | Get/search/list/events plus mutations | Partial read coverage | `getOrders` backfill, `getOrder`, and order events are synchronized. MCP filters the local synchronized data for listing and analytics. SDK add/cancel/complete/add-menu mutations are excluded. A distinct pass-through tool for SDK `search` is not provided. |
| `payment`                                             | Get/events plus add/cancel            | Partial read coverage | Full payment records embedded in synchronized orders feed `payment_breakdown`; payment events trigger order refresh. There is no standalone `getPayment` MCP tool. Add/cancel are excluded.                                                                     |
| `kdsOrder`                                            | KDS item reads/events                 | Not implemented       | Live kitchen-display workflow state is not yet synchronized. This is the largest unimplemented read-only business surface.                                                                                                                                      |
| `draftOrder`                                          | Get plus draft mutations              | Excluded              | Terminal-local, ephemeral checkout state. Even the read is withheld in v1 because it is operational rather than booked-sales data.                                                                                                                              |
| `cashReceipt`                                         | Add                                   | Excluded              | The inspected SDK exposes creation, not a general receipt history/list read.                                                                                                                                                                                    |
| `paymentMethod`                                       | Register/cancel                       | Excluded              | Operational mutation surface, not payment-history analytics.                                                                                                                                                                                                    |
| `barcode`                                             | Scanner/device interaction            | Excluded              | Terminal input capability, not merchant analytics data.                                                                                                                                                                                                         |
| `alert`, `toast`, `sound`, `navigation`, `powerSaver` | POS UI/device controls                | Excluded              | No business-data read value and inappropriate for an analytics MCP.                                                                                                                                                                                             |
| `storage`, `secureStore`, `setting`                   | Plugin-local state/configuration      | Internal              | Used for safe plugin configuration and credentials; never exposed as merchant data.                                                                                                                                                                             |
| `http`, `websocket`                                   | Plugin network clients                | Internal              | Transport used by integrations, not a Toss merchant dataset.                                                                                                                                                                                                    |
| `plugin`, `pluginUnicast`, `error`                    | Plugin lifecycle/messaging/errors     | Internal              | Used to operate and diagnose the worker.                                                                                                                                                                                                                        |

## What users can analyze today

The covered data supports:

- booked gross/net sales, discounts, taxes, tips, order counts, and average check;
- current open checks, always separated from completed booked sales;
- raw orders and line items, top items, comparisons, and time-series analysis;
- card/cash/external/barcode/transfer payment breakdowns when present in order payment records;
- catalog/category/options, availability, sold-out state, and stock quantity when Toss tracks it;
- halls, tables, merchant/device identity, connection status, and freshness.

It does not currently answer questions about live KDS queues, in-progress draft carts that are not table orders, or standalone payment lookups that cannot be associated with a synchronized order.

## Inventory semantics

Toss inventory is attached to a catalog price:

- `isStockable`: whether Toss tracks stock for the price/SKU;
- `stockQuantity.remainQuantity`: current quantity;
- `stockQuantity.lastChangeDateTime`: last stock change;
- catalog and option states: `ON_SALE`, `SOLD_OUT`, `UNAVAILABLE`, or `DELETED`.

The MCP never invents a quantity when `isStockable` is false. In that case `inventory` reports availability and sold-out state with a `null` quantity.

## Intentionally withheld writes

The SDK can add, change, cancel, and complete orders; add or cancel payments; modify draft orders; create cash receipts; and register payment methods. None are registered as MCP tools in v1.

A future write package should be separately opt-in and needs narrow tools, declared read/write annotations, audit logs, idempotency keys, merchant-role enforcement, and explicit human approval. Adding those mutations is not required to make the current sales-analysis use case complete.

## Roadmap gaps

The sensible read-only additions are:

1. KDS item snapshot/events, if merchants need kitchen throughput and preparation-time analysis.
2. A standalone payment lookup for reconciliation cases that cannot be resolved from order data.
3. Optional draft-order observation behind an explicit configuration flag, only if a concrete operational use case justifies syncing ephemeral carts.

Toss Payments is a separate product/API and is not implied by any row in this Toss Place POS matrix.

---

# Toss Place SDK 지원 범위

이 프로젝트는 Toss Place SDK에서 호출할 수 있는 모든 기능을 노출하지 않습니다. v1은 가맹점 분석에 필요한 읽기 전용 데이터를 의도적으로 지원하며, 운영 데이터 변경과 단말 제어 기능은 제외합니다.

이 표는 2026년 8월 26일에 확인하고 통합 테스트한 `@tossplace/pos-plugin-sdk` 0.0.27을 기준으로 합니다. 가맹점 계정, POS 버전, 플러그인 권한 및 활성화된 기능에 따라 반환되는 필드가 제한될 수 있습니다.

## 지원 범위 정의

- **읽기 전체 지원**: SDK의 비즈니스 데이터 읽기 결과가 동기화되며 원시 또는 분석 MCP 도구로 제공됩니다.
- **읽기 일부 지원**: 유용한 데이터는 제공되지만, 별도의 SDK 읽기 기능이나 운영 상태가 아직 노출되지 않습니다.
- **내부 사용**: 플러그인/브리지 작동에 쓰이지만 가맹점 비즈니스 데이터는 아닙니다.
- **제외**: MCP v1에서는 의도적으로 제공하지 않습니다.

## 네임스페이스 표

| SDK 네임스페이스                                      | SDK 표면                           | MCP v1 지원    | 상세                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ---------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merchant`                                            | `getMerchant`                      | 읽기 전체 지원 | `get_pos_data`에서 원시 가맹점 식별 및 사업/프랜차이즈 메타데이터를 제공하며, `connection_status`에서도 사용합니다.                                                                                                                     |
| `device`                                              | `getDeviceInfo`                    | 읽기 전체 지원 | 플랫폼, 일련번호, POS 버전, 영업 및 운영 모드입니다.                                                                                                                                                                                    |
| `category`                                            | 목록/단건 조회 + 변경 이벤트       | 읽기 전체 지원 | 전체 원시 카테고리를 최초 및 이벤트 발생 시 동기화합니다.                                                                                                                                                                               |
| `catalog`                                             | 목록/단건 조회 + 변경 이벤트       | 읽기 전체 지원 | 가격, SKU, 바코드, 판매 가능 상태, 재고 필드, 옵션 참조입니다.                                                                                                                                                                          |
| `option`                                              | 목록/단건 조회 + 변경 이벤트       | 읽기 전체 지원 | 선택 항목, 가격, 판매/품절 상태, 수량 규칙입니다.                                                                                                                                                                                       |
| `table`                                               | 홀/테이블/단건 조회 + 변경 이벤트  | 읽기 전체 지원 | 원시 홀/테이블과 각 테이블의 현재 미결제 주문입니다. 요청한 매출 기간보다 먼저 시작된 주문도 현재 미결제 주문에 포함합니다.                                                                                                             |
| `order`                                               | 단건/검색/목록/이벤트 및 변경 기능 | 읽기 일부 지원 | `getOrders` 백필, `getOrder`, 주문 이벤트를 동기화합니다. MCP는 동기화된 로컬 데이터를 필터링하여 목록과 분석을 제공합니다. SDK의 추가/취소/완료/메뉴 추가 변경 기능은 제외합니다. SDK `search`를 그대로 전달하는 별도 도구는 없습니다. |
| `payment`                                             | 단건 조회/이벤트 및 추가/취소      | 읽기 일부 지원 | 동기화된 주문에 포함된 전체 결제 레코드가 `payment_breakdown`에 사용되며, 결제 이벤트는 주문 갱신을 유발합니다. 독립적인 `getPayment` MCP 도구는 없습니다. 추가/취소 기능은 제외합니다.                                                 |
| `kdsOrder`                                            | KDS 항목 읽기/이벤트               | 미구현         | 주방 디스플레이의 실시간 작업 상태는 아직 동기화하지 않습니다. 현재 미구현 상태인 읽기 전용 비즈니스 표면 중 가장 큰 부분입니다.                                                                                                        |
| `draftOrder`                                          | 단건 조회 및 임시 주문 변경        | 제외           | 단말 로컬의 일시적인 결제 진행 상태입니다. 확정 매출 데이터가 아닌 운영 데이터이므로 v1에서는 읽기 기능도 제외합니다.                                                                                                                   |
| `cashReceipt`                                         | 추가                               | 제외           | 확인한 SDK는 생성을 제공하지만 일반적인 현금영수증 내역/목록 조회는 제공하지 않습니다.                                                                                                                                                  |
| `paymentMethod`                                       | 등록/취소                          | 제외           | 결제 내역 분석이 아닌 운영 변경 기능입니다.                                                                                                                                                                                             |
| `barcode`                                             | 스캐너/장비 상호작용               | 제외           | 가맹점 분석 데이터가 아닌 단말 입력 기능입니다.                                                                                                                                                                                         |
| `alert`, `toast`, `sound`, `navigation`, `powerSaver` | POS UI/장비 제어                   | 제외           | 비즈니스 데이터 읽기 가치가 없으며 분석 MCP에 적합하지 않습니다.                                                                                                                                                                        |
| `storage`, `secureStore`, `setting`                   | 플러그인 로컬 상태/설정            | 내부 사용      | 안전한 플러그인 설정과 자격 증명에 사용하며 가맹점 데이터로 노출하지 않습니다.                                                                                                                                                          |
| `http`, `websocket`                                   | 플러그인 네트워크 클라이언트       | 내부 사용      | 통합 전송에 사용하며 Toss 가맹점 데이터셋이 아닙니다.                                                                                                                                                                                   |
| `plugin`, `pluginUnicast`, `error`                    | 플러그인 수명주기/메시징/오류      | 내부 사용      | 워커 운영과 진단에 사용합니다.                                                                                                                                                                                                          |

## 현재 분석할 수 있는 항목

지원되는 데이터로 다음을 분석할 수 있습니다.

- 확정 총/순매출, 할인, 세금, 팁, 주문 수, 평균 객단가
- 완료된 확정 매출과 항상 분리되는 현재 미결제 주문
- 원시 주문과 품목, 인기 품목, 기간 비교, 시계열 분석
- 주문 결제 레코드에 존재하는 경우 카드/현금/외부/바코드/계좌이체 결제 구성
- Toss가 추적하는 경우 카탈로그/카테고리/옵션, 판매 가능 상태, 품절 상태, 재고 수량
- 홀, 테이블, 가맹점/장비 정보, 연결 상태, 데이터 최신성

현재는 실시간 KDS 대기열, 테이블 주문이 아닌 결제 전 임시 장바구니, 또는 동기화된 주문과 연결할 수 없는 독립 결제 조회 질문에는 답할 수 없습니다.

## 재고 의미

Toss 재고는 카탈로그 가격 항목에 연결됩니다.

- `isStockable`: Toss가 해당 가격/SKU의 재고를 추적하는지 여부
- `stockQuantity.remainQuantity`: 현재 남은 수량
- `stockQuantity.lastChangeDateTime`: 마지막 재고 변경 시각
- 카탈로그 및 옵션 상태: `ON_SALE`, `SOLD_OUT`, `UNAVAILABLE`, `DELETED`

`isStockable`이 false이면 MCP는 수량을 추정하지 않습니다. 이 경우 `inventory`는 판매 가능/품절 상태를 보고하고 수량은 `null`로 표시합니다.

## 의도적으로 제외한 쓰기 기능

SDK는 주문 추가, 변경, 취소, 완료, 결제 추가 또는 취소, 임시 주문 변경, 현금영수증 생성, 결제 수단 등록을 지원합니다. v1에서는 그 어떤 기능도 MCP 도구로 등록하지 않습니다.

향후 쓰기 기능 패키지는 별도로 명시적 활성화가 필요하며, 범위가 좁은 도구, 읽기/쓰기 어노테이션, 감사 로그, 멱등성 키, 가맹점 역할 권한 적용, 명시적인 사람의 승인이 필요합니다. 현재 매출 분석 사용 사례를 완성하는 데 이런 변경 기능은 필요하지 않습니다.

## 로드맵의 미지원 항목

합리적인 읽기 전용 추가 기능은 다음과 같습니다.

1. 가맹점이 주방 처리량과 준비 시간 분석을 필요로 하는 경우 KDS 항목 스냅샷 및 이벤트
2. 주문 데이터만으로 해결할 수 없는 정산 사례를 위한 독립 결제 조회
3. 구체적인 운영 사용 사례가 일시적인 장바구니 동기화를 정당화하는 경우에만, 명시적 설정 플래그 뒤에서 제공하는 임시 주문 관찰

Toss Payments는 별도의 제품/API이며, 이 Toss Place POS 표의 어떤 항목도 Toss Payments 지원을 의미하지 않습니다.
