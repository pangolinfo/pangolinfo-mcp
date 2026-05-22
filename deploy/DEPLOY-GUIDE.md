# Pangolinfo MCP v0.2.0 — 阿里云 ACK 部署手册

> 部署目标: 让 WorkBuddy / 其他 MCP 客户端通过 `https://mcp.pangolinfo.com/mcp?api_key=pgl_xxx` 直接连云端 MCP server,无需安装任何东西。

---

## 现状速览

| 项 | 值 |
|---|---|
| ACK 集群 | `crawler` @ ap-southeast-1 (新加坡) |
| 镜像仓库 | `registry-intl.ap-southeast-1.aliyuncs.com/pangolinfo-prod/pangolinfo-mcp` |
| 镜像 tag | `0.2.0`,`latest` (已推送 ✅) |
| 镜像 digest | `sha256:3821c349c9c3ad588a587c63bd557dff24daad97ce4816658b8ab356f1b5298b` |
| 镜像大小 | 137 MB |
| 容器端口 | 3000 (HTTP) |
| 探针路径 | `GET /health` |
| MCP 协议端点 | `POST /mcp` |

---

## Step 1: 部署 Deployment + Service (5 分钟)

1. 打开 ACK 控制台 → `crawler` 集群 → **工作负载 → 无状态**
2. 右上角 **使用 YAML 创建**
3. 把 `deploy/k8s-deployment.yaml` 整个文件内容贴进去
4. 点 **创建**
5. 看到 `pangolinfo-mcp` 2 个 Pod 跑起来,状态 Running 即可

**验证 (在 ACK 控制台 → 网络 → 服务里)**:
- 找到 `pangolinfo-mcp` Service,Cluster IP 那一列有个内网 IP
- 在 ACK 控制台 → 工作负载 → 无状态 → `pangolinfo-mcp` → 点任一 Pod → **日志** 应该看到:
  ```
  [pangolinfo-mcp] locale=zh version=0.2.0
  [pangolinfo-mcp] transport=http
  [pangolinfo-mcp] http server listening on :3000; endpoint=/mcp health=/health; 17 tool(s) registered
  ```

---

## Step 2: 看看 scrapeapi 现在怎么暴露出去的 (1 分钟)

ACK 控制台 → **网络 → 路由 Ingress** → 看现有的 `ext-scrapeapi` 或 `scrapeapi.pangolinfo.com` 那条记录:

1. **如果 annotations 里有 `nginx.ingress.kubernetes.io/*`** → 你用的是社区 nginx-ingress,走 **Step 3-A**
2. **如果有 `alb.ingress.kubernetes.io/*`** → 阿里云 ALB Ingress,走 **Step 3-B**
3. **如果完全找不到 scrapeapi 的 Ingress** → scrapeapi 可能是用阿里云 SLB 直挂的,不走 k8s Ingress;这种情况告诉我,要单独配 SLB

⚠️ **不要直接 Step 3** 不看现状,Ingress class 选错会跟 scrapeapi 抢路由。

---

## Step 3-A: nginx-ingress 配置 (复用 scrapeapi 同一个 controller)

1. 编辑 `deploy/k8s-ingress.yaml`,**保留版本 A,删掉版本 B 的所有注释行**
2. 把里面的 `secretName: mcp-pangolinfo-tls` 改成 scrapeapi 用的那个证书 secret 名(参考 scrapeapi Ingress 里的 `tls.secretName`)
3. ACK 控制台 → 网络 → 路由 Ingress → 右上 **使用 YAML 创建** → 贴入 → 创建

---

## Step 3-B: 阿里云 ALB Ingress 配置

1. 阿里云控制台 → **数字证书管理服务** → 找你给 `*.pangolinfo.com` 或 `mcp.pangolinfo.com` 签的证书 → 复制证书 ID
   - 格式像 `ap-southeast-1:1234567890-cn-hongkong`
2. 编辑 `deploy/k8s-ingress.yaml`:
   - **删掉版本 A** 整段 (从 `apiVersion: networking.k8s.io/v1` 第一段到 `--- ===B===` 之前)
   - **解开版本 B 的注释**(把每行开头的 `#` 去掉,但行内的注释保留)
   - 把 `<你的证书ID>` 替换成第 1 步复制的证书 ID
3. ACK 控制台 → 网络 → 路由 Ingress → 右上 **使用 YAML 创建** → 贴入 → 创建

---

## Step 4: DNS 解析 (运维做,5 分钟操作 + 几分钟生效)

加一条 DNS 记录:

| 类型 | 主机 | 记录值 |
|---|---|---|
| `CNAME` 或 `A` | `mcp` | 跟 `scrapeapi.pangolinfo.com` **完全一致的目标** (CNAME 同样的 LB host,或 A 同样的 LB IP) |

> 因为 mcp 和 scrapeapi 走同一个 Ingress controller,所以指向同一个公网入口即可。Ingress 按 host 路由分流。

如果不确定,在你本机查:
```bash
nslookup scrapeapi.pangolinfo.com
# 拿到的 IP 或 CNAME 目标,就是 mcp 子域名应该指向的同一个值
```

---

## Step 5: 验证 (3 分钟)

DNS 生效后,在任何机器上跑:

```bash
# 1. health 检查 (无需 API key)
curl https://mcp.pangolinfo.com/health
# 期望: {"status":"ok","version":"0.2.0","toolCount":17}

# 2. MCP initialize
curl -X POST "https://mcp.pangolinfo.com/mcp?api_key=pgl_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}'
# 期望: 拿到 server info 含 "name":"pangolinfo-mcp","version":"0.2.0"

# 3. 列工具 (17 个)
curl -X POST "https://mcp.pangolinfo.com/mcp?api_key=pgl_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
# 期望: 17 个 tool

# 4. 真调用一次免费工具
curl -X POST "https://mcp.pangolinfo.com/mcp?api_key=pgl_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pangolinfo_capabilities","arguments":{"mode":"summary"}}}'
# 期望: 拿到 17 个工具的 one-liner 描述
```

---

## Step 6: 给 Joey / WorkBuddy 用户的配置

WorkBuddy 配置面板里填:

```
MCP server URL: https://mcp.pangolinfo.com/mcp?api_key=pgl_xxxxxxxxxxxx
```

**完事** — Joey 什么都不用装。

替代写法(WorkBuddy 如果支持 Authorization header):
```
URL:    https://mcp.pangolinfo.com/mcp
Header: Authorization: Bearer pgl_xxxxxxxxxxxx
```

---

## 升级镜像 (以后改了 MCP 代码怎么发新版)

```bash
# 在 D:/newCode/pangolinfo-platform/pangolinfo-mcp/ 下
wsl docker build -t registry-intl.ap-southeast-1.aliyuncs.com/pangolinfo-prod/pangolinfo-mcp:0.2.1 .
wsl docker push registry-intl.ap-southeast-1.aliyuncs.com/pangolinfo-prod/pangolinfo-mcp:0.2.1
# 然后 ACK 控制台 → 无状态 → pangolinfo-mcp → 升级 → 镜像 tag 改成 0.2.1 → 提交
# 滚动更新,无中断
```

---

## 监控建议 (可选,以后做)

1. **Prometheus**: ACK 自带 ack-prometheus,加抓 `pangolinfo-mcp:3000/metrics` (待 v0.3 加 metrics 端点)
2. **日志**: ACK 默认 logtail 把 stderr 收到 SLS,可建告警: `level=error` 数量突增
3. **可用性**: ACK 控制台 → 应用 → 无状态 → pangolinfo-mcp,看 Pod CPU/内存/重启次数

---

## 排查

| 症状 | 可能原因 | 排查方法 |
|---|---|---|
| Pod CrashLoopBackOff | 镜像拉不下来 / 配置错 | ACK Pod → 事件 / 日志 |
| 401 AUTH 但已经传了 key | URL 编码问题 / WorkBuddy 没透传 | curl 测一下 raw URL,看是否带上 ?api_key |
| 502 / 504 | Ingress 长连接超时 | 确认 `proxy-read-timeout` 设了 3600 |
| 调 tool 返回 RATE_LIMIT | 真的撞了 scrapeapi 后端限流 | 这是正常业务错误,客户自己降 QPS |
| 调 tool 返回 NETWORK | MCP server 出网到 scrapeapi 失败 | 看 pod 日志,如果 scrapeapi 在同集群应换内网地址 |

---

## 已推送的镜像列表

```
registry-intl.ap-southeast-1.aliyuncs.com/pangolinfo-prod/pangolinfo-mcp:0.2.0
registry-intl.ap-southeast-1.aliyuncs.com/pangolinfo-prod/pangolinfo-mcp:latest
```

两个 tag 指向同一镜像 (sha256:3821c349...)。
