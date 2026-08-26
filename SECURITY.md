# Security policy

## Reporting

Please report vulnerabilities privately through GitHub's security advisory feature. Do not open a public issue containing merchant data, access tokens, pairing codes, connection secrets, POS serial numbers, or exploit details.

## Deployment requirements

- Use HTTPS for every bridge connection that leaves one machine.
- Keep `TOSS_MCP_ACCESS_TOKEN` out of source control, shell history, screenshots, and support tickets.
- Restrict the bridge with a firewall or private network in addition to application authentication when practical.
- Protect and back up the database as sensitive merchant data.
- Rotate the MCP access token after suspected exposure. Re-pair a POS connection after connection-secret exposure.
- Do not publish live fixture captures without removing business numbers, serial numbers, customer data, order keys, and merchant identifiers.

The default MCP surface is read-only. Please treat any proposal that adds live order or payment mutations as a security-sensitive design change.

---

# 보안 정책

## 취약점 신고

취약점은 GitHub의 보안 권고 기능을 통해 비공개로 신고해 주세요. 가맹점 데이터, 액세스 토큰, 페어링 코드, 연결 비밀키, POS 일련번호 또는 악용 방법이 포함된 공개 이슈를 등록하지 마세요.

## 배포 요구사항

- 한 장비 밖으로 나가는 모든 브리지 연결에 HTTPS를 사용하세요.
- `TOSS_MCP_ACCESS_TOKEN`을 소스 제어, 셸 기록, 스크린샷, 지원 요청에 남기지 마세요.
- 가능하면 애플리케이션 인증뿐 아니라 방화벽 또는 사설 네트워크로도 브리지 접근을 제한하세요.
- 데이터베이스를 민감한 가맹점 데이터로 취급하여 보호하고 백업하세요.
- MCP 액세스 토큰 노출이 의심되면 토큰을 교체하세요. 연결 비밀키가 노출되면 POS를 다시 페어링하세요.
- 사업자번호, 일련번호, 고객 데이터, 주문 키, 가맹점 식별자를 제거하지 않은 실제 픽스처 캡처를 공개하지 마세요.

기본 MCP 표면은 읽기 전용입니다. 실제 주문 또는 결제를 변경하는 기능을 추가하는 모든 제안은 보안에 민감한 설계 변경으로 취급해 주세요.
