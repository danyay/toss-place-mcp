# Contributing

Contributions are welcome.

1. Open an issue for material API, schema, authorization, or metric changes.
2. Keep provider-specific code behind the Toss Place boundary; Toss Payments is not the same provider.
3. Add sanitized tests for behavior changes.
4. Run `npm run check` and `npm run build:all`.
5. Never add merchant credentials, IDs copied from a live account, POS serials, raw production orders, or developer-portal secrets.

Metric changes must document the Toss fields used and distinguish booked sales, open checks, refunds, discounts, and payment collection.

---

# 기여하기

기여를 환영합니다.

1. API, 스키마, 인증 또는 지표에 중대한 변경을 제안하려면 먼저 이슈를 등록해 주세요.
2. 공급자별 코드는 Toss Place 경계 안에 유지해 주세요. Toss Payments는 동일한 공급자가 아닙니다.
3. 동작을 변경할 때는 민감 정보를 제거한 테스트를 추가해 주세요.
4. `npm run check`와 `npm run build:all`을 실행해 주세요.
5. 가맹점 자격 증명, 실제 계정에서 복사한 ID, POS 일련번호, 원본 운영 주문 또는 개발자 포털 비밀정보를 절대 추가하지 마세요.

지표를 변경할 때는 사용한 Toss 필드를 문서화하고, 확정 매출, 미결제 주문, 환불, 할인, 결제 수납을 명확히 구분해야 합니다.
