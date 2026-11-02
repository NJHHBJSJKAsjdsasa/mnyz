# Atlas API 端点清单

> 本文件由 `python scripts/gen_api_docs.py` 生成，**不要手改**。
> 共 **255** 个操作 / **26** 个蓝图。
> 请求体覆盖：157 个写操作中 **101 个有 pydantic schema**、0 个手工校验、56 个无请求体。

## 约定

| 项 | 规则 |
|---|---|
| 响应包 | `{ ok, request_id, data, state_version? }` |
| 错误 | `application/problem+json`，`code` 稳定可机读（见 `GET /api/v1/meta/error-codes`） |
| 鉴权 | `Authorization: Bearer <access_token>` |
| 写接口 | 必须带 `Idempotency-Key`；并发敏感接口可带 `If-Match: "<state_version>"` |
| 金额 | 一律字符串，`numeric(30,4)` |
| 时间 | ISO 8601 |

## 按蓝图

| 蓝图 | 操作数 |
|---|---:|
| `admin_ops` | 10 |
| `ai_admin` | 6 |
| `assets` | 38 |
| `auth` | 7 |
| `bank` | 29 |
| `brokers` | 9 |
| `commerce` | 20 |
| `council` | 6 |
| `court` | 15 |
| `craft` | 2 |
| `cutover` | 5 |
| `economy` | 12 |
| `explore` | 12 |
| `insolvency` | 7 |
| `internal_dt` | 7 |
| `ledger` | 3 |
| `market` | 20 |
| `meta` | 1 |
| `properties` | 13 |
| `protection` | 4 |
| `revenue` | 2 |
| `session_state` | 3 |
| `stocks` | 16 |
| `tasks` | 4 |
| `travel` | 3 |
| `universe` | 1 |

## admin_ops

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/announcements` | GET /api/v1/admin/announcements | Bearer | — | — |
| `POST` | `/api/v1/admin/announcements` | POST /api/v1/admin/announcements | Bearer | 是 | `AnnouncementRequest` |
| `DELETE` | `/api/v1/admin/announcements/{announcement_id}` | DELETE /api/v1/admin/announcements/{announcement_id} | Bearer | 是 | — |
| `GET` | `/api/v1/admin/audit` ?action, actor | GET /api/v1/admin/audit | Bearer | — | — |
| `GET` | `/api/v1/admin/dlq` | GET /api/v1/admin/dlq | Bearer | — | — |
| `GET` | `/api/v1/admin/economy/dashboard` | GET /api/v1/admin/economy/dashboard | Bearer | — | — |
| `GET` | `/api/v1/admin/jobs/runs` ?job | GET /api/v1/admin/jobs/runs | Bearer | — | — |
| `POST` | `/api/v1/admin/players/{player_id}/grant` | Compensation only. Additive, audited, and capped by the model. | Bearer | 是 | `PlayerGrantRequest` |
| `POST` | `/api/v1/admin/players/{player_id}/lock` | POST /api/v1/admin/players/{player_id}/lock | Bearer | 是 | `PlayerLockRequest` |
| `POST` | `/api/v1/admin/players/{player_id}/unlock` | POST /api/v1/admin/players/{player_id}/unlock | Bearer | 是 | — |

## ai_admin

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/ai/providers` | Ops-only view: modes and audit knobs, never exposed to players (10 §4.2). | Bearer | — | — |
| `POST` | `/api/v1/admin/ai/providers/{name}` | POST /api/v1/admin/ai/providers/{name} | Bearer | — | `ProviderUpdateRequest` |
| `POST` | `/api/v1/admin/ai/runtime-pause` | POST /api/v1/admin/ai/runtime-pause | Bearer | — | `RuntimePauseRequest` |
| `POST` | `/api/v1/admin/ai/tick` | POST /api/v1/admin/ai/tick | Bearer | — | `AiTickRequest` |
| `GET` | `/api/v1/players` ?controller, cursor, limit | GET /api/v1/players | Bearer | — | — |
| `GET` | `/api/v1/players/{player_id}` | GET /api/v1/players/{player_id} | Bearer | — | — |

## assets

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `POST` | `/api/v1/alliances` | POST /api/v1/alliances | Bearer | 是 | `NameRequest` |
| `POST` | `/api/v1/alliances/invites` | POST /api/v1/alliances/invites | Bearer | 是 | — |
| `POST` | `/api/v1/alliances/join` | POST /api/v1/alliances/join | Bearer | 是 | `AllianceJoinRequest` |
| `POST` | `/api/v1/alliances/join-code` | POST /api/v1/alliances/join-code | Bearer | 是 | `InviteCodeRequest` |
| `POST` | `/api/v1/alliances/leave` | POST /api/v1/alliances/leave | Bearer | 是 | — |
| `GET` | `/api/v1/alliances/mine` | GET /api/v1/alliances/mine | Bearer | — | — |
| `GET` | `/api/v1/assets` | GET /api/v1/assets | Bearer | — | — |
| `POST` | `/api/v1/challenges` | POST /api/v1/challenges | Bearer | 是 | — |
| `GET` | `/api/v1/challenges/{code}` | GET /api/v1/challenges/{code} | Bearer | — | — |
| `POST` | `/api/v1/challenges/{code}/fight` | POST /api/v1/challenges/{code}/fight | Bearer | 是 | — |
| `GET` | `/api/v1/combat` | GET /api/v1/combat | Bearer | — | — |
| `POST` | `/api/v1/combat/start` | POST /api/v1/combat/start | Bearer | 是 | `PlanetRefRequest` |
| `GET` | `/api/v1/combat/{session_id}` | GET /api/v1/combat/{session_id} | Bearer | — | — |
| `POST` | `/api/v1/combat/{session_id}/action` | POST /api/v1/combat/{session_id}/action | Bearer | 是 | `ActionRequest` |
| `GET` | `/api/v1/factions` | GET /api/v1/factions | Bearer | — | — |
| `POST` | `/api/v1/fleet` | POST /api/v1/fleet | Bearer | 是 | `NameRequest` |
| `POST` | `/api/v1/fleet/{fleet_id}/claim` | POST /api/v1/fleet/{fleet_id}/claim | Bearer | 是 | — |
| `POST` | `/api/v1/fleet/{fleet_id}/task` | POST /api/v1/fleet/{fleet_id}/task | Bearer | 是 | `TaskRequest` |
| `GET` | `/api/v1/leaderboard` | GET /api/v1/leaderboard | Bearer | — | — |
| `POST` | `/api/v1/planets/{planet_key}/build` | POST /api/v1/planets/{planet_key}/build | Bearer | 是 | `CodeRequest` |
| `POST` | `/api/v1/planets/{planet_key}/claim` | POST /api/v1/planets/{planet_key}/claim | Bearer | 是 | — |
| `GET` | `/api/v1/planets/{planet_key}/colony` | GET /api/v1/planets/{planet_key}/colony | Bearer | — | — |
| `POST` | `/api/v1/planets/{planet_key}/deposits/claim` | POST /api/v1/planets/{planet_key}/deposits/claim | Bearer | 是 | — |
| `POST` | `/api/v1/planets/{planet_key}/salvage` | POST /api/v1/planets/{planet_key}/salvage | Bearer | 是 | — |
| `GET` | `/api/v1/residents` | GET /api/v1/residents | Bearer | — | — |
| `GET` | `/api/v1/residents/offer` | GET /api/v1/residents/offer | Bearer | — | — |
| `POST` | `/api/v1/residents/{resident_id}/meet` | POST /api/v1/residents/{resident_id}/meet | Bearer | 是 | — |
| `POST` | `/api/v1/residents/{resident_id}/trade` | POST /api/v1/residents/{resident_id}/trade | Bearer | 是 | `ResidentTradeRequest` |
| `POST` | `/api/v1/sieges/loot` | POST /api/v1/sieges/loot | Bearer | 是 | — |
| `GET` | `/api/v1/sieges/{siege_id}` | GET /api/v1/sieges/{siege_id} | Bearer | — | — |
| `POST` | `/api/v1/sieges/{siege_id}/join` | POST /api/v1/sieges/{siege_id}/join | Bearer | 是 | — |
| `POST` | `/api/v1/stations` | POST /api/v1/stations | Bearer | 是 | `PlanetRefRequest` |
| `POST` | `/api/v1/stations/{station_id}/claim` | POST /api/v1/stations/{station_id}/claim | Bearer | 是 | — |
| `POST` | `/api/v1/stations/{station_id}/modules/{module_code}` | POST /api/v1/stations/{station_id}/modules/{module_code} | Bearer | 是 | — |
| `GET` | `/api/v1/world-planets/{planet_key}` | GET /api/v1/world-planets/{planet_key} | Bearer | — | — |
| `POST` | `/api/v1/world-planets/{planet_key}/claim` | POST /api/v1/world-planets/{planet_key}/claim | Bearer | 是 | — |
| `POST` | `/api/v1/world-planets/{planet_key}/siege` | POST /api/v1/world-planets/{planet_key}/siege | Bearer | 是 | — |
| `GET` | `/api/v1/wrecks` | GET /api/v1/wrecks | Bearer | — | — |

## auth

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | POST /api/v1/auth/login | 公开 | — | `LoginRequest` |
| `POST` | `/api/v1/auth/logout` | POST /api/v1/auth/logout | Bearer | — | — |
| `POST` | `/api/v1/auth/logout-all` | POST /api/v1/auth/logout-all | Bearer | — | — |
| `POST` | `/api/v1/auth/refresh` | POST /api/v1/auth/refresh | 公开 | — | — |
| `POST` | `/api/v1/auth/register` | POST /api/v1/auth/register | 公开 | — | `RegisterRequest` |
| `GET` | `/api/v1/me` | GET /api/v1/me | Bearer | — | — |
| `POST` | `/api/v1/session` | POST /api/v1/session | 公开 | — | `SessionRequest` |

## bank

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/bank/accounts` | GET /api/v1/bank/accounts | Bearer | — | — |
| `GET` | `/api/v1/bank/certificate-quotes` | GET /api/v1/bank/certificate-quotes | Bearer | — | — |
| `POST` | `/api/v1/bank/certificate-quotes/{quote_id}/buy` | POST /api/v1/bank/certificate-quotes/{quote_id}/buy | Bearer | 是 | — |
| `GET` | `/api/v1/bank/certificates` | GET /api/v1/bank/certificates | Bearer | — | — |
| `POST` | `/api/v1/bank/certificates/{certificate_id}/quote` | POST /api/v1/bank/certificates/{certificate_id}/quote | Bearer | 是 | `CertificateQuoteRequest` |
| `POST` | `/api/v1/bank/certificates/{certificate_id}/redeem` | POST /api/v1/bank/certificates/{certificate_id}/redeem | Bearer | 是 | — |
| `POST` | `/api/v1/bank/exchange` | POST /api/v1/bank/exchange | Bearer | 是 | `ExchangeRequest` |
| `GET` | `/api/v1/bank/insurance` | GET /api/v1/bank/insurance | Bearer | — | — |
| `POST` | `/api/v1/bank/insurance/claims` | POST /api/v1/bank/insurance/claims | Bearer | 是 | `InsuranceClaimRequest` |
| `GET` | `/api/v1/bank/interbank` | GET /api/v1/bank/interbank | Bearer | — | — |
| `POST` | `/api/v1/bank/interbank/orders/{order_id}/accept` | POST /api/v1/bank/interbank/orders/{order_id}/accept | Bearer | 是 | — |
| `POST` | `/api/v1/bank/interbank/orders/{order_id}/repay` | POST /api/v1/bank/interbank/orders/{order_id}/repay | Bearer | 是 | — |
| `GET` | `/api/v1/bank/loans` | GET /api/v1/bank/loans | Bearer | — | — |
| `GET` | `/api/v1/bank/loans/{loan_id}/collateral` | GET /api/v1/bank/loans/{loan_id}/collateral | Bearer | — | — |
| `POST` | `/api/v1/bank/loans/{loan_id}/repay` | POST /api/v1/bank/loans/{loan_id}/repay | Bearer | 是 | `RepayRequest` |
| `GET` | `/api/v1/bank/quote` ?from_code, to_code | GET /api/v1/bank/quote | Bearer | — | — |
| `GET` | `/api/v1/bank/rates` | GET /api/v1/bank/rates | Bearer | — | — |
| `GET` | `/api/v1/banks` | GET /api/v1/banks | Bearer | — | — |
| `POST` | `/api/v1/banks/{bank_id}/certificates` | POST /api/v1/banks/{bank_id}/certificates | Bearer | 是 | `CertificateRequest` |
| `POST` | `/api/v1/banks/{bank_id}/deposit` | POST /api/v1/banks/{bank_id}/deposit | Bearer | 是 | `BankAmountRequest` |
| `POST` | `/api/v1/banks/{bank_id}/interbank/orders` | POST /api/v1/banks/{bank_id}/interbank/orders | Bearer | 是 | `InterbankOrderRequest` |
| `POST` | `/api/v1/banks/{bank_id}/loans` | POST /api/v1/banks/{bank_id}/loans | Bearer | 是 | `LoanRequest` |
| `POST` | `/api/v1/banks/{bank_id}/withdraw` | POST /api/v1/banks/{bank_id}/withdraw | Bearer | 是 | `BankAmountRequest` |
| `GET` | `/api/v1/compliance/fund` | GET /api/v1/compliance/fund | Bearer | — | — |
| `GET` | `/api/v1/currencies` | GET /api/v1/currencies | Bearer | — | — |
| `POST` | `/api/v1/wallet/bribe` | POST /api/v1/wallet/bribe | Bearer | 是 | `BribeRequest` |
| `GET` | `/api/v1/wallet/currencies` | GET /api/v1/wallet/currencies | Bearer | — | — |
| `GET` | `/api/v1/wallet/entries` | GET /api/v1/wallet/entries | Bearer | — | — |
| `POST` | `/api/v1/wallet/transfer` | POST /api/v1/wallet/transfer | Bearer | 是 | `TransferRequest` |

## brokers

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `POST` | `/api/v1/brokers/accounts` | POST /api/v1/brokers/accounts | Bearer | 是 | `BrokerAccountRequest` |
| `DELETE` | `/api/v1/brokers/accounts/me` | DELETE /api/v1/brokers/accounts/me | Bearer | 是 | — |
| `GET` | `/api/v1/brokers/accounts/me` | GET /api/v1/brokers/accounts/me | Bearer | — | — |
| `POST` | `/api/v1/brokers/firms` | POST /api/v1/brokers/firms | Bearer | 是 | `FirmRequest` |
| `GET` | `/api/v1/brokers/me` | GET /api/v1/brokers/me | Bearer | — | — |
| `POST` | `/api/v1/brokers/memberships` | POST /api/v1/brokers/memberships | Bearer | 是 | `MembershipRequest` |
| `GET` | `/api/v1/stocks/{ticker}/venues` | GET /api/v1/stocks/{ticker}/venues | Bearer | — | — |
| `POST` | `/api/v1/stocks/{ticker}/venues` | POST /api/v1/stocks/{ticker}/venues | Bearer | 是 | `VenueRequest` |
| `DELETE` | `/api/v1/stocks/{ticker}/venues/{code}` | DELETE /api/v1/stocks/{ticker}/venues/{code} | Bearer | 是 | — |

## commerce

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/commerce/antitrust` | GET /api/v1/admin/commerce/antitrust | Bearer | — | — |
| `POST` | `/api/v1/admin/commerce/antitrust/snapshot` | Recompute today's snapshot by hand (the daily job is authoritative). | Bearer | — | — |
| `GET` | `/api/v1/admin/commerce/licenses/pending` | GET /api/v1/admin/commerce/licenses/pending | Bearer | — | — |
| `POST` | `/api/v1/admin/commerce/licenses/{license_id}/decide` | POST /api/v1/admin/commerce/licenses/{license_id}/decide | Bearer | 是 | `LicenseDecisionRequest` |
| `GET` | `/api/v1/commerce/licences/catalogue` | GET /api/v1/commerce/licences/catalogue | Bearer | — | — |
| `GET` | `/api/v1/commerce/licenses` | GET /api/v1/commerce/licenses | Bearer | — | — |
| `POST` | `/api/v1/commerce/licenses` | POST /api/v1/commerce/licenses | Bearer | 是 | `LicenseRequest` |
| `GET` | `/api/v1/companies` | GET /api/v1/companies | Bearer | — | — |
| `POST` | `/api/v1/companies` | POST /api/v1/companies | Bearer | 是 | `CompanyRequest` |
| `POST` | `/api/v1/companies/resolutions/{resolution_id}/close` | POST /api/v1/companies/resolutions/{resolution_id}/close | Bearer | 是 | — |
| `POST` | `/api/v1/companies/resolutions/{resolution_id}/vote` | POST /api/v1/companies/resolutions/{resolution_id}/vote | Bearer | 是 | `VoteRequest` |
| `GET` | `/api/v1/companies/{ticker}` | GET /api/v1/companies/{ticker} | Bearer | — | — |
| `POST` | `/api/v1/companies/{ticker}/charter` | POST /api/v1/companies/{ticker}/charter | Bearer | 是 | `CharterRequest` |
| `POST` | `/api/v1/companies/{ticker}/financials` | POST /api/v1/companies/{ticker}/financials | Bearer | 是 | `FinancialsRequest` |
| `GET` | `/api/v1/companies/{ticker}/governance` | GET /api/v1/companies/{ticker}/governance | Bearer | — | — |
| `POST` | `/api/v1/companies/{ticker}/meetings` | POST /api/v1/companies/{ticker}/meetings | Bearer | 是 | `MeetingRequest` |
| `POST` | `/api/v1/companies/{ticker}/related-party` | POST /api/v1/companies/{ticker}/related-party | Bearer | 是 | `RelatedPartyRequest` |
| `POST` | `/api/v1/companies/{ticker}/related-party/{txn_id}/decide` | POST /api/v1/companies/{ticker}/related-party/{txn_id}/decide | Bearer | 是 | `RelatedPartyDecisionRequest` |
| `POST` | `/api/v1/companies/{ticker}/resolutions` | POST /api/v1/companies/{ticker}/resolutions | Bearer | 是 | `ResolutionRequest` |
| `POST` | `/api/v1/companies/{ticker}/shares/transfer` | POST /api/v1/companies/{ticker}/shares/transfer | Bearer | 是 | `ShareTransferRequest` |

## council

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/council` | GET /api/v1/council | Bearer | — | — |
| `POST` | `/api/v1/council/ipo` | POST /api/v1/council/ipo | Bearer | 是 | `CouncilIpoRequest` |
| `POST` | `/api/v1/council/leave` | POST /api/v1/council/leave | Bearer | 是 | — |
| `POST` | `/api/v1/council/motions/{motion_id}/vote` | POST /api/v1/council/motions/{motion_id}/vote | Bearer | 是 | `CouncilVoteRequest` |
| `POST` | `/api/v1/council/seat` | POST /api/v1/council/seat | Bearer | 是 | — |
| `POST` | `/api/v1/council/sector-license` | POST /api/v1/council/sector-license | Bearer | 是 | `CouncilSectorRequest` |

## court

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `POST` | `/api/v1/admin/court/cases/{case_id}/freeze` | POST /api/v1/admin/court/cases/{case_id}/freeze | Bearer | 是 | `FreezeRequest` |
| `POST` | `/api/v1/admin/court/cases/{case_id}/judge` | POST /api/v1/admin/court/cases/{case_id}/judge | Bearer | 是 | — |
| `POST` | `/api/v1/admin/court/cases/{case_id}/release` | POST /api/v1/admin/court/cases/{case_id}/release | Bearer | 是 | `FreezeRequest` |
| `POST` | `/api/v1/admin/court/recognition/{recognition_id}/decide` | POST /api/v1/admin/court/recognition/{recognition_id}/decide | Bearer | 是 | `RecognitionDecisionRequest` |
| `GET` | `/api/v1/court/cases` | GET /api/v1/court/cases | Bearer | — | — |
| `POST` | `/api/v1/court/cases` | POST /api/v1/court/cases | Bearer | 是 | `CourtCaseRequest` |
| `GET` | `/api/v1/court/cases/{case_id}` | GET /api/v1/court/cases/{case_id} | Bearer | — | — |
| `POST` | `/api/v1/court/cases/{case_id}/appeal` | POST /api/v1/court/cases/{case_id}/appeal | Bearer | 是 | `AppealRequest` |
| `POST` | `/api/v1/court/cases/{case_id}/enforce` | POST /api/v1/court/cases/{case_id}/enforce | Bearer | 是 | `EnforceRequest` |
| `POST` | `/api/v1/court/cases/{case_id}/evidence` | POST /api/v1/court/cases/{case_id}/evidence | Bearer | 是 | `EvidenceRequest` |
| `POST` | `/api/v1/court/judgments/{judgment_id}/recognition` | POST /api/v1/court/judgments/{judgment_id}/recognition | Bearer | 是 | `RecognitionRequest` |
| `GET` | `/api/v1/court/panels/{panel_id}` | GET /api/v1/court/panels/{panel_id} | Bearer | — | — |
| `POST` | `/api/v1/court/panels/{panel_id}/strike` | POST /api/v1/court/panels/{panel_id}/strike | Bearer | 是 | `StrikeRequest` |
| `POST` | `/api/v1/court/panels/{panel_id}/vote` | POST /api/v1/court/panels/{panel_id}/vote | Bearer | 是 | `PanelVoteRequest` |
| `POST` | `/api/v1/court/recognition/{recognition_id}/appeal` | POST /api/v1/court/recognition/{recognition_id}/appeal | Bearer | 是 | — |

## craft

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/craft` | GET /api/v1/craft | Bearer | — | — |
| `POST` | `/api/v1/craft/{recipe_code}/run` | POST /api/v1/craft/{recipe_code}/run | Bearer | 是 | — |

## cutover

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/features` | GET /api/v1/features | Bearer | — | — |
| `GET` | `/api/v1/migrations/local-save` | GET /api/v1/migrations/local-save | Bearer | — | — |
| `POST` | `/api/v1/migrations/local-save` | POST /api/v1/migrations/local-save | Bearer | — | `LocalSaveRequest` |
| `GET` | `/api/v1/shadow/state` | GET /api/v1/shadow/state | Bearer | — | — |
| `POST` | `/api/v1/shadow/state` | POST /api/v1/shadow/state | Bearer | 是 | — |

## economy

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/contracts` | GET /api/v1/contracts | Bearer | — | — |
| `POST` | `/api/v1/contracts/{contract_id}/accept` | POST /api/v1/contracts/{contract_id}/accept | Bearer | — | — |
| `POST` | `/api/v1/contracts/{contract_id}/claim` | POST /api/v1/contracts/{contract_id}/claim | Bearer | — | — |
| `GET` | `/api/v1/planets/{planet_key}/market` | GET /api/v1/planets/{planet_key}/market | Bearer | — | — |
| `POST` | `/api/v1/planets/{planet_key}/market/buy` | POST /api/v1/planets/{planet_key}/market/buy | Bearer | — | `MarketOrderRequest` |
| `POST` | `/api/v1/planets/{planet_key}/market/sell` | POST /api/v1/planets/{planet_key}/market/sell | Bearer | — | `MarketOrderRequest` |
| `GET` | `/api/v1/ship` | GET /api/v1/ship | Bearer | — | — |
| `POST` | `/api/v1/ship/modules/{module_code}/overclock` | POST /api/v1/ship/modules/{module_code}/overclock | Bearer | — | — |
| `POST` | `/api/v1/ship/modules/{module_code}/refit` | POST /api/v1/ship/modules/{module_code}/refit | Bearer | — | `RefitRequest` |
| `POST` | `/api/v1/ship/repair` | POST /api/v1/ship/repair | Bearer | — | — |
| `POST` | `/api/v1/ship/upgrade` | POST /api/v1/ship/upgrade | Bearer | — | — |
| `POST` | `/api/v1/tech/{node_code}/unlock` | POST /api/v1/tech/{node_code}/unlock | Bearer | 是 | — |

## explore

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/codex` ?kind | GET /api/v1/codex | Bearer | — | — |
| `POST` | `/api/v1/codex/{section}/claim` | POST /api/v1/codex/{section}/claim | Bearer | 是 | — |
| `GET` | `/api/v1/planets/{planet_key}` | Authoritative planet identity: name, type and elements from the seed. | Bearer | — | — |
| `POST` | `/api/v1/planets/{planet_key}/collect` | POST /api/v1/planets/{planet_key}/collect | Bearer | 是 | `CollectRequest` |
| `POST` | `/api/v1/planets/{planet_key}/scan` | POST /api/v1/planets/{planet_key}/scan | Bearer | 是 | — |
| `GET` | `/api/v1/planets/{planet_key}/surface` | GET /api/v1/planets/{planet_key}/surface | Bearer | — | — |
| `POST` | `/api/v1/planets/{planet_key}/surface/sample` | POST /api/v1/planets/{planet_key}/surface/sample | Bearer | 是 | `SurfaceSampleRequest` |
| `POST` | `/api/v1/planets/{planet_key}/visit` | Record the planet type and its elements in the codex. | Bearer | — | — |
| `GET` | `/api/v1/progress/exploration` | Cumulative discovery scoreboard (T-62); pays nothing — rewards live in /tasks. | Bearer | — | — |
| `GET` | `/api/v1/relics` | GET /api/v1/relics | Bearer | — | — |
| `POST` | `/api/v1/relics/{planet_key}` | Record the fragment this planet carries; the server decides which one. | Bearer | 是 | — |
| `POST` | `/api/v1/sectors/{sector_key}/unlock` | POST /api/v1/sectors/{sector_key}/unlock | Bearer | 是 | — |

## insolvency

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `POST` | `/api/v1/insolvency` | POST /api/v1/insolvency | Bearer | 是 | `InsolvencyRequest` |
| `GET` | `/api/v1/insolvency/{case_id}` | GET /api/v1/insolvency/{case_id} | Bearer | — | — |
| `POST` | `/api/v1/insolvency/{case_id}/claims` | POST /api/v1/insolvency/{case_id}/claims | Bearer | 是 | `InsolvencyClaimRequest` |
| `POST` | `/api/v1/insolvency/{case_id}/liquidate` | POST /api/v1/insolvency/{case_id}/liquidate | Bearer | 是 | — |
| `POST` | `/api/v1/insolvency/{case_id}/plan` | POST /api/v1/insolvency/{case_id}/plan | Bearer | 是 | `PlanRequest` |
| `POST` | `/api/v1/insolvency/{case_id}/plan/confirm` | POST /api/v1/insolvency/{case_id}/plan/confirm | Bearer | 是 | `PlanVoteRequest` |
| `POST` | `/api/v1/insolvency/{case_id}/plan/vote` | POST /api/v1/insolvency/{case_id}/plan/vote | Bearer | 是 | `PlanVoteRequest` |

## internal_dt

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `POST` | `/api/v1/internal/dt/begin` | POST /api/v1/internal/dt/begin | 公开 | — | `BeginRequest` |
| `GET` | `/api/v1/internal/dt/stats` | GET /api/v1/internal/dt/stats | 公开 | — | — |
| `GET` | `/api/v1/internal/dt/{tx_id}` | GET /api/v1/internal/dt/{tx_id} | 公开 | — | — |
| `POST` | `/api/v1/internal/dt/{tx_id}/abort` | POST /api/v1/internal/dt/{tx_id}/abort | 公开 | — | `AbortRequest` |
| `POST` | `/api/v1/internal/dt/{tx_id}/commit` | POST /api/v1/internal/dt/{tx_id}/commit | 公开 | — | `CommitRequest` |
| `POST` | `/api/v1/internal/dt/{tx_id}/prepare` | POST /api/v1/internal/dt/{tx_id}/prepare | 公开 | — | `PrepareRequest` |
| `POST` | `/api/v1/internal/dt/{tx_id}/resolve` | POST /api/v1/internal/dt/{tx_id}/resolve | 公开 | — | `ResolveRequest` |

## ledger

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/ledger/transactions` | GET /api/v1/admin/ledger/transactions | Bearer | — | — |
| `GET` | `/api/v1/admin/ledger/transactions/{tx_id}` | GET /api/v1/admin/ledger/transactions/{tx_id} | Bearer | — | — |
| `POST` | `/api/v1/admin/ledger/transactions/{tx_id}/reverse` | Post the mirror of ``tx_id``. Idempotent per transaction. | Bearer | 是 | `ReverseRequest` |

## market

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `POST` | `/api/v1/admin/market/archive/cold` | POST /api/v1/admin/market/archive/cold | Bearer | — | `ArchiveColdRequest` |
| `GET` | `/api/v1/admin/market/archive/partitions` | GET /api/v1/admin/market/archive/partitions | Bearer | — | — |
| `POST` | `/api/v1/admin/market/archive/partitions` | POST /api/v1/admin/market/archive/partitions | Bearer | — | `ArchivePartitionsRequest` |
| `POST` | `/api/v1/admin/market/archive/restore` | POST /api/v1/admin/market/archive/restore | Bearer | — | `ArchiveRestoreRequest` |
| `POST` | `/api/v1/admin/market/candles/archive` | POST /api/v1/admin/market/candles/archive | Bearer | — | `ArchiveCandlesRequest` |
| `POST` | `/api/v1/admin/market/index/publish` | POST /api/v1/admin/market/index/publish | Bearer | — | — |
| `POST` | `/api/v1/admin/stocks/{ticker}/halt` | POST /api/v1/admin/stocks/{ticker}/halt | Bearer | 是 | `HaltRequest` |
| `POST` | `/api/v1/admin/stocks/{ticker}/resume` | POST /api/v1/admin/stocks/{ticker}/resume | Bearer | 是 | — |
| `GET` | `/api/v1/exchanges` | GET /api/v1/exchanges | Bearer | — | — |
| `POST` | `/api/v1/exchanges` | POST /api/v1/exchanges | Bearer | 是 | `ExchangeCreateRequest` |
| `GET` | `/api/v1/market/indices` | GET /api/v1/market/indices | Bearer | — | — |
| `GET` | `/api/v1/market/indices/{code}/points` ?limit | GET /api/v1/market/indices/{code}/points | Bearer | — | — |
| `GET` | `/api/v1/stocks/{ticker}/adjustment-factors` | GET /api/v1/stocks/{ticker}/adjustment-factors | Bearer | — | — |
| `DELETE` | `/api/v1/stocks/{ticker}/mm-program` | DELETE /api/v1/stocks/{ticker}/mm-program | Bearer | 是 | — |
| `GET` | `/api/v1/stocks/{ticker}/mm-program` | GET /api/v1/stocks/{ticker}/mm-program | Bearer | — | — |
| `POST` | `/api/v1/stocks/{ticker}/mm-program` | POST /api/v1/stocks/{ticker}/mm-program | Bearer | 是 | `MmProgramRequest` |
| `GET` | `/api/v1/stocks/{ticker}/quote` | GET /api/v1/stocks/{ticker}/quote | Bearer | — | — |
| `POST` | `/api/v1/stocks/{ticker}/quote` | POST /api/v1/stocks/{ticker}/quote | Bearer | 是 | — |
| `POST` | `/api/v1/stocks/{ticker}/quotes` | Two-sided quote: refresh my own resting orders and re-price both sides. | Bearer | 是 | `QuoteRequest` |
| `POST` | `/api/v1/stocks/{ticker}/split` | POST /api/v1/stocks/{ticker}/split | Bearer | 是 | `StockSplitRequest` |

## meta

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/meta/error-codes` | GET /api/v1/meta/error-codes | 公开 | — | — |

## properties

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/properties` ?kind, sector, status | GET /api/v1/properties | Bearer | — | — |
| `POST` | `/api/v1/properties` | POST /api/v1/properties | Bearer | 是 | `PropertyRegisterRequest` |
| `GET` | `/api/v1/properties/disputes` ?asset_key | GET /api/v1/properties/disputes | Bearer | — | — |
| `POST` | `/api/v1/properties/disputes/{dispute_id}/resolve` | POST /api/v1/properties/disputes/{dispute_id}/resolve | Bearer | 是 | `PropertyDisputeResolveRequest` |
| `GET` | `/api/v1/properties/listings` | GET /api/v1/properties/listings | Bearer | — | — |
| `POST` | `/api/v1/properties/listings/{listing_id}/bid` | POST /api/v1/properties/listings/{listing_id}/bid | Bearer | 是 | `PropertyBidRequest` |
| `POST` | `/api/v1/properties/listings/{listing_id}/buy` | POST /api/v1/properties/listings/{listing_id}/buy | Bearer | 是 | — |
| `POST` | `/api/v1/properties/listings/{listing_id}/close` | POST /api/v1/properties/listings/{listing_id}/close | Bearer | 是 | — |
| `GET` | `/api/v1/properties/my` | GET /api/v1/properties/my | Bearer | — | — |
| `GET` | `/api/v1/properties/tax` | GET /api/v1/properties/tax | Bearer | — | — |
| `POST` | `/api/v1/properties/tax/{bill_id}/pay` | POST /api/v1/properties/tax/{bill_id}/pay | Bearer | 是 | — |
| `POST` | `/api/v1/properties/{asset_key}/dispute` | POST /api/v1/properties/{asset_key}/dispute | Bearer | 是 | `PropertyDisputeRequest` |
| `POST` | `/api/v1/properties/{asset_key}/list` | POST /api/v1/properties/{asset_key}/list | Bearer | 是 | `PropertyListRequest` |

## protection

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/market/protection/claims` ?limit, status | GET /api/v1/admin/market/protection/claims | Bearer | — | — |
| `POST` | `/api/v1/admin/market/protection/claims/{claim_id}/decide` | POST /api/v1/admin/market/protection/claims/{claim_id}/decide | Bearer | 是 | `ClaimDecisionRequest` |
| `GET` | `/api/v1/market/protection` | GET /api/v1/market/protection | Bearer | — | — |
| `POST` | `/api/v1/market/protection/claims` | POST /api/v1/market/protection/claims | Bearer | 是 | `FundClaimRequest` |

## revenue

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/admin/economy/revenue` | GET /api/v1/admin/economy/revenue | Bearer | — | — |
| `POST` | `/api/v1/admin/economy/revenue/split` | POST /api/v1/admin/economy/revenue/split | Bearer | — | `RevenueSplitRequest` |

## session_state

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/events` ?aggregate, limit, since, types | Append-only activity feed (10 §P1-5). | Bearer | — | — |
| `GET` | `/api/v1/session` | GET /api/v1/session | Bearer | — | — |
| `GET` | `/api/v1/state` | GET /api/v1/state | Bearer | — | — |

## stocks

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/stocks` ?cursor, limit, status | GET /api/v1/stocks | Bearer | — | — |
| `POST` | `/api/v1/stocks/ipo` | POST /api/v1/stocks/ipo | Bearer | 是 | `IpoRequest` |
| `GET` | `/api/v1/stocks/margin` | GET /api/v1/stocks/margin | Bearer | — | — |
| `GET` | `/api/v1/stocks/orders` ?ticker | GET /api/v1/stocks/orders | Bearer | — | — |
| `DELETE` | `/api/v1/stocks/orders/{order_id}` | DELETE /api/v1/stocks/orders/{order_id} | Bearer | 是 | — |
| `GET` | `/api/v1/stocks/portfolio` | GET /api/v1/stocks/portfolio | Bearer | — | — |
| `GET` | `/api/v1/stocks/{ticker}` | GET /api/v1/stocks/{ticker} | Bearer | — | — |
| `GET` | `/api/v1/stocks/{ticker}/candles` ?before, interval, limit | GET /api/v1/stocks/{ticker}/candles | Bearer | — | — |
| `POST` | `/api/v1/stocks/{ticker}/cover` | POST /api/v1/stocks/{ticker}/cover | Bearer | 是 | `CoverRequest` |
| `GET` | `/api/v1/stocks/{ticker}/delisting` | GET /api/v1/stocks/{ticker}/delisting | Bearer | — | — |
| `GET` | `/api/v1/stocks/{ticker}/dividends` | GET /api/v1/stocks/{ticker}/dividends | Bearer | — | — |
| `POST` | `/api/v1/stocks/{ticker}/dividends` | POST /api/v1/stocks/{ticker}/dividends | Bearer | 是 | `DividendRequest` |
| `POST` | `/api/v1/stocks/{ticker}/lend` | POST /api/v1/stocks/{ticker}/lend | Bearer | 是 | `LendRequest` |
| `POST` | `/api/v1/stocks/{ticker}/margin` | POST /api/v1/stocks/{ticker}/margin | Bearer | 是 | `MarginDepositRequest` |
| `POST` | `/api/v1/stocks/{ticker}/orders` | POST /api/v1/stocks/{ticker}/orders | Bearer | 是 | `StockOrderRequest` |
| `POST` | `/api/v1/stocks/{ticker}/short` | POST /api/v1/stocks/{ticker}/short | Bearer | 是 | `ShortRequest` |

## tasks

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/tasks` | GET /api/v1/tasks | Bearer | — | — |
| `POST` | `/api/v1/tasks/{task_code}/claim` | POST /api/v1/tasks/{task_code}/claim | Bearer | 是 | — |
| `GET` | `/api/v1/weekly` | GET /api/v1/weekly | Bearer | — | — |
| `POST` | `/api/v1/weekly/claim` | POST /api/v1/weekly/claim | Bearer | 是 | — |

## travel

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `POST` | `/api/v1/travel/commit` | POST /api/v1/travel/commit | Bearer | 是 | `TravelCommitRequest` |
| `GET` | `/api/v1/travel/history` | GET /api/v1/travel/history | Bearer | — | — |
| `POST` | `/api/v1/travel/quote` | POST /api/v1/travel/quote | Bearer | — | `TravelQuoteRequest` |

## universe

| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/universe/systems` ?q | Find systems by name or number inside the galaxy at ``x,y,z``. | 公开 | — | — |

## 校验

```bash
python scripts/gen_api_docs.py --check   # 文档与代码不一致则退出码 1
```
