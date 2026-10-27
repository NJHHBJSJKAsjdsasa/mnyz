# 10 · AI 决策引擎与外部 LLM 接口

> 分册：AI 决策  
> 关联：[06-ai-players.md](06-ai-players.md)、[07-implementation-testing.md](07-implementation-testing.md)

---

## 1. 目标

1. **确定性策略引擎**：可复现、可审计、可回放；
2. 外部 LLM 只作为**内部可选适配器**，默认关闭；
3. 不改变 AI 玩家与真人同权的规则；
4. 外部 LLM 不作为特权来源，不读私有数据，不绕过风控；
5. 对外不暴露该适配器；但运维/审计可查，避免不可审计的暗箱。

> 注意：不把“外部不可发现”当作安全边界。客户端/公开 API 不暴露是产品设计；真正安全依赖权限、密钥、网络隔离和审计。

---

## 2. 决策提供者接口

```text
DecisionProvider
  name: str
  version: str
  decide(context: DecisionContext) -> ActionPlan
```

### 2.1 `DecisionContext`

只包含公开/自身数据：

```json
{
  "agent_id": "...",
  "tick": 12345,
  "snapshot_hash": "sha256:...",
  "public_market": {
    "prices": {},
    "order_books": {},
    "candles": {},
    "indices": {},
    "rates": {},
    "fx": {}
  },
  "self": {
    "cash": {},
    "inventory": {},
    "loans": [],
    "companies": [],
    "properties": [],
    "council_seat": null
  },
  "constraints": {
    "max_order_value": "...",
    "max_position_pct": 0.1,
    "cooldowns": {}
  }
}
```

**禁止**包含：其他玩家私有库存、未公开订单、贷款明细、聊天/个人信息。

### 2.2 `ActionPlan`

```json
{
  "actions": [
    {"type": "stock.order", "listing": "ATL", "side": "buy", "price": "1.2345", "qty": 100},
    {"type": "bank.deposit", "bank_id": "...", "currency": "cc1", "amount": "1000"}
  ],
  "confidence": 0.72,
  "reason": "public summary"
}
```

- 动作必须在白名单内；
- 每个动作由 domain service 重新校验；
- 不允许直接写余额/持仓/产权；
- 失败动作记录，不重试超过 2 次。

---

## 3. 确定性引擎

### 3.1 输入

- `snapshot_hash`：公开数据 + 自身状态的规范化哈希；
- `seed = hash(agent_id | tick | snapshot_hash | policy_version)`；
- `policy_version`：策略配置版本。

### 3.2 规则

- 不使用 `random()` / 墙钟时间；
- 使用 `SeededRandom(seed)`；
- 同一输入/版本必须产生同一输出；
- 浮点用 Decimal；
- 动作排序稳定（score desc, action id）；
- 输出写入 `ai_decisions`，可回放。

### 3.3 评分

```text
score = expected_return
      - risk_aversion × volatility
      - fees
      - tax
      - opportunity_cost
      + persona_bias
```

- persona 权重来自 `ai_agents.config`；
- 约束过滤在评分前；
- top-k 选择，边际动作按 seeded RNG 扰动。

### 3.4 回放

```text
replay(agent_id, tick) -> ActionPlan
assert replay == recorded.plan
```

- 用于纠纷/审计；
- 策略升级保留旧版本；
- 回放不访问外部 LLM。

---

## 4. 外部 LLM 适配器（内部）

### 4.1 定位

- 仅作为 `DecisionProvider` 的一种实现；
- 默认 `disabled`；
- 只用于“生成候选动作/解释”，不直接执行；
- 所有动作仍由确定性风控 + domain service 校验。

### 4.2 对外不可见

产品/接口层：

- 不新增公开 API；
- 不在客户端 bundle/HTML/本地存储中出现 provider 名称；
- 不在公开错误/日志/公告/遥测标签中出现；
- 不返回 `model`、`prompt`、`provider` 字段；
- 公开 AI 目录只显示玩家身份，不显示决策来源。

运维/审计：

- 服务端配置/密钥/审计可查；
- 这是**必须保留**的，不能为了隐蔽而不可审计；
- 外部不可见是产品选择，不是“绝对无法发现”的承诺。

### 4.3 配置

```env
ATLAS_AI_PROVIDER=deterministic   # deterministic|llm
ATLAS_AI_LLM_ENDPOINT=https://internal.example/v1
ATLAS_AI_LLM_MODEL=...
ATLAS_AI_LLM_API_KEY=...
ATLAS_AI_LLM_TIMEOUT_MS=800
ATLAS_AI_LLM_MAX_ACTIONS=5
```

- 仅服务端环境变量/密钥管理；
- 不进前端、不进 Git；
- 按环境/白名单开启；
- 出网 allowlist。

### 4.4 数据最小化

- 只发公开市场摘要 + 自身公开状态；
- 不发玩家 ID/邮箱/聊天/私有库存；
- 不发其他玩家订单明细；
- 请求/响应压缩，限制大小；
- 提示词注入防护：固定 system 模板，禁止拼接玩家文本。

### 4.5 输出校验

1. JSON schema；
2. 动作白名单；
3. 数值范围/币种/市场；
4. 资金/持仓/许可/冷却由 domain service 重新校验；
5. 超时/异常 → 回退 deterministic；
6. 失败不重试超过 1 次；
7. 不准直接写 DB。

### 4.6 审计

```text
ai_decisions
  provider text
  provider_version text
  model text null
  prompt_hash text
  latency_ms integer
  token_in integer
  token_out integer
  fallback boolean
  ...
```

- 原始 prompt/response 只存加密/受控审计库（保留期）；
- 公开接口不返回；
- 运维/合规可查；
- 记录 fallback 原因。

---

## 5. 与 AI 同权规则

- 外部 LLM 不改变：
  - 手续费/税率/冷却；
  - 订单簿优先级；
  - 持仓/许可/风控；
  - 议会/法院/破产规则。
- LLM 只影响“选择什么动作”，不影响“动作是否合法”；
- 延迟不获得特权：所有订单按服务器接收时间排序；
- 不允许 LLM 直接调用内部写接口；
- AI 玩家仍可被审计/处罚/罢免。

---

## 6. 运行模式

| 模式 | 用途 |
|---|---|
| `deterministic` | 默认/生产 |
| `llm_shadow` | 只生成建议，不执行，用于对比 |
| `llm_canary` | 白名单 AI 玩家/低比例 |
| `llm_live` | 受控开启 |

- 始终保留 deterministic fallback；
- 指标：动作差异率、收益差、延迟、失败率；
- 异常自动回退。

---

## 7. 测试

- 确定性回放一致；
- 同一 seed 输出稳定；
- LLM schema/白名单/超时/回退；
- 私有数据不出现在请求；
- 客户端/公开 API 无 provider 泄漏；
- 审计字段完整；
- LLM 动作被 domain 风控拒绝时记录；
- kill switch 生效。

---

## 8. 风险

1. LLM 不确定性 → 只做候选，不做执行；默认关闭。
2. 数据泄漏 → 最小化/脱敏/出网审计。
3. 提示词注入 → 固定模板，不拼玩家文本。
4. 外部依赖故障 → 超时/回退/熔断。
5. 公平性 → 同规则/同费用/同风控/审计。
6. “隐蔽”被误解为安全 → 权限/密钥/网络隔离才是边界。
