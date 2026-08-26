# Deploy the bridge with HTTPS

The Toss POS plugin must be able to reach the bridge at a stable HTTPS URL. The bridge itself listens only on loopback by default; a reverse proxy or tunnel terminates TLS and forwards requests to `127.0.0.1:8787`.

For an always-on merchant installation, use a small server or store computer that stays awake. Do not rely on the iPad to run the bridge. The iPad or desktop running Toss POS only needs the Toss plugin and outbound HTTPS access.

## Before you start

You need:

- a machine that can remain online while POS data should sync;
- a domain or subdomain you control, such as `toss-mcp.example.com`;
- Node.js 22+ or Docker Compose;
- permission to add that exact HTTPS origin to the Toss developer application's HTTP ACL.

Create the local configuration and keep it out of Git:

```bash
npm install
npm run build:all
node dist/cli.js init
```

Edit `.env` and set:

```dotenv
TOSS_MCP_PUBLIC_URL=https://toss-mcp.example.com
TOSS_MCP_BRIDGE_URL=http://127.0.0.1:8787
```

`TOSS_MCP_PUBLIC_URL` is the address used by the POS plugin. `TOSS_MCP_BRIDGE_URL` is the private loopback address used by a local stdio MCP client. Do not put `/mcp` or another path in `TOSS_MCP_PUBLIC_URL`.

## Option A: Docker bridge plus Caddy

This is the recommended simple production layout when the host has a public IP.

1. Create an `A` DNS record for `toss-mcp.example.com` pointing to the server's public IPv4 address. Add `AAAA` only if IPv6 reaches the same server.
2. Allow inbound TCP ports 80 and 443 through the host firewall and cloud firewall/security group.
3. Start the bridge:

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

   Compose publishes the bridge only at `127.0.0.1:8787`; it is not directly exposed to the internet.

4. Install Caddy using the instructions for your operating system, then create this `Caddyfile`:

   ```caddyfile
   toss-mcp.example.com {
     reverse_proxy 127.0.0.1:8787
   }
   ```

5. Run Caddy as a system service so it starts after reboot. With a correctly pointed public domain and reachable ports 80/443, Caddy obtains and renews the certificate and redirects HTTP to HTTPS automatically. See the [official Caddy install guide](https://caddyserver.com/docs/install), [reverse-proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), and [automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https).
6. Verify the public endpoint from a different network if possible:

   ```bash
   curl --fail https://toss-mcp.example.com/health
   curl -i https://toss-mcp.example.com/mcp
   ```

   The health request should succeed. The unauthenticated MCP request should be rejected; a public `200` response from a protected endpoint is a configuration error.

7. Add only `https://toss-mcp.example.com` to the Toss plugin HTTP ACL. The scheme and hostname must match `TOSS_MCP_PUBLIC_URL`; do not add a path.

If Caddy cannot issue a certificate, first verify DNS, inbound ports 80/443, and that no other process owns those ports. Do not work around the problem by exposing port 8787 over plain HTTP.

## Option B: named Cloudflare Tunnel

Use this when the bridge is behind NAT, the store cannot accept inbound connections, or the bridge runs on a store computer without a public IP.

Create a **named, persistent tunnel** and map a hostname you control to `http://127.0.0.1:8787`, following Cloudflare's [locally managed tunnel guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/). Install `cloudflared` as a service so it starts after reboot.

The resulting public hostname becomes `TOSS_MCP_PUBLIC_URL` and the Toss HTTP ACL origin. A temporary Quick Tunnel is suitable for a short sandbox test only: its random hostname changes, which breaks the Toss ACL and the saved POS pairing URL.

Do not put Cloudflare Access's browser login page in front of the POS ingestion endpoints unless you have separately configured a non-interactive service-token flow that the plugin supports. The bridge already authenticates POS requests with HMAC signatures and MCP clients with bearer tokens.

## Run without Docker

For local development or a host managed with systemd/launchd:

```bash
npm install
npm run build:all
npm run bridge
```

Keep the Node process running with the operating system's service manager. Point Caddy or the named tunnel to `http://127.0.0.1:8787` exactly as above.

## Validate before installing the POS plugin

Complete all four checks:

1. `https://your-host/health` works from the POS network.
2. The URL has a publicly trusted certificate and does not show a browser warning.
3. `.env` contains the same origin in `TOSS_MCP_PUBLIC_URL`.
4. The Toss developer application HTTP ACL contains that same origin.

After those checks, continue with [Toss developer plugin setup](toss-developer-setup.md).

## Operations and upgrades

- Back up the Docker volume or SQLite database; it contains merchant POS data and pairing state.
- Keep `.env`, database files, tokens, tunnel credentials, and Caddy private data out of Git.
- After pulling an upgrade, run `npm install`, `npm run check`, and `npm run build:all`, or rebuild the Compose service.
- Rebuild and redistribute the Toss plugin ZIP only when the plugin code/version changes. A bridge-only update does not require reinstalling the POS plugin unless release notes say otherwise.
- Run `npm run doctor` after restarts and upgrades. Treat stale `last seen` or `last sync` times as an outage even if `/health` is green.

---

# HTTPS로 브리지 배포하기

Toss POS 플러그인은 안정적인 HTTPS URL을 통해 브리지에 접근할 수 있어야 합니다. 브리지 자체는 기본적으로 루프백 주소에서만 수신합니다. 리버스 프록시 또는 터널이 TLS를 종료하고 요청을 `127.0.0.1:8787`로 전달합니다.

상시 운영 가맹점에서는 POS 데이터를 동기화해야 하는 동안 계속 켜져 있는 소형 서버나 매장 컴퓨터를 사용하세요. iPad에서 브리지를 실행하려고 하지 마세요. Toss POS를 실행하는 iPad 또는 데스크톱에는 Toss 플러그인과 외부 HTTPS 연결만 있으면 됩니다.

## 시작 전 준비사항

다음 항목이 필요합니다.

- POS 데이터를 동기화해야 하는 동안 계속 온라인 상태를 유지할 장비
- `toss-mcp.example.com`과 같이 직접 관리하는 도메인 또는 하위 도메인
- Node.js 22 이상 또는 Docker Compose
- 해당 HTTPS origin을 Toss 개발자 애플리케이션의 HTTP ACL에 추가할 권한

로컬 설정을 만들고 Git에 포함되지 않도록 유지합니다.

```bash
npm install
npm run build:all
node dist/cli.js init
```

`.env`를 열어 다음 값을 설정합니다.

```dotenv
TOSS_MCP_PUBLIC_URL=https://toss-mcp.example.com
TOSS_MCP_BRIDGE_URL=http://127.0.0.1:8787
```

`TOSS_MCP_PUBLIC_URL`은 POS 플러그인이 사용하는 주소입니다. `TOSS_MCP_BRIDGE_URL`은 로컬 stdio MCP 클라이언트가 사용하는 비공개 루프백 주소입니다. `TOSS_MCP_PUBLIC_URL`에 `/mcp` 또는 다른 경로를 추가하지 마세요.

## 옵션 A: Docker 브리지 + Caddy

호스트에 공인 IP가 있을 때 권장하는 간단한 운영 구성입니다.

1. `toss-mcp.example.com`의 `A` DNS 레코드를 서버의 공인 IPv4 주소로 지정합니다. IPv6가 동일한 서버에 정상적으로 도달하는 경우에만 `AAAA`를 추가하세요.
2. 호스트 방화벽과 클라우드 방화벽/보안 그룹에서 TCP 80번과 443번 포트의 외부 접근을 허용합니다.
3. 브리지를 시작합니다.

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

   Compose는 브리지를 `127.0.0.1:8787`에만 게시하므로 인터넷에 직접 노출되지 않습니다.

4. 사용 중인 운영체제의 안내에 따라 Caddy를 설치하고 다음 `Caddyfile`을 만듭니다.

   ```caddyfile
   toss-mcp.example.com {
     reverse_proxy 127.0.0.1:8787
   }
   ```

5. 재부팅 후에도 시작되도록 Caddy를 시스템 서비스로 실행합니다. 공개 도메인이 올바른 서버를 가리키고 80/443번 포트에 접근할 수 있으면 Caddy가 인증서를 자동으로 발급 및 갱신하고 HTTP를 HTTPS로 리디렉션합니다. [Caddy 공식 설치 안내](https://caddyserver.com/docs/install), [리버스 프록시 문서](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [자동 HTTPS 요구사항](https://caddyserver.com/docs/automatic-https)을 참고하세요.
6. 가능하면 다른 네트워크에서 공개 엔드포인트를 확인합니다.

   ```bash
   curl --fail https://toss-mcp.example.com/health
   curl -i https://toss-mcp.example.com/mcp
   ```

   상태 확인 요청은 성공해야 합니다. 인증하지 않은 MCP 요청은 거부되어야 합니다. 보호된 엔드포인트가 공개 요청에 `200`을 반환하면 설정 오류입니다.

7. Toss 플러그인 HTTP ACL에는 `https://toss-mcp.example.com`만 추가합니다. 스킴과 호스트명은 `TOSS_MCP_PUBLIC_URL`과 일치해야 하며 경로를 추가하면 안 됩니다.

Caddy가 인증서를 발급하지 못하면 먼저 DNS, 외부 80/443번 포트, 해당 포트를 점유한 다른 프로세스가 있는지 확인하세요. 8787번 포트를 일반 HTTP로 노출하는 방식으로 우회하지 마세요.

## 옵션 B: 이름이 지정된 Cloudflare Tunnel

브리지가 NAT 뒤에 있거나, 매장에서 외부 연결을 받을 수 없거나, 공인 IP가 없는 매장 컴퓨터에서 브리지를 실행하는 경우 사용하세요.

Cloudflare의 [로컬 관리 터널 안내](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/)에 따라 **이름이 지정된 영구 터널**을 생성하고 직접 관리하는 호스트명을 `http://127.0.0.1:8787`에 연결합니다. 재부팅 후 시작되도록 `cloudflared`를 서비스로 설치하세요.

생성된 공개 호스트명을 `TOSS_MCP_PUBLIC_URL`과 Toss HTTP ACL origin으로 사용합니다. 임시 Quick Tunnel은 짧은 샌드박스 테스트에만 적합합니다. 무작위 호스트명이 바뀌면 Toss ACL과 POS에 저장된 페어링 URL이 모두 작동하지 않습니다.

플러그인이 지원하는 비대화형 서비스 토큰 흐름을 별도로 구성하지 않았다면, POS 수집 엔드포인트 앞에 Cloudflare Access의 브라우저 로그인 페이지를 두지 마세요. 브리지는 이미 POS 요청에 HMAC 서명을, MCP 클라이언트에 Bearer 토큰을 사용합니다.

## Docker 없이 실행하기

로컬 개발 또는 systemd/launchd로 관리하는 호스트에서는 다음을 실행합니다.

```bash
npm install
npm run build:all
npm run bridge
```

운영체제의 서비스 관리자로 Node 프로세스를 계속 실행하세요. 위와 동일하게 Caddy 또는 이름이 지정된 터널의 대상 주소를 `http://127.0.0.1:8787`로 설정합니다.

## POS 플러그인 설치 전 검증

다음 네 가지를 모두 확인하세요.

1. POS 네트워크에서 `https://your-host/health`가 작동합니다.
2. URL에 공개적으로 신뢰되는 인증서가 적용되어 있고 브라우저 경고가 없습니다.
3. `.env`의 `TOSS_MCP_PUBLIC_URL`에 동일한 origin이 들어 있습니다.
4. Toss 개발자 애플리케이션 HTTP ACL에 동일한 origin이 들어 있습니다.

확인을 마치면 [Toss 개발자 플러그인 설정](toss-developer-setup.md)으로 이동하세요.

## 운영 및 업그레이드

- Docker 볼륨 또는 SQLite 데이터베이스를 백업하세요. 가맹점 POS 데이터와 페어링 상태가 들어 있습니다.
- `.env`, 데이터베이스 파일, 토큰, 터널 자격 증명, Caddy 비공개 데이터를 Git에 포함하지 마세요.
- 업그레이드를 pull한 뒤 `npm install`, `npm run check`, `npm run build:all`을 실행하거나 Compose 서비스를 다시 빌드하세요.
- 플러그인 코드/버전이 변경된 경우에만 Toss 플러그인 ZIP을 다시 빌드하고 배포하세요. 릴리스 노트에 별도 안내가 없다면 브리지만 업데이트할 때 POS 플러그인을 다시 설치할 필요가 없습니다.
- 재시작과 업그레이드 후 `npm run doctor`를 실행하세요. `/health`가 정상이어도 `last seen` 또는 `last sync` 시각이 오래되었다면 장애로 취급해야 합니다.
