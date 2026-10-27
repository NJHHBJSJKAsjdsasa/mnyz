# 03 · 认证与授权（详细设计）

> 对应主文档 §4。本篇给出：账号状态机、字段级表、口令参数、令牌结构与轮换算法、授权规则、限流键与阈值、错误码、测试。
> 目标：**匿名可玩、登录可续、令牌可废、越权不可达。**

---

## 1. 账号状态机

```
            register(邮箱+密码)
guest ─────────────────────────────▶ active
  │                                    │
  │ 直接登录（游客态）                   │ 连续失败 5 次
  ▼                                    ▼
guest(player 已存在)                 locked ──15 分钟后自动 / 改密──▶ active
                                       │
                                       └─ 用户删除 ──▶ deleted（30 天后物理删除）
```

| 状态 | 能否读 | 能否写 | 能否登录 | 备注 |
|---|---|---|---|---|
| `guest` | 是 | 是 | 是（凭设备 refresh） | 无 email/password |
| `active` | 是 | 是 | 是 | 正常 |
| `locked` | 是 | 否 | 否 | 锁定原因写审计 |
| `deleted` | 否 | 否 | 否 | 30 天内可申诉恢复 |

---

## 2. 表结构（字段级）

### 2.1 `accounts`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | — |
| `email` | citext | UNIQUE（部分索引，仅非空） | 大小写不敏感 |
| `password_hash` | text | NULL | Argon2id 全串（含参数） |
| `email_verified_at` | timestamptz | NULL | 未验证不允许改密 |
| `status` | text | CHECK (`guest`,`active`,`locked`,`deleted`) | 状态机 |
| `role` | text | CHECK (`player`,`ops`,`admin`) | 管理接口 |
| `failed_logins` | smallint | DEFAULT 0, CHECK ≥0 | 防爆破 |
| `locked_until` | timestamptz | NULL | 到期自动解锁 |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | — | — |

约束：`CHECK (status <> 'active' OR password_hash IS NOT NULL)`。

### 2.2 `players`（要点，完整见 04）

`account_id` FK、`universe_id` FK、`slot`、`display_name`、`timezone`、`state_version`、`last_seen_at`、`locked_reason`。
**玩家身份与账号分离**：账号可绑定多个宇宙角色，但一个 `player_id` 永远属于一个 `account_id`。

### 2.3 `sessions`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | 即 JWT 的 `sid` |
| `account_id` | uuid | FK CASCADE | — |
| `player_id` | uuid | FK NULL | 游客期可空 |
| `refresh_hash` | text | UNIQUE NOT NULL | Argon2id 哈希，不存明文 |
| `rotated_from` | uuid | FK→sessions.id | 轮换链，用于重放检测 |
| `user_agent` | text | NULL, ≤256 | 设备识别 |
| `ip` | inet | NULL | 审计 |
| `created_at` / `last_used_at` / `revoked_at` | timestamptz | — | 30 天滚动 |
| `revoke_reason` | text | NULL | `logout`/`reuse_detected`/`password_change` |

索引：`(account_id, revoked_at)`；`(refresh_hash)` 唯一。

### 2.4 `login_attempts`

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | bigserial | — |
| `identifier` | text | 邮箱或 `player_id` |
| `ip` | inet | — |
| `success` | bool | — |
| `created_at` | timestamptz | 索引 `(identifier, created_at DESC)` |

---

## 3. 口令

| 项 | 值 | 理由 |
|---|---|---|
| 算法 | Argon2id | 抗 GPU/ASIC |
| 参数 | `m=65536`(64MB)、`t=3`、`p=4` | 单次 ~80ms，可抵御离线爆破 |
| 盐 | 16B 随机，随哈希存储 | — |
| 最短长度 | 10 | 平衡可用性 |
| 禁止 | 纯数字、与邮箱相同、常见弱口令表 | 降低撞库成功率 |
| 上限 | 128 字符 | 防 DoS（超长哈希） |

哈希串格式：`$argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>`（自描述，便于将来调参）。

改密流程：

```
1. 校验旧密码
2. UPDATE accounts SET password_hash=..., updated_at=now()
3. UPDATE sessions SET revoked_at=now(), revoke_reason='password_change' WHERE account_id=...
4. 写审计（含 IP/UA）
5. 返回 200，前端跳登录
```

---

## 4. 令牌

### 4.1 Access Token（JWT RS256）

| 声明 | 值 |
|---|---|
| `sub` | `player_id` |
| `sid` | `sessions.id` |
| `ver` | `accounts.token_version`（改密/强制下线时 +1） |
| `role` | `player/ops/admin` |
| `iat` / `exp` | 签发 / 15 分钟后 |
| `iss` / `aud` | `atlas` / `atlas-api` |
| `jti` | 随机，便于日志追踪（不用于吊销） |

签名：RS256，`kid` 放 header，支持双钥轮换。
校验：本地验签 + 校验 `exp/iss/aud` + 查 `ver`（缓存 30s，避免每请求查库）。

### 4.2 Refresh Token

- 形式：32 字节随机（base64url），**不是 JWT**。
- 存储：仅存 Argon2id 哈希；传输用 `HttpOnly; Secure; SameSite=Strict; Path=/auth` Cookie。
- 有效期：30 天滚动（每次刷新重置）。
- 一次性：每次刷新都生成新值，旧值标记 `rotated_from`。

### 4.3 轮换算法

```python
def refresh(old_token, sid_hint=None):
    row = find_session_by_hash(old_token)          # 全表唯一索引
    if row is None:
        return detect_reuse(old_token)             # 见 4.4
    if row.revoked_at is not None:
        return 401('session_revoked')

    new_token = secrets.token_urlsafe(32)
    new_id = uuid4()
    # 同一事务
    UPDATE sessions SET revoked_at=now(), revoke_reason='rotated', last_used_at=now()
     WHERE id=row.id AND revoked_at IS NULL          # 并发下只有一个成功
    INSERT INTO sessions(id, account_id, player_id, refresh_hash, rotated_from, ua, ip)
     VALUES (new_id, row.account_id, row.player_id, hash(new_token), row.id, ua, ip)
    issue_access(row.player_id, new_id)
    set_cookie(new_token)
```

并发刷新（两个标签页同时刷新）：条件更新只有一方成功，另一方收到 401 后重试一次即可；**不判定为泄露**（区分「条件更新失败」与「哈希查不到」）。

### 4.4 重放检测

```
查 refresh_hash 未命中
   → 在 sessions 中查是否有 rotated_from 链能「前缀匹配」
   → 若存在：说明该 token 已被使用过
   → 处置：吊销该 account 全部 session（revoke_reason='reuse_detected'）
           写审计 + 告警
   → 返回 401 session_reuse_detected
```

误报控制：只对「30 天内且未被吊销」的链判定；同一 `sid` 的网络抖动重试（5 秒内同 UA）不触发全量吊销，只返回原 access（幂等窗口）。

### 4.5 密钥轮换

| 项 | 做法 |
|---|---|
| 双钥 | `kid=2026-10`（新）、`kid=2026-09`（旧，仅验签） |
| 轮换周期 | 90 天 |
| 旧钥保留 | 15 分钟（覆盖 access 寿命）后移除 |
| 泄露处置 | 立即换钥 + `token_version += 1` + 全量吊销 |

---

## 5. 授权

### 5.1 规则

| 主体 | 允许 | 禁止 |
|---|---|---|
| 未认证 | `/auth/*`、`/health/*`、静态资源 | 任何 `/api/v1/*` |
| 玩家 | 自己的资源读写、公开榜单只读 | 他人的任何资源、管理接口 |
| ops | 只读诊断、封禁、补偿（走审批） | 改他人密码、删数据 |
| admin | 全部 + 配置 | —（但所有操作进审计） |

### 5.2 强制注入

```python
# repo 层统一
def scoped(player_id):
    return {"player_id": player_id}     # 所有查询自动带
```

**禁止**从 body/query 读取 `player_id`；唯一来源是 JWT。
越权访问返回 **404**（不返回 403），避免探测资源是否存在。

### 5.3 RLS（第二阶段启用）

```sql
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_wallet ON wallets
  USING (player_id = current_setting('app.player_id', true)::uuid);
-- 事务开始：SET LOCAL app.player_id = '<uuid>';
```

必加：`wallets`、`planet_claims/modifiers/structures/deposits`、`world_planets`。

---

## 6. 限流与防爆破

### 6.1 键与阈值

| 接口 | 键 | 阈值 | 窗口 | 动作 |
|---|---|---|---|---|
| `POST /auth/login` | `rl:login:ip:{ip}` | 5 | 1 分钟 | 429 |
| `POST /auth/login` | `rl:login:acc:{account}` | 10 | 1 小时 | 429 + 锁 15 分钟 |
| `POST /auth/register` | `rl:reg:ip:{ip}` | 3 | 1 小时 | 429 |
| 写接口 | `rl:api:{player_id}:{route}` | 60（突发 20） | 1 分钟 | 429 |
| 读接口 | `rl:api:{player_id}:{route}` | 300 | 1 分钟 | 429 |
| `/health/*` | 不限流 | — | — | 仅内网 |

### 6.2 令牌桶（Redis Lua，原子）

```lua
-- KEYS[1]=bucket  ARGV: capacity, refill_per_ms, now_ms, cost
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or tonumber(ARGV[1])
local ts = tonumber(b[2]) or tonumber(ARGV[3])
local delta = math.max(0, tonumber(ARGV[3]) - ts)
tokens = math.min(tonumber(ARGV[1]), tokens + delta * tonumber(ARGV[2]))
if tokens < tonumber(ARGV[4]) then
  redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', ARGV[3])
  return 0
end
redis.call('HMSET', KEYS[1], 'tokens', tokens - tonumber(ARGV[4]), 'ts', ARGV[3])
redis.call('PEXPIRE', KEYS[1], 120000)
return 1
```

### 6.3 失败锁定

```
失败：UPDATE accounts SET failed_logins = failed_logins + 1
     WHERE id=... RETURNING failed_logins
达到 5：SET locked_until = now() + 15 分钟，写审计，发通知
成功：UPDATE accounts SET failed_logins = 0, locked_until = NULL
```

---

## 7. 错误码

| 场景 | HTTP | code | 客户端 |
|---|---|---|---|
| 缺少/无效令牌 | 401 | `unauthenticated` | 触发刷新 |
| 令牌过期 | 401 | `token_expired` | 静默刷新 |
| 会话被吊销 | 401 | `session_revoked` | 跳登录 |
| 检测到重放 | 401 | `session_reuse_detected` | 强制登录 |
| 账号锁定 | 423 | `account_locked` | 提示解锁时间 |
| 密码错误 | 401 | `invalid_credentials` | 不区分「账号不存在」 |
| 越权访问 | 404 | `not_found` | 不提示存在性 |
| 无管理权限 | 403 | `forbidden` | — |
| 限流 | 429 | `rate_limited` | 按 `Retry-After` 退避 |

**安全细节**：登录失败一律返回 `invalid_credentials`（不暴露账号是否存在）；响应时间做常数化（无账号也跑一次 Argon2 校验，避免时序侧信道）。

---

## 8. 测试用例

```text
T1  注册 → 登录 → 访问 /me → 200，role=player
T2  错误密码 5 次 → 423 + locked_until；15 分钟后可登录
T3  refresh 使用后立即重放 → 401 session_reuse_detected，且该账号全部 session 被吊销
T4  两标签页并发 refresh → 一个 200，一个 401 后重试成功（不误判泄露）
T5  access 过期 → 401 token_expired → 刷新后成功
T6  改密后旧 access/refresh 全部 401
T7  拿 A 令牌访问 B 的 /planets/{key} → 404（不是 403）
T8  无 `ops` 角色访问 /admin/* → 403
T9  限流：61 次写请求/分钟 → 第 61 次 429，带 Retry-After
T10 游客升级为账号 → player_id 不变，进度不丢
T11 登出所有设备 → 全部 session 401
T12 换钥后旧 kid 的 access 在 15 分钟内仍可验签，之后 401
```

---

## 9. 验收清单

- [ ] access 不落 localStorage（代码扫描 + 手工验证）
- [ ] refresh Cookie 具备 `HttpOnly/Secure/SameSite=Strict`
- [ ] 重放检测实测触发一次全量吊销
- [ ] 越权返回 404 且写审计
- [ ] 限流在 4 worker 下仍准确（Redis 原子）
- [ ] 口令哈希参数可解析，调参不需迁移
- [ ] 所有认证事件进审计（登录/失败/改密/吊销）

## 10. 相关文档

- 字段级表结构：[04-data-model.md](04-data-model.md)
- 安全与威胁模型：[10-security.md](10-security.md)
- 接口契约：[08-api.md](08-api.md)
