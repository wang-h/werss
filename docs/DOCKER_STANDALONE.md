# WeRSS 独立部署（Docker）

当你的环境里 **已经有** PostgreSQL、MinIO、Traefik（例如 deepling.tech 主栈），不要用 `docker-compose.dev.yml`：它会再起一套数据库和 MinIO，并占用 `5432`、`9000` 等端口，与主栈冲突。

## 该用哪个文件

| 场景 | 文件 |
|------|------|
| 本机一键开发（自带库 + MinIO + 直连端口） | `docker-compose.dev.yml` |
| 只跑 WeRSS 容器，库和对象存储用现成的 | `docker-compose.standalone.yml` |

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

应用在容器里读的是 **`DB`**（以及你在 `config.yaml` / 环境变量里为 MinIO 等配的项），需保证 **从 werss 容器内能解析并连上** Postgres。

**常见坑：** 若 `DB` 里是 `@postgres:5432`，这只在「与名为 `postgres` 的容器同网」时成立。默认只用 `docker-compose.standalone.yml` 时 **没有** `postgres` 服务，会连不上——要么把 werss 加入主栈网络，要么把主机名改成 `host.docker.internal`（并保证 Postgres 在宿主机可连）。

1. **Postgres 在主栈 Docker 里，且能与 werss 同网**  
   - 把 werss 加入主栈使用的 `external` 网络（见下文 Traefik 示例）。  
   - `.env` 里 `DB` 用主栈里的服务名，例如：`...@postgres:5432/deepling_db`。

2. **Postgres 只映射在宿主机 `127.0.0.1:5432`**  
   - `docker-compose.standalone.yml` 已加 `host.docker.internal`。  
   - `.env` 示例：`DB=postgresql://用户:密码@host.docker.internal:5432/数据库名`。

3. **密码含 `@` 等特殊字符**  
   - 在连接串里对用户/密码做 URL 编码，或使用主栈推荐的写法。

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
