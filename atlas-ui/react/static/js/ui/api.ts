// Typed-ish client for the economy surfaces.
// Everything goes through ServerApi.request(): it owns baseUrl, bearer token,
// 401 retry and envelope unwrapping (docs/frontend-redesign/07 §4).

import { ServerApi } from "../Utils/ServerApi.tsx";

export interface ApiError extends Error {
  code: string;
  detail: string;
}

const FALLBACK_TEXT: Record<string, string> = {
  insufficient_funds: "余额不足",
  forbidden: "你没有权限执行该操作",
  unprocessable: "该操作在当前状态下不可用",
  invalid_argument: "参数不合法",
  not_found: "对象不存在或已被移除",
  rate_limited: "操作过于频繁，请稍等",
  missing_idempotency_key: "缺少幂等键（客户端 bug）",
  idempotency_conflict: "同一请求正在处理中，请勿重复提交",
  stale_state: "数据已更新，请刷新后重试",
  daily_limit: "今日次数已用完",
  already_claimed: "已被领取",
  cooldown: "冷却中",
  account_locked: "账号已锁定",
  player_locked: "玩家已被冻结",
  unauthenticated: "登录已过期，请重新登录",
  token_expired: "登录已过期，请重新登录",
};

let dictionary: Record<string, string> | null = null;

/** Pull the machine-readable error dictionary once (GET /meta/error-codes). */
export async function loadErrorCodes(): Promise<Record<string, string>> {
  if (dictionary) return dictionary;
  try {
    const data = await ServerApi.request("/api/v1/meta/error-codes");
    dictionary = Object.fromEntries((data?.codes ?? []).map((row: any) => [row.code, row.title]));
  } catch {
    dictionary = {};
  }
  return dictionary;
}

export function errorText(code: string): string {
  return dictionary?.[code] || FALLBACK_TEXT[code] || `操作失败（${code}）`;
}

const uuid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return (await ServerApi.request(path, init)) as T;
  } catch (raw) {
    const message = raw instanceof Error ? raw.message : String(raw);
    const err = new Error(message) as ApiError;
    // Server errors are either a machine code (`insufficient_funds`) or an
    // already-human Chinese sentence from pydantic/service validation. Mapping a
    // sentence through the code dictionary would wrap it in "操作失败（…）", so
    // only ASCII identifiers go through the override table.
    const isCode = /^[a-z0-9_.-]+$/i.test(message);
    err.code = message;
    err.detail = isCode ? errorText(message) : message;
    throw err;
  }
}

function write<T = any>(path: string, body?: unknown): Promise<T> {
  return call<T>(path, {
    method: "POST",
    headers: { "Idempotency-Key": uuid() },
    body: JSON.stringify(body ?? {}),
  });
}

const qs = (params: Record<string, string | number | undefined | null>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
};

// ---------------------------------------------------------------- state
export const fetchState = () => call("/api/v1/state");
export const fetchEvents = (since: number, limit = 100) =>
  call(`/api/v1/events${qs({ since, limit })}`);

// ---------------------------------------------------------------- wallet / bank
export const fetchWallet = () => call("/api/v1/wallet/currencies");
export const fetchWalletEntries = (limit = 50) => call(`/api/v1/wallet/entries${qs({ limit })}`);
export const fetchBanks = () => call("/api/v1/banks");
export const fetchBankRates = () => call("/api/v1/bank/rates");
export const fetchBankAccounts = () => call("/api/v1/bank/accounts");
export const fetchBankQuote = (fromCode: string, toCode: string) =>
  call(`/api/v1/bank/quote${qs({ from_code: fromCode, to_code: toCode })}`);

export const deposit = (bankId: string, currencyCode: string, amount: string) =>
  write(`/api/v1/banks/${encodeURIComponent(bankId)}/deposit`, { currency_code: currencyCode, amount });
export const withdraw = (bankId: string, currencyCode: string, amount: string) =>
  write(`/api/v1/banks/${encodeURIComponent(bankId)}/withdraw`, { currency_code: currencyCode, amount });
export const transfer = (toPlayerId: string, currencyCode: string, amount: string, memo = "") =>
  write("/api/v1/wallet/transfer", { to_player_id: toPlayerId, currency_code: currencyCode, amount, memo });
export const exchangeCurrency = (
  fromCode: string,
  toCode: string,
  amount: string,
  direction: "up" | "down" = "up",
) => write("/api/v1/bank/exchange", { from_code: fromCode, to_code: toCode, amount, direction });

// ---------------------------------------------------------------- market
export const fetchIndices = () => call("/api/v1/market/indices");
export const fetchIndexPoints = (code: string, limit = 120) =>
  call(`/api/v1/market/indices/${encodeURIComponent(code)}/points${qs({ limit })}`);
export const fetchExchanges = () => call("/api/v1/exchanges");
export const fetchStocks = (params: { status?: string; limit?: number; cursor?: string } = {}) =>
  call(`/api/v1/stocks${qs(params)}`);
export const fetchStock = (ticker: string) => call(`/api/v1/stocks/${encodeURIComponent(ticker)}`);
export const fetchCandles = (ticker: string, interval = "1m", limit = 300) =>
  call(`/api/v1/stocks/${encodeURIComponent(ticker)}/candles${qs({ interval, limit })}`);
export const fetchStockQuote = (ticker: string) =>
  call(`/api/v1/stocks/${encodeURIComponent(ticker)}/quote`);
export const fetchStockVenues = (ticker: string) =>
  call(`/api/v1/stocks/${encodeURIComponent(ticker)}/venues`);
export const fetchDividends = (ticker: string) =>
  call(`/api/v1/stocks/${encodeURIComponent(ticker)}/dividends`);
export const fetchDelisting = (ticker: string) =>
  call(`/api/v1/stocks/${encodeURIComponent(ticker)}/delisting`);
export const fetchAdjustmentFactors = (ticker: string) =>
  call(`/api/v1/stocks/${encodeURIComponent(ticker)}/adjustment-factors`);
export const fetchOrders = (ticker?: string) => call(`/api/v1/stocks/orders${qs({ ticker })}`);
export const fetchPortfolio = () => call("/api/v1/stocks/portfolio");
export const fetchMargin = () => call("/api/v1/stocks/margin");
export const fetchMmPrograms = (ticker: string) =>
  call(`/api/v1/stocks/${encodeURIComponent(ticker)}/mm-program`);
export const placeOrder = (
  ticker: string,
  order: { side: "buy" | "sell"; type?: "limit" | "market"; price?: string; quantity: number; venue_code?: string }
) => write(`/api/v1/stocks/${encodeURIComponent(ticker)}/orders`, order);
export const cancelOrder = (orderId: string) =>
  call(`/api/v1/stocks/orders/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
    headers: { "Idempotency-Key": uuid() },
  });
export const enrollMmProgram = (ticker: string, quantity: number) =>
  write(`/api/v1/stocks/${encodeURIComponent(ticker)}/mm-program`, { quantity });
export const pauseMmProgram = (ticker: string) =>
  call(`/api/v1/stocks/${encodeURIComponent(ticker)}/mm-program`, {
    method: "DELETE",
    headers: { "Idempotency-Key": uuid() },
  });
export const placeQuotes = (ticker: string, body: { quantity?: number; refresh?: boolean } = {}) =>
  write(`/api/v1/stocks/${encodeURIComponent(ticker)}/quotes`, body);
export const splitStock = (ticker: string, ratio: string) =>
  write(`/api/v1/stocks/${encodeURIComponent(ticker)}/split`, { ratio });
export const payDividend = (ticker: string, perShare: string) =>
  write(`/api/v1/stocks/${encodeURIComponent(ticker)}/dividends`, { per_share: perShare });
export const createExchange = (body: {
  code: string;
  name: string;
  fee_bps?: number;
  listing_fee?: string;
  max_listings?: number | null;
}) => write("/api/v1/exchanges", body);
export const requestIpo = (body: {
  ticker: string;
  offer_shares: number;
  price: string;
  settlement_mode?: "t0" | "t1";
  shortable?: boolean;
  exchange_code?: string;
}) => write("/api/v1/stocks/ipo", body);
export const openShort = (ticker: string, quantity: number) =>
  write(`/api/v1/stocks/${encodeURIComponent(ticker)}/short`, { quantity });
export const coverShort = (ticker: string, quantity?: number) =>
  write(`/api/v1/stocks/${encodeURIComponent(ticker)}/cover`, quantity ? { quantity } : {});
export const lendShares = (ticker: string, body: { quantity: number; fee_bps?: number; days?: number }) =>
  write(`/api/v1/stocks/${encodeURIComponent(ticker)}/lend`, body);
export const depositMargin = (ticker: string, amount: string) =>
  write(`/api/v1/stocks/${encodeURIComponent(ticker)}/margin`, { amount });

// ---------------------------------------------------------------- brokers
export const registerBrokerFirm = (capital = "0") =>
  write("/api/v1/brokers/firms", { capital });
export const joinBrokerMembership = (exchangeCode: string, commissionBps = 5) =>
  write("/api/v1/brokers/memberships", { exchange_code: exchangeCode, commission_bps: commissionBps });
export const fetchBrokerBook = () => call("/api/v1/brokers/me");
export const fetchBrokerAccount = () => call("/api/v1/brokers/accounts/me");
export const openBrokerAccount = (brokerCode: string, commissionBps?: number | null) =>
  write("/api/v1/brokers/accounts", {
    broker_code: brokerCode,
    ...(commissionBps == null ? {} : { commission_bps: commissionBps }),
  });
export const closeBrokerAccount = () =>
  call("/api/v1/brokers/accounts/me", {
    method: "DELETE",
    headers: { "Idempotency-Key": uuid() },
  });
export const addListingVenue = (ticker: string, body: { exchange_code: string; fee_bps?: number | null }) =>
  write(`/api/v1/stocks/${encodeURIComponent(ticker)}/venues`, body);
export const removeListingVenue = (ticker: string, exchangeCode: string) =>
  call(`/api/v1/stocks/${encodeURIComponent(ticker)}/venues/${encodeURIComponent(exchangeCode)}`, {
    method: "DELETE",
    headers: { "Idempotency-Key": uuid() },
  });

// ---------------------------------------------------------------- assets
export const fetchAssets = () => call("/api/v1/assets");
export const fetchLeaderboard = () => call("/api/v1/leaderboard");
export const claimStation = (stationId: string) =>
  write(`/api/v1/stations/${encodeURIComponent(stationId)}/claim`);
export const claimFleet = (fleetId: string) =>
  write(`/api/v1/fleet/${encodeURIComponent(fleetId)}/claim`);
export const setFleetTask = (fleetId: string, task: string) =>
  write(`/api/v1/fleet/${encodeURIComponent(fleetId)}/task`, { task });
export const recruitFleet = (name: string) => write("/api/v1/fleet", { name });
export const buildStation = (planetKey: string) => write("/api/v1/stations", { planet_key: planetKey });
export const addStationModule = (stationId: string, moduleCode: string) =>
  write(`/api/v1/stations/${encodeURIComponent(stationId)}/modules/${encodeURIComponent(moduleCode)}`);

// ---------------------------------------------------------------- bank extras
export const fetchCurrencies = () => call("/api/v1/currencies");
export const openLoan = (
  bankId: string,
  body: { currency_code: string; amount: string; term_days: number; collateral_asset_ids?: string[] },
) =>
  write(`/api/v1/banks/${encodeURIComponent(bankId)}/loans`, body);
export const fetchLoans = () => call("/api/v1/bank/loans");
export const repayLoan = (loanId: string, amount: string) =>
  write(`/api/v1/bank/loans/${encodeURIComponent(loanId)}/repay`, { amount });
export const issueCertificate = (
  bankId: string,
  body: { currency_code: string; amount: string; term_days: number },
) => write(`/api/v1/banks/${encodeURIComponent(bankId)}/certificates`, body);
export const fetchCertificates = () => call("/api/v1/bank/certificates");
export const fetchCertificateQuotes = () => call("/api/v1/bank/certificate-quotes");
export const quoteCertificate = (certificateId: string, askYieldBps: number) =>
  write(`/api/v1/bank/certificates/${encodeURIComponent(certificateId)}/quote`, { ask_yield_bps: askYieldBps });
export const buyCertificateQuote = (quoteId: string) =>
  write(`/api/v1/bank/certificate-quotes/${encodeURIComponent(quoteId)}/buy`);
export const redeemCertificate = (certificateId: string) =>
  write(`/api/v1/bank/certificates/${encodeURIComponent(certificateId)}/redeem`);
export const fetchInterbank = () => call("/api/v1/bank/interbank");
export const acceptInterbankOrder = (orderId: string, bankId: string) =>
  write(`/api/v1/bank/interbank/orders/${encodeURIComponent(orderId)}/accept${qs({ bank_id: bankId })}`);
export const repayInterbankOrder = (orderId: string, bankId: string) =>
  write(`/api/v1/bank/interbank/orders/${encodeURIComponent(orderId)}/repay${qs({ bank_id: bankId })}`);
export const fetchInsurance = () => call("/api/v1/bank/insurance");
export const fileInsuranceClaim = (body: { bank_id: string; currency_code: string; amount: string }) =>
  write("/api/v1/bank/insurance/claims", body);
export const fetchComplianceFund = () => call("/api/v1/compliance/fund");

// ---------------------------------------------------------------- properties
export const fetchProperties = (params: { sector?: string; kind?: string; status?: string } = {}) =>
  call(`/api/v1/properties${qs(params)}`);
export const fetchMyProperties = () => call("/api/v1/properties/my");
export const fetchPropertyListings = () => call("/api/v1/properties/listings");
export const payPropertyTax = (billId: string) =>
  write(`/api/v1/properties/tax/${encodeURIComponent(billId)}/pay`);
export const listProperty = (
  assetKey: string,
  body: { price: string; kind?: "fixed" | "auction"; days?: number; min_increment?: string },
) => write(`/api/v1/properties/${encodeURIComponent(assetKey)}/list`, body);
export const buyProperty = (listingId: string) =>
  write(`/api/v1/properties/listings/${encodeURIComponent(listingId)}/buy`);
export const bidProperty = (listingId: string, amount: string) =>
  write(`/api/v1/properties/listings/${encodeURIComponent(listingId)}/bid`, { amount });
export const closePropertyAuction = (listingId: string) =>
  write(`/api/v1/properties/listings/${encodeURIComponent(listingId)}/close`);

// ---------------------------------------------------------------- companies
export const fetchCompanies = () => call("/api/v1/companies");
export const fetchCompany = (ticker: string) => call(`/api/v1/companies/${encodeURIComponent(ticker)}`);
export const registerCompany = (body: {
  ticker: string;
  name: string;
  shares_total?: number;
  jurisdiction_sector?: string;
}) => write("/api/v1/companies", body);
export const transferCompanyShares = (ticker: string, body: { to_actor_id: string; shares: number }) =>
  write(`/api/v1/companies/${encodeURIComponent(ticker)}/shares/transfer`, body);
export const publishFinancials = (
  ticker: string,
  body: { period: string; revenue: string; cost: string; assets: string; liabilities: string },
) => write(`/api/v1/companies/${encodeURIComponent(ticker)}/financials`, body);
export const fetchLicenses = () => call("/api/v1/commerce/licenses");
export const fetchLicenceCatalogue = () => call("/api/v1/commerce/licences/catalogue");
export const applyLicence = (kind: string) => write("/api/v1/commerce/licenses", { kind });
export const fetchPendingLicences = () => call("/api/v1/admin/commerce/licenses/pending");
export const decideLicence = (licenseId: string, body: { approve: boolean; note?: string }) =>
  write(`/api/v1/admin/commerce/licenses/${encodeURIComponent(licenseId)}/decide`, body);
export const fetchGovernance = (ticker: string) =>
  call(`/api/v1/companies/${encodeURIComponent(ticker)}/governance`);
export const submitCharter = (ticker: string, document: Record<string, unknown>) =>
  write(`/api/v1/companies/${encodeURIComponent(ticker)}/charter`, { document });
export const conveneMeeting = (ticker: string, kind: "annual" | "extraordinary" = "extraordinary") =>
  write(`/api/v1/companies/${encodeURIComponent(ticker)}/meetings`, { kind });
export const proposeResolution = (ticker: string, kind: string, payload: Record<string, unknown>) =>
  write(`/api/v1/companies/${encodeURIComponent(ticker)}/resolutions`, { kind, payload });
export const voteResolution = (resolutionId: string, choice: "yes" | "no" | "abstain") =>
  write(`/api/v1/companies/resolutions/${encodeURIComponent(resolutionId)}/vote`, { choice });
export const closeResolution = (resolutionId: string) =>
  write(`/api/v1/companies/resolutions/${encodeURIComponent(resolutionId)}/close`);
export const declareRelatedParty = (
  ticker: string,
  body: { counterparty_actor_id: string; kind: string; amount: string },
) => write(`/api/v1/companies/${encodeURIComponent(ticker)}/related-party`, body);
export const decideRelatedParty = (ticker: string, txnId: string, approve: boolean) =>
  write(`/api/v1/companies/${encodeURIComponent(ticker)}/related-party/${encodeURIComponent(txnId)}/decide`, {
    approve,
  });

// ---------------------------------------------------------------- court
export const fetchCourtCases = () => call("/api/v1/court/cases");
export const fileCourtCase = (body: {
  kind: string;
  defendant_actor_id: string;
  amount?: string;
  claim?: string;
  currency_code?: string;
  sector?: string;
  company_ticker?: string;
}) => write("/api/v1/court/cases", body);
export const fetchCourtCase = (caseId: string) => call(`/api/v1/court/cases/${encodeURIComponent(caseId)}`);
export const addCourtEvidence = (caseId: string, body: { summary: string; payload?: Record<string, unknown> }) =>
  write(`/api/v1/court/cases/${encodeURIComponent(caseId)}/evidence`, body);
export const appealCourtCase = (caseId: string, panel = false) =>
  write(`/api/v1/court/cases/${encodeURIComponent(caseId)}/appeal`, { panel });
export const enforceCourtCase = (caseId: string, region = "") =>
  write(`/api/v1/court/cases/${encodeURIComponent(caseId)}/enforce`, { region });
export const fetchCourtPanel = (panelId: string) => call(`/api/v1/court/panels/${encodeURIComponent(panelId)}`);
export const voteCourtPanel = (panelId: string, body: { choice: "upheld" | "overturned"; reason?: string }) =>
  write(`/api/v1/court/panels/${encodeURIComponent(panelId)}/vote`, body);
export const strikeCourtPanel = (
  panelId: string,
  body: { member_actor_id: string; for_cause?: boolean },
) => write(`/api/v1/court/panels/${encodeURIComponent(panelId)}/strike`, body);
export const requestJudgmentRecognition = (judgmentId: string, region: string) =>
  write(`/api/v1/court/judgments/${encodeURIComponent(judgmentId)}/recognition`, { region });
export const appealRecognition = (recognitionId: string) =>
  write(`/api/v1/court/recognition/${encodeURIComponent(recognitionId)}/appeal`);

// ---------------------------------------------------------------- insolvency
export const fileInsolvency = (body: { ticker: string; kind: "reorganization" | "liquidation"; reason?: string }) =>
  write("/api/v1/insolvency", body);
export const fetchInsolvency = (caseId: string) => call(`/api/v1/insolvency/${encodeURIComponent(caseId)}`);
export const fileInsolvencyClaim = (caseId: string, body: { kind: string; amount: string }) =>
  write(`/api/v1/insolvency/${encodeURIComponent(caseId)}/claims`, body);
export const createInsolvencyPlan = (caseId: string, document: Record<string, unknown>) =>
  write(`/api/v1/insolvency/${encodeURIComponent(caseId)}/plan`, { document });
export const voteInsolvencyPlan = (
  caseId: string,
  body: { plan_id: string; claim_class: string; choice: "yes" | "no" },
) => write(`/api/v1/insolvency/${encodeURIComponent(caseId)}/plan/vote`, body);
export const confirmInsolvencyPlan = (caseId: string, planId: string) =>
  write(`/api/v1/insolvency/${encodeURIComponent(caseId)}/plan/confirm`, { plan_id: planId });
export const liquidateInsolvency = (caseId: string) =>
  write(`/api/v1/insolvency/${encodeURIComponent(caseId)}/liquidate`, { case: caseId, liquidate: true });

// ---------------------------------------------------------------- ops (admin/ops only)
export const fetchAudit = (limit = 100) => call(`/api/v1/admin/audit${qs({ limit })}`);
