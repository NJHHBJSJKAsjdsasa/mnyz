# 10 · 安全（详细设计）

> 对应主文档 §14。本篇给出：威胁模型与控制点、角色权限、RLS、输入输出规则、会话与传输、审计事件、密钥、供应链、事故响应、验收。

---

## 1. 威胁模型

| # | 威胁 | 攻击方式 | 控制点 | 检测 |
|---|---|---|---|---|
| T1 | 越权读 | 改 URL/body 里的 `player_id` | repo 强制注入 + 404 + RLS | 审计中的 404 突增 |
| T2 | 越权写 | 伪造写请求 | 同上 + 幂等键绑定 account | 异常写入模式 |
| T3 | 客户端改数值 | 改 localStorage / 拦截响应 | 服务端权威计算；前端只发意图 | 收益上限校验 |
| T4 | 重放领奖 | 重发请求 | 幂等键 + 唯一约束 | `idempotent_replays_total` |
| T5 | 撞库/爆破 | 批量尝试 | Argon2id + 账号/IP 双限流 + 锁定 | `login_attempts` |
| T6 | 令牌泄露 | XSS 读取 | access 仅内存；refresh HttpOnly；轮换 + 重放检测 | `session_reuse_detected` |
| T7 | SQL 注入 | 拼接参数 | 全参数化 + CI 扫描 | 代码审计 |
| T8 | DoS | 高频/大 body | 限流 + `client_max_body_size` + 超时 | 429/5xx 比例 |
| T9 | 内部误操作 | 手改生产库 | 账本不可变 + 审计 + 无超级用户 | 对账偏差 |
| T10 | 依赖漏洞 | 过期包 | 固定版本 + `pip-audit` + 镜像扫描 | CI |

---

## 2. 角色与权限

```sql
CREATE ROLE atlas_migrator LOGIN PASSWORD '…';
CREATE ROLE atlas_app      LOGIN PASSWORD '…';
CREATE ROLE atlas_readonly LOGIN PASSWORD '…';

GRANT USAGE ON SCHEMA public TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atlas_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atlas_app;
GRANT USAGE, SELECT, UPDATE ON ALL TABLES IN SCHEMA universe_cache TO atlas_app;

REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries, planet_audit, audit_log FROM atlas_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO atlas_readonly;
```

规则：

1. 应用**永不**使用 `postgres` 超级用户（启动自检拦截）。
2. DDL 只能由迁移执行；`atlas_app` 无 `CREATE`。
3. 权限变更走迁移，不手工 `GRANT`。
4. 生产连接 `sslmode=require`。

---

## 3. RLS

```sql
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_wallet ON wallets
  USING (player_id = current_setting('app.player_id', true)::uuid);

-- 每个事务
SET LOCAL app.player_id = '<uuid>';
```

必加 RLS：`wallets`、`planet_claims/modifiers/structures/deposits`、`world_planets`。
执行顺序：先 repo 注入（M2）→ 再加 RLS（M3 后），避免早期调试困难。

---

## 4. 输入与输出

| 面 | 规则 |
|---|---|
| 请求体 | pydantic 严格模式：未知字段拒绝、枚举白名单、数值范围 |
| 数值 | 拒绝 `NaN/Inf`；数量 ≤ 9999；单价 ≤ 1e6；坐标 0–1e7 |
| 字符串 | 长度上限（名称 24、UA 256）；去控制字符 |
| 文件 | 仅存档导入；类型与大小限制 1MB；解析失败即拒 |
| 路径 | 不接受用户路径；文件名由服务端生成 |
| SQL | 全参数化；CI 正则扫描 `f"SELECT`、`% (` |
| 输出 | 不回显堆栈；错误只带 `code` + `request_id` |
| 日志 | token/密码/邮箱脱敏 |

---

## 5. 会话与传输

| 项 | 要求 |
|---|---|
| TLS | 1.2+，HSTS ≥ 6 个月，禁弱套件 |
| Cookie | `HttpOnly; Secure; SameSite=Strict; Path=/auth` |
| CORS | 白名单；带凭证时禁止 `*` |
| CSRF | refresh 用 Cookie 时校验 `Origin` + 自定义头 |
| access | 仅内存，不落 localStorage |
| 登出 | 吊销当前 session；`logout-all` 吊销全部 |
| 会话上限 | 单账号 10 个活跃 session，超出踢最旧 |

---

## 6. 审计

| 事件 | 字段 |
|---|---|
| 登录成功/失败 | account_id, ip, ua, result |
| 改密 / 登出全部 | account_id, ip |
| 领奖 / 大额交易（≥1000 当量） | player_id, tx_id, 金额 |
| 存档导入 | account_id, 文件哈希, 导入总量 |
| 管理操作 | actor, action, target, before/after |
| 越权访问 | player_id(请求者), target, route |

要求：只 INSERT；月分区；保留 24 个月；查询审计本身也审计。

---

## 7. 密钥

| 项 | 方案 |
|---|---|
| JWT 私钥 | 运行时注入，不入镜像层 |
| DB 口令 | 环境变量/密钥管理 |
| 备份加密 | 独立密钥，与备份分离 |
| 轮换 | JWT 90 天双 `kid`；DB 口令 180 天 |
| 泄露处置 | 换钥 + `token_version++` + 全量吊销 + 公告 |

---

## 8. 供应链

1. `requirements.txt` 固定版本；升级走 PR + 全量测试。
2. `pip-audit` 每周；高危 7 天内修。
3. 镜像最小化（无编译链），非 root 运行，只读根文件系统。
4. 依赖锁文件校验和入库。
5. 构建产物签名/可追溯（CI 记录 commit）。

---

## 9. 事故响应

```
1. 发现：告警 / 举报 / 对账偏差
2. 止血：吊销会话、封禁账号、关闭入口开关（feature flag）
3. 取证：导出该账号账本 + 审计 + 请求日志（按 request_id/trace_id）
4. 修复：补偿交易（不改历史）+ 代码修复 + 回归测试
5. 复盘：写入风险表与本文档「威胁模型」新增行
6. 通知：涉及资金/隐私时按合规要求告知
```

---

## 10. 测试

```text
T1  生产账号无 DDL 权限；UPDATE ledger_entries 被拒
T2  越权读/写 → 404 + 审计记录
T3  未设 app.player_id 时查 wallets → 0 行（RLS 生效）
T4  refresh 重放 → 全量吊销 + 告警
T5  SQL 注入扫描（CI）零命中
T6  日志中 grep token/密码 → 零命中
T7  备份文件加密；无密钥无法解密
T8  删除账号流程：30 天后数据不可查，审计保留脱敏副本
T9  超大 body → 413；超长字符串 → 400
T10 依赖漏洞扫描无高危未处理项
```

---

## 11. 验收

- [ ] 三角色权限矩阵与本文一致（脚本比对 `information_schema`）
- [ ] 必加 RLS 的表全部启用
- [ ] 审计事件覆盖 6 类且可查询
- [ ] 密钥不在仓库/镜像/日志
- [ ] 事故响应演练一次（含补偿交易）
- [ ] 合规：删除权、导出权可用

## 12. 相关文档

- 认证细节：[03-auth.md](03-auth.md)
- 审计与告警：[11-observability.md](11-observability.md)
- 账本补偿：[05-economy-ledger.md](05-economy-ledger.md)
