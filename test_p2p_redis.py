# test_p2p_redis.py
# Regression tests for the P2P ban/integrity fixes and the optional Redis layer.
# Run with: python test_p2p_redis.py

import os
import sys
import json
import time
import tempfile
import unittest

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pymodules.__atlas_fixed_vars import PORT
from pymodules.__atlas_p2pv2_utils import FailedPeerManager, FailureType, FailedPeer

DAY = 24 * 3600
LEGACY_REASON = "Suspicious timeout - potential intrusion attempt"


def _failed_entry(address, port, failure_type, reason, ban_until, last_failure=None):
    now = time.time()
    last = now if last_failure is None else last_failure
    return {
        "address": address,
        "port": port,
        "first_failure": last,
        "last_failure": last,
        "failure_count": 1,
        "failure_type": failure_type,
        "failure_reason": reason,
        "ban_until": ban_until,
    }


class BanMigrationTests(unittest.TestCase):
    """Legacy 'DHT timeout == malicious' bans must not survive as 30-day bans."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        now = time.time()
        # Real shape: banned days ago by the old rule, ban stretching into the future.
        old_failure = now - 5 * DAY
        payload = {
            "last_updated": now,
            "format_version": "1.0",
            "failed_peers": {
                "1.2.3.4:42424": _failed_entry("1.2.3.4", 42424, "malicious", LEGACY_REASON, old_failure + 30 * DAY, old_failure),
                "5.6.7.8:18837": _failed_entry("5.6.7.8", 18837, "malicious", LEGACY_REASON, old_failure + 30 * DAY, old_failure),
                "9.9.9.9:6424": _failed_entry("9.9.9.9", 6424, "malicious", "Malicious agent", now + 30 * DAY),
            },
        }
        with open(os.path.join(self.tmp_dir, "failed_peers.json"), "w") as f:
            json.dump(payload, f)

        self.manager = FailedPeerManager(self.tmp_dir)

    def test_legacy_timeout_bans_are_downgraded(self):
        for key in ("1.2.3.4:42424", "5.6.7.8:18837"):
            peer = self.manager.failed_peers[key]
            self.assertEqual(peer.failure_type, FailureType.NETWORK, key)
            # Either already expired (ban_until cleared) or on a short cooldown.
            self.assertTrue(peer.ban_until is None or peer.ban_until <= time.time() + 3600, key)

    def test_legacy_bans_can_be_retried(self):
        self.assertFalse(self.manager.is_peer_banned("1.2.3.4", 42424))

    def test_real_malicious_peer_stays_banned(self):
        peer = self.manager.failed_peers["9.9.9.9:6424"]
        self.assertEqual(peer.failure_type, FailureType.MALICIOUS)
        self.assertTrue(self.manager.is_peer_banned("9.9.9.9", 6424))


class FailureClassificationTests(unittest.TestCase):
    """Timeout wording must not be escalated to a malicious ban."""

    @classmethod
    def setUpClass(cls):
        from pymodules.__atlas_p2pv2_routes import AtlasP2PRoutes

        cls.routes_class = AtlasP2PRoutes

    def test_timeout_is_network_not_malicious(self):
        for reason in (LEGACY_REASON, "Handshake timeout", "timeout connecting"):
            self.assertEqual(self.routes_class._classify_failure_type(reason), FailureType.NETWORK, reason)

    def test_real_security_reasons_stay_malicious(self):
        for reason in ("Malicious agent", "Integrity verification failed", "replay attack detected"):
            self.assertEqual(self.routes_class._classify_failure_type(reason), FailureType.MALICIOUS, reason)

    def test_peer_port_parsing(self):
        parse = self.routes_class._parse_peer_port
        self.assertEqual(parse("42424"), 42424)
        self.assertEqual(parse(None), PORT)
        self.assertEqual(parse("not-a-port"), PORT)
        self.assertEqual(parse(70000), PORT)
        self.assertEqual(parse(0), PORT)


class IntegrityFingerprintTests(unittest.TestCase):
    """The handshake fingerprint must not depend on local file contents."""

    def setUp(self):
        from pymodules.__atlas_p2pv2_routes import AtlasP2PRoutes

        self.routes_class = AtlasP2PRoutes
        self.tmp_dir = tempfile.mkdtemp()
        self._saved_override = os.environ.pop("ATLAS_INTEGRITY_HASH", None)

    def tearDown(self):
        os.environ.pop("ATLAS_INTEGRITY_HASH", None)
        os.environ.pop("ATLAS_STRICT_INTEGRITY", None)
        if self._saved_override is not None:
            os.environ["ATLAS_INTEGRITY_HASH"] = self._saved_override

    def test_fingerprint_is_stable_across_instances(self):
        first = self.routes_class(self.tmp_dir).integrity_hash
        second = self.routes_class(self.tmp_dir).integrity_hash
        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)

    def test_override_pins_a_private_network(self):
        os.environ["ATLAS_INTEGRITY_HASH"] = "pinned-network"
        self.assertEqual(self.routes_class(self.tmp_dir).integrity_hash, "pinned-network")

    def test_permissive_mode_federates_with_upstream(self):
        routes = self.routes_class(self.tmp_dir)
        payload = {
            "type": "atlas_handshake_hello",
            "sender_id": "a" * 64,
            "magic": "ATLAS_P2P_V2",
            "protocol_version": "2.0",
            "integrity_hash": "stock-atlas-file-hash",
        }
        self.assertTrue(routes._validate_handshake_request(payload)["valid"])

    def test_strict_mode_rejects_foreign_hash(self):
        routes = self.routes_class(self.tmp_dir)
        os.environ["ATLAS_STRICT_INTEGRITY"] = "1"
        payload = {
            "type": "atlas_handshake_hello",
            "sender_id": "a" * 64,
            "magic": "ATLAS_P2P_V2",
            "protocol_version": "2.0",
            "integrity_hash": "stock-atlas-file-hash",
        }
        self.assertEqual(routes._validate_handshake_request(payload)["reason"], "integrity_mismatch")


class BanEdgeCaseTests(unittest.TestCase):
    def test_unbanned_peer_is_not_banned(self):
        peer = FailedPeer(
            address="1.1.1.1",
            port=6424,
            first_failure=time.time(),
            last_failure=time.time(),
            failure_count=1,
            failure_type=FailureType.TEMPORARY,
            failure_reason="temporary",
        )
        peer.ban_until = None  # cleanup_expired_bans() clears it this way
        self.assertFalse(peer.is_banned())
        self.assertEqual(peer.time_until_unban(), 0.0)


class RedisOptionalTests(unittest.TestCase):
    """Redis stays a pure accelerator: missing server must never raise."""

    def test_missing_redis_degrades_silently(self):
        from pymodules.__atlas_redis_cache import redis_cache

        if redis_cache.is_available():
            self.skipTest("a real Redis server is reachable")

        self.assertIsNone(redis_cache.get("atlas:test"))
        self.assertFalse(redis_cache.set("atlas:test", {"a": 1}, 10))
        self.assertEqual(redis_cache.delete_by_tag("atlas"), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
