"""世界构建：系统账户、真人玩家、AI 玩家、银行、上市公司、行星产权。

初始货币存量按 `m0_days × 当日基础发行量` 生成，一次性注入（视为开服注资，不计入首月通胀）。
"""

import math

from . import config as cfg
from .actors import Actor
from .banking import Bank
from .money import ONE, ZERO, clamp, dec, quant, rand_dec
from .property import Property
from .stocks import Company, Listing, OrderBook

TICKERS = (
    ("ORIN", "猎户重工", "industrial", "1800000000", "30000", "42000", "0.16"),
    ("VELA", "船帆航运", "logistics", "1400000000", "24000", "36000", "0.12"),
    ("KEPL", "开普勒能源", "energy", "2600000000", "40000", "58000", "0.18"),
    ("DRAC", "天龙矿业", "mining", "2200000000", "34000", "48000", "0.20"),
    ("LYRA", "天琴生物", "bio", "1200000000", "20000", "28000", "0.14"),
    ("CYGN", "天鹅数据", "data", "3000000000", "46000", "64000", "0.22"),
    ("ARCT", "大角建设", "construction", "1600000000", "28000", "34000", "0.11"),
    ("PERI", "近星银行", "finance", "2800000000", "38000", "52000", "0.17"),
)


def estimate_daily_issuance(sc) -> "object":
    volume = sc.humans * sc.am_per_day * cfg.AM_PRICE_Q1 * dec("1.4")
    raw = dec(sc.humans + sc.ai_count) * cfg.POLICY.active_weight + volume * cfg.POLICY.volume_factor
    return clamp(raw, cfg.POLICY.min_daily, cfg.POLICY.max_daily)


def build(sim) -> None:
    _system(sim)
    _players(sim)
    _banks(sim)
    _companies(sim)
    _properties(sim)
    _endow(sim)
    _open_accounts(sim)


def _system(sim) -> None:
    for actor_id, kind, name in (
        ("treasury", "treasury", "宇宙中央银行/国库"),
        ("burn", "burn", "销毁科目"),
        ("pool", "exchange", "商品清算池"),
        ("council_fund", "council", "议会基金"),
        ("sector_sovereign", "sector", "星区主权者"),
        ("insurance", "council", "存款保险基金"),
    ):
        sim.register(Actor(id=actor_id, kind=kind, name=name, controller="system"))


def _players(sim) -> None:
    sc = sim.sc
    for index in range(sc.humans):
        skill = dec(math.exp(sim.rng.gauss(0.0, 0.35)))
        actor = Actor(id=f"h{index:04d}", kind="player", name=f"玩家{index:04d}", controller="human",
                      policy=cfg.persona_policy(""), skill=skill, production=sc.am_per_day * skill)
        sim.register(actor)
        sim.players.append(actor)
        sim.humans.append(actor)
    for index in range(sc.ai_count):
        persona = cfg.AI_PERSONA_MIX[index % len(cfg.AI_PERSONA_MIX)]
        skill = dec(math.exp(sim.rng.gauss(0.0, 0.30)))
        actor = Actor(id=f"ai{index:02d}", kind="player", name=f"AI-{persona}-{index:02d}",
                      controller="server_ai", persona=persona, policy=cfg.persona_policy(persona),
                      skill=skill, production=sc.am_per_day * skill)
        sim.register(actor)
        sim.players.append(actor)
        sim.ais.append(actor)
        if persona == "market_maker" and sim.maker is None:
            sim.maker = actor


def _banks(sim) -> None:
    specs = (("aurora", "极光商业银行", sim.ais[2].id if len(sim.ais) > 2 else ""),
             ("nebula", "星云商业银行", ""),
             ("helix", "螺旋 AI 银行", sim.ais[7].id if len(sim.ais) > 7 else ""))
    for code, name, owner in specs:
        bank = Bank(id=f"bank:{code}", name=name, owner_id=owner,
                    kind="ai" if owner else "commercial")
        sim.banks.append(bank)
        sim.register(Actor(id=bank.id, kind="bank", name=name, controller="system"))
        sim.register(Actor(id=bank.credit_id, kind="bank", name=f"{name}-信用", controller="system"))


def _companies(sim) -> None:
    for ticker, name, sector, book, shares, revenue, margin in TICKERS:
        company = Company(ticker=ticker, name=name, sector=sector, shares_total=int(shares),
                          free_float=int(int(shares) * 0.45), book_value=dec(book),
                          revenue=dec(revenue), margin=dec(margin), ipo_price=ZERO, price=ZERO)
        list_price = quant(company.book_value / dec(company.shares_total) * cfg.MARKET.ipo_book_multiple)
        company.ipo_price = quant(list_price / cfg.BASE_VALUE["cc4"])
        company.price = company.ipo_price
        listing = Listing(company=company)
        sim.stocks.listings.append(listing)
        sim.stocks.by_ticker[ticker] = listing
        sim.stocks.books[ticker] = OrderBook()


def _properties(sim) -> None:
    owners = [a for a in sim.ais if a.persona in ("landlord", "raider", "industrialist")]
    for index in range(24):
        prop = Property(asset_key=f"planet_{index:04d}", kind="planet", owner_id="treasury",
                        base=quant(rand_dec(sim.rng, "180000", "900000")),
                        resource_score=rand_dec(sim.rng, "0", "1"),
                        development=rand_dec(sim.rng, "0", "4"),
                        traffic=rand_dec(sim.rng, "0", "1"), valuation=ZERO)
        if owners and index < 10:
            prop.owner_id = owners[index % len(owners)].id
        sim.property.add(prop)
        owner = sim.actor(prop.owner_id)
        if owner is not None:
            owner.properties.append(prop)


def _endow(sim) -> None:
    sc = sim.sc
    daily = estimate_daily_issuance(sc)
    m0 = quant(daily * sc.m0_days)
    per_human = quant(m0 / dec(sc.humans))
    ledger = sim.ledger
    for actor in sim.humans:
        ledger.apply([(sim.treasury_id, "cc1", -per_human), (actor.id, "cc1", per_human)], "genesis")
    for actor in sim.ais:
        ledger.apply([(sim.treasury_id, "cc1", -sc.ai_capital), (actor.id, "cc1", sc.ai_capital)], "genesis")
    for bank in sim.banks:
        ledger.apply([(sim.treasury_id, "cc1", -cfg.BANK.bank_capital), (bank.id, "cc1", cfg.BANK.bank_capital)],
                     "bank_capital")
    if sim.maker is not None:
        extra = dec("500000")
        ledger.apply([(sim.treasury_id, "cc1", -extra), (sim.maker.id, "cc1", extra)], "genesis")
    sim.stats["genesis_m0"] = m0


def _open_accounts(sim) -> None:
    sc = sim.sc
    for actor in sim.players:
        if not sim.banks or sim.rng.random() > float(sc.bank_share):
            continue
        bank = sim.banks[sim.rng.randrange(len(sim.banks))]
        share = actor.policy.get("deposit", ZERO)
        amount = quant(sim.ledger.balance(actor.id) * share)
        if amount > ZERO:
            sim.banking.open_account(actor, bank, amount)
