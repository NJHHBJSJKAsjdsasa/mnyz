"""股票、订单簿、撮合与 K 线（05）。

- 报价货币 cc4（银核币），手续费买 0.1% / 卖 0.1% + 印花税 0.1%，全部进 burn；
- 撮合价优先、时间优先；成交与账本同事务，日线由当日成交聚合；
- 单账户持仓 ≤ 流通股 10%，单日 ±20% 熔断，收盘价 < 0.0001 连续 20 日退市。
"""

from dataclasses import dataclass, field
from decimal import Decimal

from . import config as cfg
from .money import ONE, ZERO, quant, rand_dec


@dataclass
class Company:
    ticker: str
    name: str
    sector: str
    shares_total: int
    free_float: int
    book_value: Decimal
    revenue: Decimal
    margin: Decimal
    ipo_price: Decimal
    price: Decimal
    listed_day: int = 0
    delisted: bool = False
    zero_days: int = 0
    holders: dict = field(default_factory=dict)


@dataclass
class Listing:
    company: Company
    candles: list = field(default_factory=list)
    halted: bool = False
    trades_today: int = 0
    volume_today: int = 0
    quote_volume_today: Decimal = ZERO


@dataclass
class Order:
    order_id: int
    actor_id: str
    side: str
    price: Decimal
    qty: int
    filled: int = 0
    seq: int = 0

    @property
    def remaining(self) -> int:
        return self.qty - self.filled


class OrderBook:
    """极简连续撮合：价格优先、时间优先，成交价取挂单方价格。"""

    def __init__(self) -> None:
        self.bids: list[Order] = []
        self.asks: list[Order] = []

    def submit(self, order: Order) -> None:
        if order.side == "buy":
            self.bids.append(order)
        else:
            self.asks.append(order)

    def best_bid(self) -> Decimal:
        return max((o.price for o in self.bids if o.remaining > 0), default=ZERO)

    def best_ask(self) -> Decimal:
        return min((o.price for o in self.asks if o.remaining > 0), default=ZERO)

    def crossing(self, side: str, limit: Decimal) -> list[Order]:
        if side == "buy":
            return sorted((o for o in self.asks if o.remaining > 0 and o.price <= limit),
                          key=lambda o: (o.price, o.seq))
        return sorted((o for o in self.bids if o.remaining > 0 and o.price >= limit),
                      key=lambda o: (-o.price, o.seq))


class StockMarket:
    def __init__(self, sim) -> None:
        self.sim = sim
        self.listings: list[Listing] = []
        self.by_ticker: dict[str, Listing] = {}
        self.books: dict[str, OrderBook] = {}
        self.order_seq = 0
        self.day_trades: list = []

    # --- 查询 ---------------------------------------------------------------
    def last_price(self, ticker: str) -> Decimal:
        listing = self.by_ticker.get(ticker)
        return listing.company.price if listing else ZERO

    def index_value(self) -> Decimal:
        if not self.listings:
            return ONE
        total = sum((l.company.price / l.company.ipo_price for l in self.listings), ZERO)
        return quant(total / Decimal(len(self.listings)))

    def transfer_shares(self, src: str, dst: str, ticker: str, qty: int) -> None:
        listing = self.by_ticker.get(ticker)
        if not listing:
            return
        listing.company.holders[dst] = listing.company.holders.get(dst, 0) + qty
        listing.company.holders[src] = max(0, listing.company.holders.get(src, 0) - qty)

    # --- 日循环 -------------------------------------------------------------
    def tick(self, day: int) -> None:
        self.day_trades = []
        self._fundamentals(day)
        for listing in self.listings:
            if listing.company.delisted:
                continue
            listing.trades_today = 0
            listing.volume_today = 0
            listing.quote_volume_today = ZERO
            self._generate_orders(listing)
            self._apply_breaker(listing)
            self._write_candle(listing, day)

    def _fundamentals(self, day: int) -> None:
        for listing in self.listings:
            company = listing.company
            if company.delisted:
                continue
            noise = rand_dec(self.sim.rng, "0.92", "1.08")
            revenue = company.revenue * noise
            profit = revenue * company.margin
            company.book_value += quant(profit * Decimal("0.6"))
            company.revenue = quant(revenue)

    def _fair_price(self, company: Company) -> Decimal:
        """每股账面价值 × P/B，再折算成 cc4（股票以 Q4 计价）。"""
        per_share = company.book_value / Decimal(company.shares_total)
        return max(Decimal("0.0001"), quant(per_share * cfg.MARKET.ipo_book_multiple / cfg.BASE_VALUE["cc4"]))

    # --- 下单 ---------------------------------------------------------------
    def _generate_orders(self, listing: Listing) -> None:
        self._market_maker(listing)
        for actor in self.sim.players:
            weight = actor.policy.get("stock", ZERO)
            if weight <= ZERO or actor.bankrupt:
                continue
            if rand_dec(self.sim.rng, "0", "1") > weight * Decimal("0.35"):
                continue
            self._participant_order(actor, listing)

    def _market_maker(self, listing: Listing) -> None:
        maker = self.sim.maker
        if maker is None or maker.bankrupt:
            return
        mid = listing.company.price
        spread = Decimal("0.012")
        size = max(1, int(listing.company.free_float * Decimal("0.01")))
        self._order(maker, listing, "buy", quant(mid * (ONE - spread)), size)
        shares = maker.shares.get(listing.company.ticker, 0)
        self._order(maker, listing, "sell", quant(mid * (ONE + spread)), min(size, shares))

    def _participant_order(self, actor, listing: Listing) -> None:
        company = listing.company
        fair = self._fair_price(company)
        view = fair * rand_dec(self.sim.rng, "0.82", "1.18")
        price = company.price
        held = actor.shares.get(company.ticker, 0)
        if view > price * Decimal("1.03"):
            budget = quant(self.sim.ledger.balance(actor.id) * Decimal("0.08"))
            qty = int(budget / max(price, ONE))
            self._order(actor, listing, "buy", quant(price * rand_dec(self.sim.rng, "1.0", "1.012")), qty)
        elif view < price * Decimal("0.97") and held > 0:
            self._order(actor, listing, "sell", quant(price * rand_dec(self.sim.rng, "0.988", "1.0")), held // 2)

    def _order(self, actor, listing: Listing, side: str, price: Decimal, qty: int) -> None:
        if qty <= 0 or price <= ZERO or listing.halted:
            return
        company = listing.company
        held = actor.shares.get(company.ticker, 0)
        if side == "sell":
            qty = min(qty, held)
        else:
            cap = int(company.free_float * cfg.MARKET.max_position_pct) - held
            qty = min(qty, max(0, cap))
            afford = int(self.sim.ledger.balance(actor.id, "cc4") / max(price, ONE))
            qty = min(qty, afford)
        if qty <= 0:
            return
        self.order_seq += 1
        order = Order(self.order_seq, actor.id, side, price, qty, seq=self.order_seq)
        book = self.books[company.ticker]
        self._match(order, listing, book)
        if order.remaining > 0:
            book.submit(order)

    def _match(self, order: Order, listing: Listing, book: OrderBook) -> None:
        limit = order.price if order.side == "buy" else order.price
        for resting in book.crossing(order.side, limit):
            if order.remaining <= 0:
                break
            qty = min(order.remaining, resting.remaining)
            if not self._execute(order, resting, listing, qty):
                break

    def _execute(self, taker: Order, maker: Order, listing: Listing, qty: int) -> bool:
        price = maker.price
        buyer = taker.actor_id if taker.side == "buy" else maker.actor_id
        seller = maker.actor_id if taker.side == "buy" else taker.actor_id
        gross = quant(price * Decimal(qty))
        fee = quant(gross * cfg.MARKET.stock_fee)
        stamp = quant(gross * cfg.MARKET.stamp_tax)
        if self.sim.ledger.balance(buyer, "cc4") < gross + fee:
            return False
        self.sim.ledger.apply([(buyer, "cc4", -(gross + fee)), (seller, "cc4", gross - fee - stamp),
                               (self.sim.burn_id, "cc4", fee * 2 + stamp)], "stock_trade")
        self.sim.book_shares(buyer, listing.company.ticker, qty)
        self.sim.book_shares(seller, listing.company.ticker, -qty)
        taker.filled += qty
        maker.filled += qty
        listing.company.price = price
        listing.trades_today += 1
        listing.volume_today += qty
        listing.quote_volume_today += gross
        self.day_trades.append({"ticker": listing.company.ticker, "price": price, "qty": qty,
                                "buyer": buyer, "seller": seller})
        self.sim.stats["stock_volume"] += gross
        self.sim.stats["stock_fee_burn"] += fee * 2 + stamp
        self.sim.record_volume(buyer, gross)
        self.sim.record_volume(seller, gross)
        return True

    # --- K 线与风控 ---------------------------------------------------------
    def _apply_breaker(self, listing: Listing) -> None:
        prev = listing.candles[-1]["close"] if listing.candles else listing.company.price
        if prev <= ZERO:
            return
        move = listing.company.price / prev - ONE
        listing.halted = abs(move) >= cfg.MARKET.circuit_breaker
        if listing.halted:
            self.sim.stats["circuit_breakers"] += 1

    def _write_candle(self, listing: Listing, day: int) -> None:
        company = listing.company
        prices = [t["price"] for t in self.day_trades if t["ticker"] == company.ticker]
        prev = listing.candles[-1]["close"] if listing.candles else company.ipo_price
        candle = {
            "day": day,
            "open": prices[0] if prices else prev,
            "high": max(prices) if prices else prev,
            "low": min(prices) if prices else prev,
            "close": company.price,
            "volume": listing.volume_today,
            "quote_volume": listing.quote_volume_today,
            "trades": listing.trades_today,
        }
        listing.candles.append(candle)
        company.zero_days = company.zero_days + 1 if company.price < Decimal("0.0001") else 0
        if company.zero_days >= 20:
            company.delisted = True
            self.sim.stats["delistings"] += 1
