"""Company law, commercial court and insolvency (08)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from server.domain import currency_service
from server.domain.currency_service import Move
from server.repo import currency as currency_repo
from tests.helpers import bearer, guest

CHARTER = {
    "share_classes": [{"code": "A", "votes": 1}],
    "board": {"seats": 3, "term_days": 365},
    "meetings": {"notice_days": 7, "ordinary": 0.5, "special": 0.6667},
    "capital": {"dividend": "ordinary", "buyback": "special"},
    "related_party": {"approval": "board"},
    "dispute": {"court": "CC-CORE-1"},
}


def _player(client, device: str) -> dict:
    data = guest(client, device_id=device)
    return {"token": data["access_token"], "id": data["player"]["id"]}


def _headers(token: str) -> dict[str, str]:
    return {**bearer(token), "Idempotency-Key": str(uuid.uuid4())}


def _fund(dsn: str, player_id: str, code: str, amount: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_repo.create_player_actor(conn, player_id, "测试舰长")
    _fund_actor(dsn, str(actor["id"]), code, amount)


def _fund_actor(dsn: str, actor_id: str, code: str, amount: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        treasury = currency_service.system_actor(conn, "treasury")
        currency_service.post(
            conn,
            kind="test_grant",
            moves=[
                Move(treasury["id"], code, -Decimal(amount)),
                Move(actor_id, code, Decimal(amount)),
            ],
            ref_type="test",
            ref_id=str(uuid.uuid4()),
        )


def _actor_id(dsn: str, player_id: str) -> str:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        actor = currency_repo.actor_for_player(conn, player_id)
        if actor is None:
            actor = currency_repo.create_player_actor(conn, player_id, "测试舰长")
    return str(actor["id"])


def _balance(dsn: str, actor_id: str, code: str = "cc1") -> Decimal:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = currency_repo.account(conn, actor_id, code)
    return Decimal(row["balance"]) if row else Decimal(0)


def _make_admin(dsn: str, player_id: str) -> None:
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute(
            "UPDATE accounts SET role = 'admin' "
            "WHERE id = (SELECT account_id FROM players WHERE id = %s)",
            (player_id,),
        )


def _company(client, dsn: str, *, ticker: str, device: str, shares: int = 1_000_000) -> dict:
    founder = _player(client, device)
    _fund(dsn, founder["id"], "cc3", "5")
    created = client.post(
        "/api/v1/companies",
        json={"ticker": ticker, "name": f"{ticker} 星际控股", "shares_total": shares},
        headers=_headers(founder["token"]),
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    with psycopg.connect(dsn, autocommit=True, row_factory=dict_row) as conn:
        row = conn.execute(
            "SELECT id, treasury_actor_id, founder_actor_id FROM companies WHERE ticker = %s",
            (ticker,),
        ).fetchone()
    return {
        "founder": founder,
        "company_id": str(row["id"]),
        "treasury_actor_id": str(row["treasury_actor_id"]),
        "founder_actor_id": str(row["founder_actor_id"]),
    }


def test_charter_and_special_resolution(client, test_dsn):
    setup = _company(client, test_dsn, ticker="ACME", device="gov-founder")
    token = setup["founder"]["token"]

    charter = client.post(
        "/api/v1/companies/ACME/charter",
        json={"document": CHARTER},
        headers=_headers(token),
    )
    assert charter.status_code == 200, charter.get_data(as_text=True)
    assert charter.get_json()["data"]["version"] == 1

    proposed = client.post(
        "/api/v1/companies/ACME/resolutions",
        json={"kind": "officer_appointment",
              "payload": {"role": "ceo", "actor_id": setup["founder_actor_id"]}},
        headers=_headers(token),
    )
    assert proposed.status_code == 200, proposed.get_data(as_text=True)
    resolution = proposed.get_json()["data"]
    assert resolution["special"] is False
    assert resolution["yes"] == 1_000_000

    closed = client.post(
        f"/api/v1/companies/resolutions/{resolution['id']}/close",
        json={}, headers=_headers(token),
    )
    assert closed.status_code == 200, closed.get_data(as_text=True)
    assert closed.get_json()["data"]["status"] == "passed"

    governance = client.get(
        "/api/v1/companies/ACME/governance", headers=bearer(token)
    ).get_json()["data"]
    assert governance["charter"]["version"] == 1
    assert governance["officers"][0]["role"] == "ceo"

    # a special resolution needs > 2/3
    diss = client.post(
        "/api/v1/companies/ACME/resolutions",
        json={"kind": "dissolution", "payload": {}},
        headers=_headers(token),
    ).get_json()["data"]
    assert diss["special"] is True
    closed = client.post(
        f"/api/v1/companies/resolutions/{diss['id']}/close", json={}, headers=_headers(token)
    ).get_json()["data"]
    assert closed["status"] == "passed"
    assert closed["threshold"].startswith("0.666")


def test_minority_shareholder_cannot_force_and_related_party_abstains(client, test_dsn):
    setup = _company(client, test_dsn, ticker="BETA", device="rp-founder")
    founder = setup["founder"]
    partner = _player(client, "rp-partner")
    partner_actor = _actor_id(test_dsn, partner["id"])

    moved = client.post(
        "/api/v1/companies/BETA/shares/transfer",
        json={"to_actor_id": partner_actor, "shares": 300_000},
        headers=_headers(founder["token"]),
    )
    assert moved.status_code == 200, moved.get_data(as_text=True)

    # partner (30%) cannot approve its own related-party deal
    declared = client.post(
        "/api/v1/companies/BETA/related-party",
        json={"counterparty_actor_id": partner_actor, "kind": "supply", "amount": "500"},
        headers=_headers(partner["token"]),
    )
    assert declared.status_code == 200, declared.get_data(as_text=True)
    txn_id = declared.get_json()["data"]["id"]
    blocked = client.post(
        f"/api/v1/companies/BETA/related-party/{txn_id}/decide",
        json={"approve": True}, headers=_headers(partner["token"]),
    )
    assert blocked.status_code == 403

    approved = client.post(
        f"/api/v1/companies/BETA/related-party/{txn_id}/decide",
        json={"approve": True}, headers=_headers(founder["token"]),
    )
    assert approved.status_code == 200, approved.get_data(as_text=True)
    assert approved.get_json()["data"]["status"] == "approved"

    # a deal where the controller is the counterparty must be abstained, not approved
    self_deal = client.post(
        "/api/v1/companies/BETA/related-party",
        json={"counterparty_actor_id": setup["founder_actor_id"], "kind": "loan",
              "amount": "900"},
        headers=_headers(founder["token"]),
    ).get_json()["data"]
    refused = client.post(
        f"/api/v1/companies/BETA/related-party/{self_deal['id']}/decide",
        json={"approve": True}, headers=_headers(founder["token"]),
    )
    assert refused.status_code == 403

    # voting on a related-party resolution abstains the related shareholder
    resolution = client.post(
        "/api/v1/companies/BETA/resolutions",
        json={"kind": "related_party",
              "payload": {"transaction_id": self_deal["id"],
                          "related_actor_id": setup["founder_actor_id"]}},
        headers=_headers(founder["token"]),
    ).get_json()["data"]
    voted = client.post(
        f"/api/v1/companies/resolutions/{resolution['id']}/vote",
        json={"choice": "yes"}, headers=_headers(founder["token"]),
    )
    assert voted.status_code == 200, voted.get_data(as_text=True)
    assert voted.get_json()["data"]["my_choice"] == "abstain"


def test_court_filing_judgment_and_enforcement(client, test_dsn):
    plaintiff = _player(client, "court-plaintiff")
    defendant = _player(client, "court-defendant")
    _fund(test_dsn, plaintiff["id"], "cc1", "100")
    _fund(test_dsn, defendant["id"], "cc1", "500")
    defendant_actor = _actor_id(test_dsn, defendant["id"])
    plaintiff_actor = _actor_id(test_dsn, plaintiff["id"])

    filed = client.post(
        "/api/v1/court/cases",
        json={"kind": "contract", "defendant_actor_id": defendant_actor,
              "amount": "200", "claim": "未交付货物"},
        headers=_headers(plaintiff["token"]),
    )
    assert filed.status_code == 200, filed.get_data(as_text=True)
    case = filed.get_json()["data"]
    assert case["status"] == "served"
    assert case["filing_fee"] == "10.0000"
    assert _balance(test_dsn, plaintiff_actor) == Decimal("90.0000")

    for index in range(3):
        evidence = client.post(
            f"/api/v1/court/cases/{case['id']}/evidence",
            json={"summary": f"证据 {index}", "payload": {"doc": index}},
            headers=_headers(plaintiff["token"]),
        )
        assert evidence.status_code == 200, evidence.get_data(as_text=True)

    third = _player(client, "court-outsider")
    denied = client.post(
        f"/api/v1/court/cases/{case['id']}/evidence",
        json={"summary": "外部证据"}, headers=_headers(third["token"]),
    )
    assert denied.status_code == 403

    _make_admin(test_dsn, plaintiff["id"])
    judged = client.post(
        f"/api/v1/admin/court/cases/{case['id']}/judge", json={},
        headers=_headers(plaintiff["token"]),
    )
    assert judged.status_code == 200, judged.get_data(as_text=True)
    verdict = judged.get_json()["data"]
    assert verdict["judgment"]["verdict"] == "plaintiff"
    assert verdict["remedy"]["pay"] == "200.0000"

    enforced = client.post(
        f"/api/v1/court/cases/{case['id']}/enforce", json={},
        headers=_headers(plaintiff["token"]),
    )
    assert enforced.status_code == 200, enforced.get_data(as_text=True)
    assert enforced.get_json()["data"]["paid"] == "200.0000"
    assert _balance(test_dsn, plaintiff_actor) == Decimal("290.0000")
    assert _balance(test_dsn, defendant_actor) == Decimal("300.0000")

    redo = client.post(
        f"/api/v1/court/cases/{case['id']}/enforce", json={},
        headers=_headers(plaintiff["token"]),
    )
    assert redo.status_code == 422


def test_appeal_runs_once(client, test_dsn):
    plaintiff = _player(client, "appeal-plaintiff")
    defendant = _player(client, "appeal-defendant")
    _fund(test_dsn, plaintiff["id"], "cc1", "100")
    _fund(test_dsn, defendant["id"], "cc1", "100")
    case = client.post(
        "/api/v1/court/cases",
        json={"kind": "tort", "defendant_actor_id": _actor_id(test_dsn, defendant["id"]),
              "amount": "50"},
        headers=_headers(plaintiff["token"]),
    ).get_json()["data"]

    _make_admin(test_dsn, plaintiff["id"])
    client.post(f"/api/v1/admin/court/cases/{case['id']}/judge", json={},
                headers=_headers(plaintiff["token"]))
    first = client.post(
        f"/api/v1/court/cases/{case['id']}/appeal", json={},
        headers=_headers(defendant["token"]),
    )
    assert first.status_code == 200, first.get_data(as_text=True)
    assert first.get_json()["data"]["outcome"]["result"] in ("upheld", "overturned")
    second = client.post(
        f"/api/v1/court/cases/{case['id']}/appeal", json={},
        headers=_headers(plaintiff["token"]),
    )
    assert second.status_code == 422

    detail = client.get(
        f"/api/v1/court/cases/{case['id']}", headers=bearer(plaintiff["token"])
    ).get_json()["data"]
    assert detail["judgment"]["status"] == "final"
    assert detail["appeal"]["status"] in ("upheld", "overturned")


def test_insolvency_stay_blocks_new_suits(client, test_dsn):
    setup = _company(client, test_dsn, ticker="GAMMA", device="insol-founder")
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("UPDATE companies SET book_value = -5000 WHERE ticker = 'GAMMA'")

    filed = client.post(
        "/api/v1/insolvency",
        json={"ticker": "GAMMA", "kind": "liquidation", "reason": "资不抵债"},
        headers=_headers(setup["founder"]["token"]),
    )
    assert filed.status_code == 200, filed.get_data(as_text=True)
    case = filed.get_json()["data"]
    assert case["status"] == "stay"
    assert case["administrator_actor_id"]

    creditor = _player(client, "insol-creditor")
    _fund(test_dsn, creditor["id"], "cc1", "100")
    blocked = client.post(
        "/api/v1/court/cases",
        json={"kind": "contract", "defendant_actor_id": setup["treasury_actor_id"],
              "amount": "10"},
        headers=_headers(creditor["token"]),
    )
    assert blocked.status_code == 422
    assert "自动中止" in blocked.get_json()["detail"]


def test_liquidation_follows_priority_order(client, test_dsn):
    setup = _company(client, test_dsn, ticker="DELTA", device="liq-founder")
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("UPDATE companies SET book_value = -8000 WHERE ticker = 'DELTA'")
    _fund_actor(test_dsn, setup["treasury_actor_id"], "cc4", "10000")

    case = client.post(
        "/api/v1/insolvency",
        json={"ticker": "DELTA", "kind": "liquidation", "reason": "资不抵债"},
        headers=_headers(setup["founder"]["token"]),
    ).get_json()["data"]

    secured = _player(client, "liq-secured")
    priority = _player(client, "liq-priority")
    unsecured = _player(client, "liq-unsecured")
    for player, kind, amount in (
        (secured, "secured", "6000"),
        (priority, "priority", "2000"),
        (unsecured, "unsecured", "3000"),
    ):
        claim = client.post(
            f"/api/v1/insolvency/{case['case_id']}/claims",
            json={"kind": kind, "amount": amount},
            headers=_headers(player["token"]),
        )
        assert claim.status_code == 200, claim.get_data(as_text=True)
        assert claim.get_json()["data"]["status"] == "admitted"

    admin = _player(client, "liq-admin")
    _make_admin(test_dsn, admin["id"])
    result = client.post(
        f"/api/v1/insolvency/{case['case_id']}/liquidate", json={},
        headers=_headers(admin["token"]),
    )
    assert result.status_code == 200, result.get_data(as_text=True)
    body = result.get_json()["data"]
    assert body["status"] == "closed"

    # estate 10,000 - 500 admin fee = 9,500: secured 6,000, priority 2,000,
    # unsecured pro rata 1,500 / 3,000
    assert _balance(test_dsn, _actor_id(test_dsn, secured["id"]), "cc4") == Decimal("6000.0000")
    assert _balance(test_dsn, _actor_id(test_dsn, priority["id"]), "cc4") == Decimal("2000.0000")
    assert _balance(test_dsn, _actor_id(test_dsn, unsecured["id"]), "cc4") == Decimal("1500.0000")

    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        company = conn.execute(
            "SELECT status FROM companies WHERE ticker = 'DELTA'"
        ).fetchone()
        insolvency = conn.execute(
            "SELECT status FROM insolvency_cases WHERE id = %s", (case["case_id"],)
        ).fetchone()
    assert company["status"] == "liquidated"
    assert insolvency["status"] == "closed"


def test_restructuring_plan_class_vote(client, test_dsn):
    setup = _company(client, test_dsn, ticker="EPSI", device="plan-founder")
    with psycopg.connect(test_dsn, autocommit=True, row_factory=dict_row) as conn:
        conn.execute("UPDATE companies SET book_value = -3000 WHERE ticker = 'EPSI'")

    case = client.post(
        "/api/v1/insolvency",
        json={"ticker": "EPSI", "kind": "reorganization", "reason": "流动性危机"},
        headers=_headers(setup["founder"]["token"]),
    ).get_json()["data"]

    creditor = _player(client, "plan-creditor")
    client.post(
        f"/api/v1/insolvency/{case['case_id']}/claims",
        json={"kind": "secured", "amount": "4000"},
        headers=_headers(creditor["token"]),
    )
    plan = client.post(
        f"/api/v1/insolvency/{case['case_id']}/plan",
        json={"document": {"haircut": "0.2", "years": 3}},
        headers=_headers(setup["founder"]["token"]),
    )
    assert plan.status_code == 200, plan.get_data(as_text=True)
    plan_id = plan.get_json()["data"]["plan_id"]

    vote = client.post(
        f"/api/v1/insolvency/{case['case_id']}/plan/vote",
        json={"plan_id": plan_id, "claim_class": "secured", "choice": "yes"},
        headers=_headers(creditor["token"]),
    )
    assert vote.status_code == 200, vote.get_data(as_text=True)

    confirm = client.post(
        f"/api/v1/insolvency/{case['case_id']}/plan/confirm",
        json={"plan_id": plan_id, "claim_class": "secured", "choice": "yes"},
        headers=_headers(setup["founder"]["token"]),
    )
    assert confirm.status_code == 200, confirm.get_data(as_text=True)
    assert confirm.get_json()["data"]["confirmed"] is True

    detail = client.get(
        f"/api/v1/insolvency/{case['case_id']}", headers=bearer(creditor["token"])
    ).get_json()["data"]
    assert detail["status"] == "administration"
    assert detail["plan"]["status"] == "confirmed"
