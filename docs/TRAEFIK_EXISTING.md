# 让现有 Traefik 反代 WeRSS（挂网 + labels）

思路：**Traefik 和 `werss` 必须在同一个 Docker 网络上**，Traefik 才能通过容器 DNS 访问 `http://werss:8001`；再用 **Docker Provider** 读 `werss` 容器上的 **labels** 生成路由。

## 1. 查清主栈 Traefik 用的网络名

在跑 Traefik 的机器上：

```bash
docker ps --format '{{.Names}}' | grep -i traefik
docker inspect <traefik 容器名> --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

记下其中一个 **同时** 被 Traefik 和后端服务使用的网络（常见名：`traefik`、`proxy`、`web`、或主栈自定义名）。

## 2. 查清 Traefik 的 entrypoint 与证书解析器名

看 Traefik **静态配置**（`traefik.yml`、compose 里的 `command:`）里类似：

- `entryPoints`：HTTPS 常叫 `websecure`，HTTP 常叫 `web`
- `certificatesResolvers`：例如 `letsencrypt`、`myresolver`

labels 里的 `entrypoints=`、`tls.certresolver=` **必须和这里一致**，否则路由不会生效或申不到证书。

## 3. 改 WeRSS 的 compose（要点）

1. **`werss` 加入 Traefik 所在 external 网络**（上一步查到的名字）。
2. **给 `werss` 加 Traefik labels**（域名、entrypoint、证书、后端端口 `8001`）。
3. **由 Traefik 对外提供 HTTPS 时**，可 **注释掉** `werss` 的 `ports: "8001:8001"`，避免多余暴露（调试时可保留）。

## 4. 用仓库里的叠加文件（推荐）

若你使用本仓库的 `docker-compose.standalone.yml` 启动 `werss`，可再叠一层：

```bash
export WERSS_TRAEFIK_NETWORK=你的_traefik_网络名
export WERSS_HOST=werss.example.com
export WERSS_TLS_RESOLVER=letsencrypt   # 与 Traefik 静态配置一致

docker compose \
  -f docker-compose.standalone.yml \
  -f docker-compose.standalone.traefik.yml \
  up -d
```

`.env` 里也可写同名变量，compose 会自动代入。

## 5. 验证

```bash
# Traefik 容器内应能访问 werss 服务名（同一网络才有 DNS）
docker exec <traefik 容器名> wget -qO- http://werss:8001/api/health

# 本机若仍映射了 8001
curl -sS http://127.0.0.1:8001/api/health
```

浏览器访问 `https://werss.example.com`（请换成你的域名），DNS **A 记录**须指向这台服务器的公网 IP。

**说明：** `docker-compose.standalone.traefik.yml` 只追加 `traefik_edge` 网络；`werss_standalone` 仍由主文件创建。若合并后 `werss` 未出现在 Traefik 网络里，用 `docker network connect <traefik网络名> werss` 连一次再检查 Traefik Dashboard。

## 常见问题

| 现象 | 排查 |
|------|------|
| 502 / 无路由 | `werss` 是否在同一网络；`loadbalancer.server.port` 是否为 **8001**；容器是否健康 |
| 证书一直不下发 | `certresolver` 名是否拼对；80 是否通（HTTP-01）；防火墙 |
| 只想要 HTTP 内网 | `entrypoints=web`，并去掉 `tls.*` 相关 labels |
