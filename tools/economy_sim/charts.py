"""把结果渲染成自包含 HTML 图表（零依赖 SVG；如安装 plotly 则优先 plotly）。"""


def render_html(results: list) -> str:
    try:
        import plotly.graph_objects as go  # noqa: F401
        return _render_plotly(results)
    except ImportError:
        return _render_svg(results)


def _series(results: list, key: str) -> list:
    result = results[0]
    return [float(row[key]) for row in result["series"]]


def _charts_specs(results: list) -> list:
    result = results[0]
    days = list(range(result["days"] + 1))
    return [
        ("货币供应 M1（Q1）", "万 Q1", [{"label": "M1", "values": [v / 1e4 for v in _series(results, "m1")]}], days),
        ("月度指标", "占比", [
            {"label": "基尼系数", "values": [float(r["gini"]) for r in result["series"]]},
            {"label": "AI 净资产份额", "values": [float(r["ai_share"]) for r in result["series"]]},
        ], days),
        ("银行", "万 Q1", [
            {"label": "存款", "values": [float(r["deposits"]) / 1e4 for r in result["series"]]},
            {"label": "贷款", "values": [float(r["loans"]) / 1e4 for r in result["series"]]},
        ], days),
        ("价格指数 / 股价指数", "指数", [
            {"label": "商品价格", "values": [float(r["price_index"]) for r in result["series"]]},
            {"label": "股票指数", "values": [float(r["stock_index"]) for r in result["series"]]},
        ], days),
        ("发行与销毁", "万 Q1/日", [
            {"label": "日发行", "values": [float(r["issuance"]) / 1e4 for r in result["series"]]},
            {"label": "日销毁", "values": [float(r["burn"]) / 1e4 for r in result["series"]]},
        ], days),
        ("商品成交量", "万 Q1", [{"label": "成交量", "values": [float(r["volume"]) / 1e4 for r in result["series"]]}], days),
    ]


def _render_svg(results: list) -> str:
    specs = _charts_specs(results)
    cards = []
    for title, unit, series, labels in specs:
        cards.append(_svg_chart(title, unit, series, labels))
    body = "\n".join(cards)
    return _page(body, "宇宙经济模拟 · SVG 图表")


def _svg_chart(title: str, unit: str, series: list, labels: list) -> str:
    width, height = 640, 220
    pad_l, pad_r, pad_t, pad_b = 44, 12, 22, 24
    flat = [v for s in series for v in s["values"]]
    lo, hi = min(flat), max(flat)
    if hi - lo < 1e-9:
        hi = lo + 1
    span = hi - lo
    n = max(len(labels) - 1, 1)

    def x(i):
        return pad_l + (width - pad_l - pad_r) * (i / n)

    def y(v):
        return pad_t + (height - pad_t - pad_b) * (1 - (v - lo) / span)

    polylines = []
    palette = ("#4c78a8", "#f58518", "#54a24b", "#e45756", "#b279a2", "#72b7b2")
    legend = []
    for idx, s in enumerate(series):
        pts = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(s["values"]))
        color = palette[idx % len(palette)]
        polylines.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="2"/>')
        legend.append(f'<span style="color:{color}">● {s["label"]}</span>')
    grid = ""
    for g in range(4):
        gy = pad_t + (height - pad_t - pad_b) * (g / 3)
        grid += f'<line x1="{pad_l}" y1="{gy:.1f}" x2="{width - pad_r}" y2="{gy:.1f}" stroke="#e0e0e0" stroke-width="1"/>'
    return f"""
<div class="chart">
  <div class="title">{title} <span class="unit">（{unit}）</span></div>
  <svg viewBox="0 0 {width} {height}" width="100%" xmlns="http://www.w3.org/2000/svg">
    {grid}
    <text x="{pad_l}" y="{height - 6}" font-size="10" fill="#888">0</text>
    <text x="{width - pad_r}" y="{height - 6}" font-size="10" fill="#888" text-anchor="end">{n}</text>
    <text x="6" y="{pad_t + 3}" font-size="10" fill="#888">{hi:.2f}</text>
    <text x="6" y="{height - pad_b}" font-size="10" fill="#888">{lo:.2f}</text>
    {"".join(polylines)}
  </svg>
  <div class="legend">{"　".join(legend)}</div>
</div>"""


def _render_plotly(results: list) -> str:
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots
    specs = _charts_specs(results)
    figs = []
    for title, unit, series, labels in specs:
        fig = go.Figure()
        for s in series:
            fig.add_trace(go.Scatter(x=labels, y=s["values"], mode="lines", name=s["label"]))
        fig.update_layout(title=title, margin=dict(t=40, b=30, l=50, r=20))
        figs.append(fig.to_html(full_html=False, include_plotlyjs="cdn"))
    return _page("<br>".join(figs), "宇宙经济模拟 · Plotly 图表")


def _page(body: str, title: str) -> str:
    return f"""<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>{title}</title>
<style>
body {{ font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 24px; background: #fafafa; }}
h1 {{ font-size: 20px; }}
.chart {{ background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 14px; margin: 12px 0; }}
.title {{ font-size: 14px; font-weight: 600; margin-bottom: 6px; }}
.unit {{ color: #999; font-weight: 400; font-size: 12px; }}
.legend {{ font-size: 12px; color: #555; margin-top: 4px; }}
</style></head><body><h1>{title}</h1>{body}</body></html>"""
