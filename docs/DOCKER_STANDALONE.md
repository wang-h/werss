# WeRSS 独立部署（Docker）

当你的环境里 **已经有** PostgreSQL、MinIO、Traefik（例如 deepling.tech 主栈），不要用 `docker-compose.dev.yml`：它会再起一套数据库和 MinIO，并占用 `5432`、`9000` 等端口，与主栈冲突。

## 该用哪个文件

| 场景 | 文件 |
|------|------|
| 本机一键开发（自带库 + MinIO + 直连端口） | `docker-compose.dev.yml` |
| 只跑 WeRSS 容器，库和对象存储用现成的 | `docker-compose.standalone.yml`（可选再叠 `docker-compose.standalone.db-network.yml`，见下文数据库一节） |

## 配置优先级、控制台与重启

运行时 `cfg.get()` 的取值顺序如下：

| `WERSS_ENV_OVERRIDES_DB` | 行为 |
|--------------------------|------|
| **未设置 / false**（默认） | 若 PostgreSQL 表 `config_management` 中有该 `config_key`，**优先用数据库**；否则用 `config.yaml` 占位符展开后的值（含环境变量）。连接串 **`db` 从不走表覆盖**。 |
| **true**（`1` / `yes` / `on` 亦可） | **先用 yaml + 环境变量**；仅当该项在配置里不存在，或值为 **空字符串** / **null** 时，才回退到 `config_management` 表。 |

**重启会不会丢？**

- 进程内缓存会清空，但 **PostgreSQL 里的行不会丢**，重启后会重新加载。
- 控制台保存的配置写在 **`config_management` 表里**，与 `.env` 是两套来源；默认模式下表里有的键会**盖过** `.env`。若你改了 `.env` 仍看到旧值，检查表中是否仍有该键；要完全以 `.env` 为准可删除对应行，或设置 `WERSS_ENV_OVERRIDES_DB=true`。
- **推荐**：生产基线用 `.env` / Secret；需要热改再写控制台；只信环境变量时用 `WERSS_ENV_OVERRIDES_DB=true`。

配置列表 API 在默认模式下会合并表内值以便与运行时一致；在 `WERSS_ENV_OVERRIDES_DB=true` 时列表仅反映 yaml/.env，不与表合并展示。

## 启动

```bash
docker compose -f docker-compose.standalone.yml up -d --build
```

数据与日志目录可通过环境变量覆盖（可选）：

- `WERSS_DATA_DIR`（默认 `./data/werss-data`）
- `WERSS_LOGS_DIR`（默认 `./logs`）
- `WERSS_PUBLISH_PORT`（默认 `8001`）
- `WERSS_CONTAINER_NAME`（默认 `werss`）

## `.env` 里数据库怎么写

WeRSS 进程只读环境变量 **`DB`**（`DATABASE_URL` / `DEEPLING_DB_URL` 等是给主栈其它服务用的，按各自运行位置填写即可）。

### 先分清：Postgres 的端口映射是哪一种

在宿主机执行 `ss -tlnp | grep 5432` 或 `docker ps` 看 Postgres 一行的 **Ports**：

| 映射方式 | 从 werss 容器连库 |
|----------|-------------------|
| **`127.0.0.1:5432->5432`**（仅本机回环） | 走 **`host.docker.internal` 会 `Connection refused`**：从 Docker 网桥进来的目标不是 `127.0.0.1`，宿主机上没有任何进程在 `0.0.0.0:5432` 监听。 |
| **`0.0.0.0:5432->5432`** 或 **`5432:5432`** | 可用 **`host.docker.internal:5432`**（`docker-compose.standalone.yml` 已配 `extra_hosts`）。 |

**不要用 `localhost`：** 在 werss 容器里 `localhost` 是 **容器自己**，不是宿主机。

### 做法 A：改主栈映射（适合坚持「经宿主机端口」）

把 Postgres 的 `ports` 从 `127.0.0.1:5432:5432` 改成 **`5432:5432`**（或等价地绑定到 `0.0.0.0`），然后只用单文件启动：

```bash
docker compose -f docker-compose.standalone.yml up -d --build
```

```env
DB=postgresql://用户:密码@host.docker.internal:5432/数据库名
```

### 做法 B：不改主栈，叠加入库所在 Docker 网络（你当前环境）

仓库提供 **`docker-compose.standalone.db-network.yml`**：让 werss 再挂到 Postgres 容器所在的外部网络上，用 Docker **服务名** `postgres` 访问（需与主栈里服务名一致）。

```bash
export WERSS_DB_DOCKER_NETWORK=deeplingtech_network   # docker inspect postgres 看 Networks 下的键名
docker compose -f docker-compose.standalone.yml -f docker-compose.standalone.db-network.yml up -d --build
```

```env
DB=postgresql://用户:密码@postgres:5432/数据库名
```

也可在容器起来后执行一次 `docker network connect deeplingtech_network werss`（网络名按实际改），效果同类。

**密码含 `@` 等字符**时，在连接串里对用户/密码做 URL 编码。

### 与主栈共库：`article_tags` 与外键

若主栈里 `articles.id` 是 **integer**（如 Prisma），而 WeRSS 文章主键是 **字符串**（`公众号id-文章id`），无法在 PostgreSQL 里对 `article_tags.article_id` 声明指向 `articles.id` 的外键。当前模型 **不在库层建该外键**，由应用用 `JOIN` 维护关联；删除文章时 **不会** 由数据库级联删除 `article_tags` 行。若既要共库又要严格一致，更稳妥的是为 WeRSS 使用 **独立数据库** 或与主栈对齐的同一套 id 策略。

## Traefik

若由 Traefik 反代，通常 **不必** 再向公网映射 `8001`：在 `docker-compose.standalone.yml` 里注释掉 `werss` 下的 `ports:`，并为 `werss` 增加 `labels` 与 **external** 网络，例如（域名与网络名按你主栈修改）：

```yaml
services:
  werss:
    # ports:   # 由 Traefik 接入时可整段注释
    #   - "${WERSS_PUBLISH_PORT:-8001}:8001"
    networks:
      - werss_standalone
      - traefik_public
    labels:
      - traefik.enable=true
      - traefik.http.routers.werss.rule=Host(`werss.deepling.tech`)
      - traefik.http.routers.werss.entrypoints=websecure
      - traefik.http.routers.werss.tls.certresolver=letsencrypt
      - traefik.http.services.werss.loadbalancer.server.port=8001

networks:
  werss_standalone:
    driver: bridge
    name: werss_standalone
  traefik_public:
    external: true
    name: 你的主栈_traefik_网络名   # docker network ls 查看
```

## MinIO

独立部署时 MinIO 往往在主栈或公网域名（HTTPS）。请在 `.env` / `config.yaml` 中配置与 **容器内可访问** 的 endpoint 及 `secure` 等选项；不要沿用 dev 里的 `minio:9000`，除非你在同一 Compose 里真的有一个叫 `minio` 的服务。
