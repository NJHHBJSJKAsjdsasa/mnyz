"""In-process token bucket used when Redis is unavailable."""

from __future__ import annotations

from server.infra.redis import RedisFacade


def test_memory_bucket_exhausts_and_reports_negative():
    facade = RedisFacade("memory://")
    assert facade.degraded is True
    assert facade.take_token("k", capacity=2, per_seconds=60, cost=1) == 1
    assert facade.take_token("k", capacity=2, per_seconds=60, cost=1) == 0
    assert facade.take_token("k", capacity=2, per_seconds=60, cost=1) == -1


def test_buckets_are_isolated():
    facade = RedisFacade("memory://")
    facade.take_token("a", 1, 60, 1)
    assert facade.take_token("a", 1, 60, 1) == -1
    assert facade.take_token("b", 1, 60, 1) == 0
