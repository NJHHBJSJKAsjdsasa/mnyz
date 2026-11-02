#!/usr/bin/env python
"""Generate ``docs/api/openapi.json`` + ``docs/api/endpoints.md`` from the code.

    python scripts/gen_api_docs.py

Nothing is hand-maintained: routes come from the Flask url map, request bodies
from the ``parse_model(...)`` call inside each view, query parameters from
``request.args.get("...")``, and the request schemas from pydantic's own
``model_json_schema()``. If a view changes and the docs do not, CI fails (see
``--check``) — that is the whole point of 12 §C.
"""

from __future__ import annotations

import argparse
import importlib
import inspect
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from flask import Flask  # noqa: E402

OUT_JSON = ROOT / "docs" / "api" / "openapi.json"
OUT_MD = ROOT / "docs" / "api" / "endpoints.md"

QUERY_RE = re.compile(r'request\.args\.get\("([a-z_]+)"\)')
MODEL_RE = re.compile(r"parse_model\((\w+)\)")

# Views that take a JSON body but validate it by hand (legacy): none left as of 2026-10-28.
# `market.py` moved to pydantic (`QuoteRequest`, `ExchangeCreateRequest`, …) and
# `publish_quote` never had a body. Keep the mechanism (and the `手工校验` column) so the next
# hand-parsed body is declared here instead of silently rendering as bodyless.
LOOSE_BODY: set[str] = set()


def _import_models() -> dict[str, type]:
    models: dict[str, type] = {}
    package = importlib.import_module("server.models")
    for path in (ROOT / "server" / "models").glob("*.py"):
        if path.stem.startswith("__"):
            continue
        module = importlib.import_module(f"server.models.{path.stem}")
        for name, obj in vars(module).items():
            if inspect.isclass(obj) and hasattr(obj, "model_json_schema"):
                models[name] = obj
    _ = package
    return models


def _schema_name(model_name: str) -> str:
    return model_name


def _convert_path(rule: str) -> tuple[str, list[dict]]:
    params: list[dict] = []
    out = rule
    for match in re.finditer(r"<(?:(?P<conv>\w+):)?(?P<name>\w+)>", rule):
        name = match.group("name")
        conv = match.group("conv") or "string"
        params.append(
            {
                "name": name,
                "in": "path",
                "required": True,
                "schema": {"type": "integer"} if conv == "int" else {"type": "string"},
            }
        )
        out = out.replace(match.group(0), "{" + name + "}")
    return out, params


def _view_meta(view) -> dict:
    try:
        source = inspect.getsource(view)
    except (OSError, TypeError):
        source = ""
    doc = (inspect.getdoc(view) or "").strip().splitlines()
    summary = doc[0] if doc else ""
    model = MODEL_RE.search(source)
    query = sorted(set(QUERY_RE.findall(source)))
    unauthenticated = "@require_auth" not in source
    write = "require_auth(write=True)" in source
    idempotent = "begin_idempotency" in source or "_write(" in source
    model_name = model.group(1) if model else None
    loose = view.__name__ in LOOSE_BODY
    return {
        "summary": summary,
        "model": model_name,
        "body_kind": "schema" if model_name else ("hand-validated" if loose else "none"),
        "query": query,
        "auth": not unauthenticated,
        "write": write,
        "idempotent": idempotent,
        "source": inspect.getsourcefile(view) or "",
        "loose_body": loose,
    }


def build() -> dict:
    from server.api.v1 import api_bp

    app = Flask("api_docgen")
    app.register_blueprint(api_bp, url_prefix="/api/v1")
    models = _import_models()

    paths: dict[str, dict] = {}
    rows: list[dict] = []
    schemas: dict[str, Any] = {}

    for rule in sorted(app.url_map.iter_rules(), key=lambda r: str(r)):
        if "/api/v1/" not in str(rule):
            continue
        path, path_params = _convert_path(str(rule))
        view = app.view_functions[rule.endpoint]
        meta = _view_meta(view)
        parts = rule.endpoint.split(".")
        blueprint = parts[-2] if len(parts) >= 2 else parts[0]
        params = list(path_params)
        for name in meta["query"]:
            params.append({"name": name, "in": "query", "required": False, "schema": {"type": "string"}})

        body_schema = None
        body_kind = meta["body_kind"]
        if meta["model"] and meta["model"] in models:
            schemas[_schema_name(meta["model"])] = models[meta["model"]].model_json_schema()
            body_schema = {"$ref": f"#/components/schemas/{meta['model']}"}
            body_kind = "schema"
        elif meta["model"]:
            # parse_model(X) with an unknown X: a typo in the view, not a documentation gap
            body_kind = "unresolved"

        for method in sorted(rule.methods - {"HEAD", "OPTIONS"}):
            entry: dict[str, Any] = {
                "tags": [blueprint],
                "summary": meta["summary"] or f"{method} {path}",
                "parameters": params,
                "responses": {"200": {"description": "ok"}},
            }
            if meta["auth"]:
                entry["security"] = [{"bearerAuth": []}]
            if method in {"POST", "PUT", "PATCH", "DELETE"} and meta["idempotent"]:
                entry["parameters"] = params + [
                    {
                        "name": "Idempotency-Key",
                        "in": "header",
                        "required": True,
                        "schema": {"type": "string", "maxLength": 128},
                    }
                ]
            if body_schema and method in {"POST", "PUT", "PATCH"}:
                entry["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": body_schema}},
                }
            elif method in {"POST", "PUT", "PATCH", "DELETE"}:
                # No pydantic body. Say which kind of "none" this is, so a new view that
                # forgets parse_model() shows up in the doc instead of looking bodyless
                # (12 §C). "hand-validated" is the legacy market set, listed in LOOSE_BODY.
                entry["x-atlas-body"] = body_kind
            paths.setdefault(path, {})[method.lower()] = entry
            rows.append(
                {
                    "blueprint": blueprint,
                    "method": method,
                    "path": path,
                    "summary": entry["summary"],
                    "auth": meta["auth"],
                    "write": meta["write"],
                    "idempotent": meta["idempotent"],
                    "model": meta["model"],
                    "body_kind": body_kind if method in {"POST", "PUT", "PATCH", "DELETE"} else "—",
                    "query": meta["query"],
                }
            )

    writes = [row for row in rows if row["method"] in {"POST", "PUT", "PATCH", "DELETE"}]
    coverage = {
        "writes": len(writes),
        "with_schema": sum(1 for row in writes if row["body_kind"] == "schema"),
        "hand_validated": sum(1 for row in writes if row["body_kind"] == "hand-validated"),
        "bodyless": sum(1 for row in writes if row["body_kind"] == "none"),
        "unresolved": [f"{row['method']} {row['path']}" for row in writes if row["body_kind"] == "unresolved"],
    }

    spec = {
        "openapi": "3.1.0",
        "x-atlas-coverage": coverage,
        "info": {
            "title": "Atlas API",
            "version": "1.0.0",
            "description": (
                "Generated from the Flask url map by scripts/gen_api_docs.py. "
                "Envelope: {ok, request_id, data, state_version?}. "
                "Errors: application/problem+json with a stable `code`."
            ),
        },
        "servers": [{"url": "http://127.0.0.1:8000"}],
        "components": {
            "securitySchemes": {
                "bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
            },
            "schemas": schemas,
        },
        "paths": paths,
    }
    return {"spec": spec, "rows": rows}


def render_markdown(rows: list[dict]) -> str:
    total = len(rows)
    blueprints = sorted({row["blueprint"] for row in rows})
    lines = [
        "# Atlas API 端点清单",
        "",
        "> 本文件由 `python scripts/gen_api_docs.py` 生成，**不要手改**。",
        f"> 共 **{total}** 个操作 / **{len(blueprints)}** 个蓝图。",
        (
            f"> 请求体覆盖：{sum(1 for r in rows if r['body_kind'] != '—')} 个写操作中 "
            f"**{sum(1 for r in rows if r['body_kind'] == 'schema')} 个有 pydantic schema**、"
            f"{sum(1 for r in rows if r['body_kind'] == 'hand-validated')} 个手工校验、"
            f"{sum(1 for r in rows if r['body_kind'] == 'none')} 个无请求体"
            + (
                f"、**{sum(1 for r in rows if r['body_kind'] == 'unresolved')} 个未解析（视图里 parse_model 写错，需修）**"
                if any(r["body_kind"] == "unresolved" for r in rows)
                else ""
            )
            + "。"
        ),
        "",
        "## 约定",
        "",
        "| 项 | 规则 |",
        "|---|---|",
        "| 响应包 | `{ ok, request_id, data, state_version? }` |",
        "| 错误 | `application/problem+json`，`code` 稳定可机读（见 `GET /api/v1/meta/error-codes`） |",
        "| 鉴权 | `Authorization: Bearer <access_token>` |",
        "| 写接口 | 必须带 `Idempotency-Key`；并发敏感接口可带 `If-Match: \"<state_version>\"` |",
        "| 金额 | 一律字符串，`numeric(30,4)` |",
        "| 时间 | ISO 8601 |",
        "",
        "## 按蓝图",
        "",
        "| 蓝图 | 操作数 |",
        "|---|---:|",
    ]
    for name in blueprints:
        lines.append(f"| `{name}` | {sum(1 for r in rows if r['blueprint'] == name)} |")

    for name in blueprints:
        lines += ["", f"## {name}", "", "| 方法 | 路径 | 说明 | 鉴权 | 幂等 | 请求体 |", "|---|---|---|---|---|---|"]
        for row in sorted((r for r in rows if r["blueprint"] == name), key=lambda r: (r["path"], r["method"])):
            auth = "Bearer" if row["auth"] else "公开"
            idem = "是" if row["idempotent"] else "—"
            if row["model"]:
                body = f"`{row['model']}`"
            elif row["body_kind"] == "hand-validated":
                body = "手工校验"
            elif row["body_kind"] == "unresolved":
                body = "**未解析**"
            else:
                body = "—"
            query = f" ?{', '.join(row['query'])}" if row["query"] else ""
            lines.append(
                f"| `{row['method']}` | `{row['path']}`{query} | {row['summary']} | {auth} | {idem} | {body} |"
            )
    lines += [
        "",
        "## 校验",
        "",
        "```bash",
        "python scripts/gen_api_docs.py --check   # 文档与代码不一致则退出码 1",
        "```",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if docs are stale")
    args = parser.parse_args()

    built = build()
    spec_text = json.dumps(built["spec"], indent=2, ensure_ascii=False, sort_keys=False) + "\n"
    md_text = render_markdown(built["rows"])

    if args.check:
        stale = []
        if not OUT_JSON.exists() or OUT_JSON.read_text(encoding="utf-8") != spec_text:
            stale.append(OUT_JSON.name)
        if not OUT_MD.exists() or OUT_MD.read_text(encoding="utf-8") != md_text:
            stale.append(OUT_MD.name)
        if stale:
            print(f"[fail] stale: {', '.join(stale)} — run python scripts/gen_api_docs.py")
            return 1
        print("[ok] api docs match the code")
        return 0

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(spec_text, encoding="utf-8")
    OUT_MD.write_text(md_text, encoding="utf-8")
    print(f"wrote {OUT_JSON.relative_to(ROOT)} ({len(built['spec']['paths'])} paths, "
          f"{len(built['rows'])} operations)")
    print(f"wrote {OUT_MD.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
