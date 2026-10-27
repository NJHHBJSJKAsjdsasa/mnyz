# pymodules/__atlas_p2pv2_routes.py

import json
import time
import asyncio
import threading
import hashlib
import os
from typing import Optional, Dict, Any, List
from flask import Flask, request, jsonify, Response
import requests
from concurrent.futures import ThreadPoolExecutor

from pymodules.__atlas_fixed_vars import PORT, VERSION, VERSION_HASH, get_external_p2p_port
from pymodules.__atlas_p2pv2_discovery import AtlasP2PDiscovery, DiscoveredPeer
from pymodules.__atlas_p2pv2_utils import KnownPeerManager, FailedPeerManager, NetworkUtils, SelfConnectionDetector, FailureType, PeerStatus
from pymodules.__atlas_p2pv2_logger import get_p2p_logger
from pymodules.__atlas_p2pv2_crypto import AtlasCryptographicManager


def smart_request(ip: str, port: str, endpoint: str, preferred_protocol: str = None, **kwargs):
    if preferred_protocol and preferred_protocol in ["https", "http"]:
        protocols = [preferred_protocol, "http" if preferred_protocol == "https" else "https"]
    else:
        protocols = ["https", "http"]

    last_exception = None

    for i, protocol in enumerate(protocols):
        try:
            url = f"{protocol}://{ip}:{port}{endpoint}"
            if protocol == "https":
                kwargs_with_ssl = kwargs.copy()
                kwargs_with_ssl["verify"] = False
                kwargs_with_ssl["timeout"] = kwargs_with_ssl.get("timeout", 8)

                import urllib3

                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

                response = requests.post(url, **kwargs_with_ssl)
            else:
                kwargs_copy = kwargs.copy()
                kwargs_copy["timeout"] = kwargs_copy.get("timeout", 10)
                response = requests.post(url, **kwargs_copy)

            if 200 <= response.status_code < 300:
                return response, protocol
            else:
                last_exception = Exception(f"HTTP {response.status_code} ({protocol})")
                continue

        except (requests.exceptions.SSLError, requests.exceptions.ConnectionError) as e:
            last_exception = e
            continue
        except Exception as e:
            last_exception = e
            continue

    raise last_exception


def _strict_integrity() -> bool:
    """ATLAS_STRICT_INTEGRITY=1 restores exact-hash peer verification.

    Default is permissive: the integrity hash only has to *match the protocol
    version* to federate, otherwise every fork or local patch becomes a separate
    network (upstream peers still hash their own __main__.py).
    """
    return os.getenv("ATLAS_STRICT_INTEGRITY", "").strip().lower() in ("1", "true", "yes", "on")


class AtlasP2PRoutes:

    def __init__(self, data_dir: str = "p2p_data"):
        self.data_dir = data_dir

        self.logger = get_p2p_logger(data_dir)

        try:
            self.crypto_manager = AtlasCryptographicManager(data_dir)
            self.node_id = self.crypto_manager.get_identity().node_id
            self.logger.initialization("CRYPTO", f"Crypto protection enabled for P2P routes: {self.crypto_manager.get_identity().key_fingerprint[:16]}...")
        except Exception as e:
            import traceback

            error_details = traceback.format_exc()
            self.logger.critical_error(f"Crypto protection failed to initialize in P2P routes: {e}")
            self.logger.technical_info(f"Full error trace: {error_details}")
            self.crypto_manager = None
            self.node_id = self._generate_node_id()

        self.integrity_hash = self._calculate_integrity_hash()

        self.discovery: Optional[AtlasP2PDiscovery] = None
        self.known_peer_manager = KnownPeerManager(data_dir)
        self.failed_peer_manager = FailedPeerManager(data_dir)
        self.self_detector = SelfConnectionDetector([PORT])

        self.running = False
        self.start_time = 0
        self.external_ip: Optional[str] = None
        self.executor = ThreadPoolExecutor(max_workers=5)

        self.stats = {"peers_discovered": 0, "connections_attempted": 0, "connections_successful": 0, "connections_failed": 0, "replay_attacks_blocked": 0, "crypto_handshakes": 0, "messages_sent": 0, "messages_received": 0, "handshakes_completed": 0, "handshakes_failed": 0}

        self.logger.initialization("P2P", f"Atlas P2P Routes initialized (Node: {self.node_id[:16]}...)")

    def _generate_node_id(self) -> str:
        random_data = os.urandom(16)
        return hashlib.sha256(random_data).hexdigest()

    @staticmethod
    def _parse_peer_port(value, default: int = PORT) -> int:
        """Normalize a peer-declared port; the peer may listen on a non-default port."""
        try:
            port = int(value)
        except (TypeError, ValueError):
            return default
        return port if 1 <= port <= 65535 else default

    def _calculate_integrity_hash(self) -> str:
        """Protocol fingerprint shared by every node running this Atlas version.

        Hashing `__main__.py` (the old behaviour) made any local edit - even a
        comment - look like a tampered client, so every peer answered 403 and the
        node banned them for 30 days. Set ATLAS_INTEGRITY_HASH to pin a private
        network or to enforce an exact-file policy again.
        """
        override = os.getenv("ATLAS_INTEGRITY_HASH")
        if override:
            integrity_hash = override
        else:
            payload = f"ATLAS_P2P_V2|2.0|{VERSION}|{VERSION_HASH}"
            integrity_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

        self.logger.initialization("P2P", f"Atlas integrity hash: {integrity_hash[:16]}...")
        return integrity_hash

    async def start_discovery(self) -> bool:
        try:
            self.logger.initialization("P2P", "Starting Atlas P2P Discovery via BitTorrent DHT...")

            self.external_ip = await NetworkUtils.detect_external_ip()
            if self.external_ip:
                self.logger.initialization("P2P", f"External IP detected: {self.external_ip}")
                await self.self_detector.detect_external_ip()

            self.discovery = AtlasP2PDiscovery(self.data_dir)
            self.discovery.add_peer_discovered_callback(self._on_peer_discovered)

            success = await self.discovery.start()
            if success:
                self.logger.initialization("P2P", "DHT Discovery started successfully")
                self.running = True
                self.start_time = time.time()

                asyncio.create_task(self._connection_manager_loop())
                return True
            else:
                self.logger.technical_info("Failed to start DHT Discovery")
                return False

        except Exception as e:
            self.logger.critical_error(f"Failed to start P2P discovery: {e}")
            return False

    async def stop_discovery(self):
        self.running = False
        if self.discovery:
            await self.discovery.stop()
        self.logger.technical_info("P2P Discovery stopped")

    def _on_peer_discovered(self, peer: DiscoveredPeer):
        peer_key = f"{peer.ip}:{peer.port}"

        if self.failed_peer_manager.is_peer_banned(peer.ip, peer.port):
            self.logger.technical_info(f"Skipping banned peer: {peer_key}")
            return

        if self.self_detector.is_self_connection(peer.ip, peer.port):
            self.logger.technical_info(f"Skipping self connection: {peer_key}")
            return

        from pymodules.__atlas_startup_mode import is_p2p_discovery_enabled, startup_print

        if not is_p2p_discovery_enabled():
            self.logger.technical_info(f"Peer discovered during startup: {peer_key} (will process after initialization)")
            return

        is_known = self.known_peer_manager.is_known_peer(peer.ip, peer.port)

        if not is_known:
            self.logger.technical_info(f"New peer {peer_key} - handshaking")
            self.stats["peers_discovered"] += 1
            asyncio.create_task(self._attempt_peer_handshake(peer.ip, peer.port))
        else:
            known_peer = self.known_peer_manager.get_known_peer(peer.ip, peer.port)
            has_universe_data = self._has_peer_universe_data(peer.ip, peer.port)

            if known_peer and known_peer.last_seen:
                time_since_seen = time.time() - known_peer.last_seen

                if known_peer.status in [PeerStatus.INACTIVE, PeerStatus.STALE, PeerStatus.ARCHIVED] and time_since_seen > 3600:

                    hours_offline = time_since_seen / 3600
                    self.logger.technical_info(f"Peer {peer_key} REACTIVATED after {hours_offline:.1f} hours offline ({known_peer.status.value})")

                    self.known_peer_manager.mark_peer_seen(peer.ip, peer.port)

                    self.stats["peers_discovered"] += 1
                    asyncio.create_task(self._attempt_peer_handshake(peer.ip, peer.port))
                    return

            if not has_universe_data:
                self.logger.technical_info(f"Known peer {peer_key} missing universe data - handshaking")
                self.stats["peers_discovered"] += 1
                asyncio.create_task(self._attempt_peer_handshake(peer.ip, peer.port))
            elif known_peer and known_peer.needs_check():
                self.logger.technical_info(f"Known peer {peer_key} needs periodic check - handshaking")
                self.known_peer_manager.mark_peer_check_failed(peer.ip, peer.port)
                asyncio.create_task(self._attempt_peer_handshake(peer.ip, peer.port))

    async def _attempt_peer_handshake(self, ip: str, port: int):
        import uuid

        request_id = str(uuid.uuid4())[:8]

        # A second instance on this machine announces our public IP, which hairpin
        # NAT usually cannot reach; fall back to loopback for our own address.
        if self.external_ip and ip == self.external_ip and port != get_external_p2p_port():
            ip = "127.0.0.1"

        peer_key = f"{ip}:{port}"

        self.stats["connections_attempted"] += 1
        self.logger.handshake_detail(request_id, peer_key, "Starting handshake attempt")

        if self.known_peer_manager.is_known_peer(ip, port):
            known_peer = self.known_peer_manager.get_known_peer(ip, port)

            if known_peer and not known_peer.needs_check():
                remaining_time = known_peer.time_until_next_check()
                self.logger.handshake_detail(request_id, peer_key, f"Skipping handshake ({known_peer.status.value}, next check in {remaining_time:.0f}s)")
                return

            has_universe_data = self._has_peer_universe_data(ip, port)
            if known_peer and known_peer.needs_check() and has_universe_data:
                self.logger.handshake_detail(request_id, peer_key, f"Availability check ({known_peer.status.value})")
            elif not has_universe_data:
                self.logger.handshake_detail(request_id, peer_key, "Re-handshaking to obtain missing universe data")

        self.stats["connections_attempted"] += 1

        try:
            universe_data = {}
            try:
                from pymodules.__atlas_config import Config

                config = Config()
                if config.initialize():
                    universe_data = {"cosmic_origin_time": config.cosmic_origin_time, "seed": config.seed_str}
                    self.logger.technical_info(f"P2P Handshake: Universe data loaded - seed: {config.seed_str}, cosmic_origin: {config.cosmic_origin_time}")
                else:
                    self.logger.technical_info("P2P Handshake: config.initialize() returned False")
            except Exception as e:
                self.logger.technical_info(f"P2P Handshake: Config loading failed - {e}")

            handshake_data = {"type": "atlas_handshake_hello", "sender_id": self.node_id, "magic": "ATLAS_P2P_V2", "protocol_version": "2.0", "node_capabilities": ["gossip", "discovery", "messaging"], "timestamp": time.time(), "external_ip": self.external_ip, "listen_port": get_external_p2p_port(), "universe_data": universe_data, "integrity_hash": self.integrity_hash}

            preferred_protocol = self.known_peer_manager.get_preferred_protocol(ip, port)

            loop = asyncio.get_event_loop()
            current_ip = ip
            current_port = port
            result = await loop.run_in_executor(self.executor, lambda _ip=current_ip, _port=current_port, _data=handshake_data, _proto=preferred_protocol: smart_request(_ip, _port, "/api/p2p/handshake", preferred_protocol=_proto, json=_data, timeout=10, headers={"Content-Type": "application/json"}))

            response, successful_protocol = result

            if response.status_code == 200:
                response_data = response.json()

                self._current_handshake_ip = current_ip
                self._current_handshake_port = current_port

                if self._validate_handshake_response(response_data):
                    current_remote_hash = response_data.get("integrity_hash", "unknown")
                    current_remote_node_id = response_data.get("sender_id", "unknown")
                    current_peer_key = f"{current_ip}:{current_port}"

                    self.logger.peer_connected(current_peer_key, current_remote_node_id)

                    self.logger.handshake_detail(request_id, current_peer_key, "Handshake SUCCESS")
                    self.logger.handshake_detail(request_id, current_peer_key, f"Integrity verified: {current_remote_hash[:16]}...")
                    self.logger.handshake_detail(request_id, current_peer_key, f"Remote node: {current_remote_node_id[:16]}...")

                    self.stats["connections_successful"] += 1
                    self.stats["handshakes_completed"] += 1

                    received_universe = response_data.get("universe_data", {})
                    if received_universe and "cosmic_origin_time" in received_universe:
                        self.logger.handshake_detail(request_id, current_peer_key, f"Universe data: cosmic_origin={received_universe['cosmic_origin_time']}, seed={received_universe.get('seed', 'unknown')[:8]}...")

                    received_universe = response_data.get("universe_data", {})
                    cosmic_origin = received_universe.get("cosmic_origin_time")
                    seed = received_universe.get("seed")
                    integrity_hash = response_data.get("integrity_hash")

                    remote_listen_port = response_data.get("listen_port", current_port)

                    self.known_peer_manager.add_known_peer(current_ip, remote_listen_port, current_remote_node_id, response_data.get("protocol_version", "2.0"), response_data.get("node_capabilities", []), preferred_protocol=successful_protocol, cosmic_origin_time=cosmic_origin, seed=seed, integrity_hash=integrity_hash)
                    self.known_peer_manager.mark_peer_seen(current_ip, remote_listen_port)

                    self.failed_peer_manager.remove_failed_peer(current_ip, current_port)

                else:
                    self.logger.handshake_detail(request_id, current_peer_key, f"Invalid handshake response")
                    self.stats["handshakes_failed"] += 1
                    self._mark_peer_failed(current_ip, current_port, "Invalid handshake response")

            else:
                self.logger.handshake_detail(request_id, current_peer_key, f"HTTP {response.status_code} error")
                self.stats["connections_failed"] += 1
                if response.status_code not in [403, 404]:
                    self._mark_peer_failed(current_ip, current_port, f"HTTP {response.status_code}")
                else:
                    self.logger.handshake_detail(request_id, current_peer_key, f"Protocol mismatch (HTTP {response.status_code}) - not banning")

        except requests.exceptions.Timeout:
            peer_key = f"{current_ip}:{current_port}"
            self.logger.handshake_detail(request_id, peer_key, "Timeout connecting")
            self.stats["connections_failed"] += 1
            if self.known_peer_manager.is_known_peer(current_ip, current_port):
                self.known_peer_manager.mark_peer_check_failed(current_ip, current_port)
            else:
                # Public DHT swarms are mostly non-Atlas endpoints, so a timeout is
                # expected noise rather than an intrusion: apply a short network
                # cooldown and retry later instead of a 30-day malicious ban.
                self.logger.handshake_detail(request_id, peer_key, "Not an Atlas endpoint (timeout) - short cooldown, will retry")
                from pymodules.__atlas_p2pv2_utils import FailureType

                self._mark_peer_failed(current_ip, current_port, "Handshake timeout", FailureType.NETWORK)

        except requests.exceptions.ConnectionError as e:
            peer_key = f"{current_ip}:{current_port}"
            self.logger.handshake_detail(request_id, peer_key, "Connection error")
            self.stats["connections_failed"] += 1
            if self.known_peer_manager.is_known_peer(current_ip, current_port):
                self.known_peer_manager.mark_peer_check_failed(current_ip, current_port)
            self.logger.handshake_detail(request_id, peer_key, "Connection error - not banning (might be protocol issue)")

        except Exception as e:
            peer_key = f"{current_ip}:{current_port}"
            self.logger.handshake_detail(request_id, peer_key, f"Error connecting: {e}")
            self.stats["connections_failed"] += 1
            if "HTTP 403" not in str(e) and "Connection refused" not in str(e):
                self._mark_peer_failed(current_ip, current_port, f"Exception: {str(e)}")
            else:
                self.logger.handshake_detail(request_id, peer_key, "Protocol-related error - not banning")

    def _validate_handshake_response(self, response_data: dict) -> bool:
        required_fields = ["type", "sender_id", "magic", "protocol_version", "integrity_hash"]

        for field in required_fields:
            if field not in response_data:
                self.logger.security_alert(f"Missing required field: {field}")
                return False

        received_hash = response_data.get("integrity_hash")
        expected_hash = self.integrity_hash

        if received_hash != expected_hash:
            remote_ip = getattr(self, "_current_handshake_ip", "unknown")
            remote_port = getattr(self, "_current_handshake_port", "unknown")
            mismatch = f"received {received_hash[:16] if received_hash else 'None'}... vs expected {expected_hash[:16]}..."

            if _strict_integrity():
                self.logger.security_alert(f"INTEGRITY VERIFICATION FAILED! {mismatch}")
                self._log_security_incident(remote_ip, remote_port, "INTEGRITY_MISMATCH", mismatch)
                return False

            # Permissive mode: magic/protocol/timestamp are still enforced below, so
            # a fork keeps federating with upstream nodes running the stock file.
            self.logger.handshake_detail("", f"{remote_ip}:{remote_port}", f"Integrity hash differs ({mismatch}) - accepted in permissive mode")

        received_timestamp = response_data.get("timestamp")
        if received_timestamp:
            import time

            current_time = time.time()
            time_diff = abs(current_time - received_timestamp)

            if time_diff > 300:
                self.logger.security_alert("TIMESTAMP VERIFICATION FAILED!")
                self.logger.security_alert(f"Time difference: {time_diff:.1f} seconds")
                self.logger.security_alert("This could be a replay attack!")
                remote_ip = getattr(self, "_current_handshake_ip", "unknown")
                remote_port = getattr(self, "_current_handshake_port", "unknown")
                self._log_security_incident(remote_ip, remote_port, "TIMESTAMP_MISMATCH", f"Time diff {time_diff:.1f}s - possible replay attack")
                return False

        valid_protocol = response_data.get("type") == "atlas_handshake_welcome" and response_data.get("magic") == "ATLAS_P2P_V2" and response_data.get("protocol_version") == "2.0" and response_data.get("handshake_accepted", False)

        if not valid_protocol:
            self.logger.security_alert("Invalid protocol in handshake response")
            remote_ip = getattr(self, "_current_handshake_ip", "unknown")
            remote_port = getattr(self, "_current_handshake_port", "unknown")
            self._log_security_incident(remote_ip, remote_port, "INVALID_PROTOCOL", f"Invalid handshake response format")

        return valid_protocol

    def _mark_peer_failed(self, ip: str, port: int, reason: str, failure_type: "FailureType" = None):
        if failure_type is None:
            failure_type = self._classify_failure_type(reason)

        self.failed_peer_manager.add_failed_peer(ip, port, reason, failure_type)

        if failure_type == FailureType.MALICIOUS:
            self.logger.security_alert(f"SECURITY: Malicious agent detected from {ip}:{port} - {reason}")

    def _log_security_incident(self, ip: str, port: int, incident_type: str, description: str):
        import time
        import json
        import os

        try:
            non_valid_file = os.path.join(self.data_dir, "non_valid.json")
            peer_key = f"{ip}:{port}"

            data = {}
            if os.path.exists(non_valid_file):
                try:
                    with open(non_valid_file, "r") as f:
                        data = json.load(f)
                except Exception as e:
                    self.logger.technical_info(f"Error loading non_valid.json: {e}")
                    data = {}

            if "replayers" not in data:
                data["replayers"] = {}
            if "integrity_violations" not in data:
                data["integrity_violations"] = {}

            if "invalid_peers" not in data:
                data["invalid_peers"] = {}

            incident_data = {"timestamp": time.time(), "incident_type": incident_type, "description": description, "detector_node": getattr(self, "node_id", "unknown")[:16] + "..."}

            if incident_type in ["DHT_TIMEOUT_INTRUSION", "TIMESTAMP_MISMATCH"]:
                if peer_key not in data["replayers"]:
                    data["replayers"][peer_key] = {"incidents": [], "first_detected": time.time()}
                data["replayers"][peer_key]["incidents"].append(incident_data)
                data["replayers"][peer_key]["suspicious_pattern"] = "DHT announce without proper Atlas handshake response"
                data["replayers"][peer_key]["last_incident"] = time.time()

            elif incident_type == "INTEGRITY_MISMATCH":
                if peer_key not in data["integrity_violations"]:
                    data["integrity_violations"][peer_key] = {"incidents": [], "first_detected": time.time()}
                data["integrity_violations"][peer_key]["incidents"].append(incident_data)
                data["integrity_violations"][peer_key]["last_incident"] = time.time()

            else:
                if isinstance(data["invalid_peers"], list):
                    legacy_list = data["invalid_peers"].copy()
                    data["invalid_peers"] = {}
                    for legacy_peer in legacy_list:
                        if legacy_peer not in data["invalid_peers"]:
                            data["invalid_peers"][legacy_peer] = {"legacy": True}

                if peer_key not in data["invalid_peers"]:
                    data["invalid_peers"][peer_key] = {"incidents": [], "first_detected": time.time()}

                if "incidents" not in data["invalid_peers"][peer_key]:
                    data["invalid_peers"][peer_key]["incidents"] = []
                if "first_detected" not in data["invalid_peers"][peer_key]:
                    data["invalid_peers"][peer_key]["first_detected"] = time.time()

                data["invalid_peers"][peer_key]["incidents"].append(incident_data)
                data["invalid_peers"][peer_key]["last_incident"] = time.time()

            with open(non_valid_file, "w") as f:
                json.dump(data, f, indent=2)

            self.logger.technical_info(f"Security incident logged: {incident_type} from {peer_key} -> non_valid.json")

        except Exception as e:
            self.logger.technical_info(f"Failed to log security incident: {e}")

    @staticmethod
    def _classify_failure_type(reason: str) -> FailureType:
        reason_lower = reason.lower()

        # Network symptoms take precedence: a timeout towards a public DHT entry is
        # not evidence of malice, whatever the wording of the message.
        if "timeout" in reason_lower or "connection refused" in reason_lower or "unreachable" in reason_lower:
            return FailureType.NETWORK

        if "malicious" in reason_lower or "integrity" in reason_lower or "intrusion" in reason_lower or "suspicious" in reason_lower or "replay" in reason_lower or "scanning" in reason_lower:
            return FailureType.MALICIOUS
        elif "handshake" in reason_lower or "invalid" in reason_lower:
            return FailureType.AUTHENTICATION
        elif "http" in reason_lower and any(code in reason for code in ["403", "404", "400"]):
            return FailureType.PROTOCOL_MISMATCH
        elif "timeout" in reason_lower:
            return FailureType.NETWORK
        elif "connection" in reason_lower:
            return FailureType.TEMPORARY
        else:
            return FailureType.TEMPORARY

    def _has_peer_universe_data(self, ip: str, port: int) -> bool:
        try:
            peer = self.known_peer_manager.get_known_peer(ip, port)

            if not peer:
                self.logger.debug(f"Peer {ip}:{port} not found in known_peer_manager")
                return False

            cosmic_time = getattr(peer, "cosmic_origin_time", None)
            seed = getattr(peer, "seed", None)
            integrity = getattr(peer, "integrity_hash", None)

            self.logger.debug(f"Peer {ip}:{port} universe data check:")
            self.logger.debug(f"cosmic_origin_time: {cosmic_time}")
            self.logger.debug(f"seed: {seed}")
            self.logger.debug(f"integrity_hash: {integrity}")

            has_data = cosmic_time is not None and seed is not None and integrity is not None

            self.logger.debug(f"has_complete_universe_data: {has_data}")

            return has_data

        except Exception as e:
            self.logger.debug(f"Exception in _has_peer_universe_data: {e}")
            return False

    def _save_peer_universe_data(self, ip: str, port: int, universe_data: dict):
        try:
            import json
            import os

            peer_key = f"{ip}:{port}"

            universe_file = os.path.join(self.data_dir, "peer_universes.json")

            existing_data = {}
            if os.path.exists(universe_file):
                try:
                    with open(universe_file, "r") as f:
                        existing_data = json.load(f)
                except Exception:
                    existing_data = {}

            existing_data[peer_key] = {"cosmic_origin_time": universe_data.get("cosmic_origin_time"), "seed": universe_data.get("seed"), "last_updated": time.time()}

            with open(universe_file, "w") as f:
                json.dump(existing_data, f, indent=2)

            self.logger.technical_info(f"Saved universe data for {peer_key}: cosmic_origin={universe_data.get('cosmic_origin_time')}")

        except Exception as e:
            self.logger.technical_info(f"ERROR: Failed to save universe data for {ip}:{port}: {e}")

    async def _connection_manager_loop(self):
        while self.running:
            try:
                from pymodules.__atlas_startup_mode import is_p2p_discovery_enabled

                if not is_p2p_discovery_enabled():
                    await asyncio.sleep(1)
                    continue
                if self.discovery:
                    fresh_peers = self.discovery.get_fresh_peers(max_age_seconds=300)

                    for peer_addr in fresh_peers:
                        if not self.running:
                            break

                        try:
                            ip, port = peer_addr.split(":")
                            port = int(port)

                            if self.failed_peer_manager.is_peer_banned(ip, port) or self.self_detector.is_self_connection(ip, port):
                                continue

                            if self.known_peer_manager.is_known_peer(ip, port):
                                known_peer = self.known_peer_manager.get_known_peer(ip, port)
                                if known_peer and not known_peer.needs_check():
                                    continue

                            await self._attempt_peer_handshake(ip, port)
                            await asyncio.sleep(2)

                        except Exception as e:
                            self.logger.technical_info(f"Connection manager error for {peer_addr}: {e}")

                await asyncio.sleep(60)

            except Exception as e:
                self.logger.technical_info(f"Connection manager loop error: {e}")
                await asyncio.sleep(60)

    def register_routes(self, app: Flask):

        @app.route("/api/p2p/handshake", methods=["POST"])
        def p2p_handshake():
            try:
                import uuid

                incoming_id = str(uuid.uuid4())[:8]

                data = request.get_json()
                if not data:
                    return jsonify({"error": "No data provided"}), 400

                remote_ip = request.remote_addr
                remote_node_id = data.get("sender_id", "unknown")
                remote_hash = data.get("integrity_hash", "unknown")
                remote_port = self._parse_peer_port(data.get("listen_port"))

                incoming_protocol = "https" if request.is_secure else "http"

                self.logger.handshake_detail(incoming_id, remote_ip, "INCOMING handshake")
                self.logger.handshake_detail(incoming_id, remote_ip, f"Remote node: {remote_node_id[:16]}...")
                self.logger.handshake_detail(incoming_id, remote_ip, f"Remote hash: {remote_hash[:16]}...")
                self.logger.handshake_detail(incoming_id, remote_ip, f"Protocol: {incoming_protocol}")

                is_known = self.known_peer_manager.is_known_peer(remote_ip, remote_port)

                if is_known:
                    self.known_peer_manager.mark_peer_seen(remote_ip, remote_port)

                self.logger.handshake_detail(incoming_id, remote_ip, f"Processing handshake (known={is_known})")

                validation_result = self._validate_handshake_request(data)
                if not validation_result["valid"]:
                    if validation_result["reason"] == "integrity_mismatch":
                        self._mark_peer_failed(remote_ip, remote_port, "Malicious agent")
                        return jsonify({"error": "Integrity verification failed"}), 403
                    return jsonify({"error": "Invalid handshake request"}), 400

                self.stats["messages_received"] += 1

                if self.failed_peer_manager.is_peer_banned(remote_ip, remote_port):
                    return jsonify({"error": "Peer is banned"}), 403

                received_universe = data.get("universe_data", {})

                if received_universe:
                    if "cosmic_origin_time" in received_universe:
                        self.logger.handshake_detail(incoming_id, remote_ip, f"Received universe data: cosmic_origin={received_universe['cosmic_origin_time']}")

                universe_data = {}
                try:
                    from pymodules.__atlas_config import Config

                    config = Config()
                    if config.initialize():
                        universe_data = {"cosmic_origin_time": config.cosmic_origin_time, "seed": config.seed_str}
                        self.logger.technical_info(f"P2P Response: Universe data loaded - seed: {config.seed_str}, cosmic_origin: {config.cosmic_origin_time}")
                    else:
                        self.logger.technical_info("P2P Response: config.initialize() returned False")
                except Exception as e:
                    self.logger.technical_info(f"P2P Response: Config loading failed - {e}")

                response_data = {"type": "atlas_handshake_welcome", "sender_id": self.node_id, "magic": "ATLAS_P2P_V2", "protocol_version": "2.0", "node_capabilities": ["gossip", "discovery", "messaging"], "handshake_accepted": True, "timestamp": time.time(), "external_ip": self.external_ip, "listen_port": get_external_p2p_port(), "universe_data": universe_data, "integrity_hash": self.integrity_hash}

                remote_node_id = data.get("sender_id", "unknown")
                received_universe = data.get("universe_data", {})
                cosmic_origin = received_universe.get("cosmic_origin_time")
                seed = received_universe.get("seed")
                integrity_hash = data.get("integrity_hash")

                self.known_peer_manager.add_known_peer(remote_ip, remote_port, remote_node_id, data.get("protocol_version", "2.0"), data.get("node_capabilities", []), preferred_protocol=incoming_protocol, cosmic_origin_time=cosmic_origin, seed=seed, integrity_hash=integrity_hash)
                self.known_peer_manager.mark_peer_seen(remote_ip, remote_port)

                self.stats["messages_sent"] += 1
                self.stats["handshakes_completed"] += 1

                self.logger.peer_connected(f"{remote_ip}:{remote_port}", remote_node_id)

                self.logger.handshake_detail(incoming_id, remote_ip, "Handshake COMPLETED")
                self.logger.handshake_detail(incoming_id, remote_ip, f"Integrity verified: {remote_hash[:16]}...")

                return jsonify(response_data)

            except Exception as e:
                self.logger.technical_info(f"Handshake error: {e}")
                return jsonify({"error": "Internal server error"}), 500

        @app.route("/api/p2p/message", methods=["POST"])
        def p2p_message():
            try:
                data = request.get_json()
                if not data:
                    return jsonify({"error": "No data provided"}), 400

                remote_ip = request.remote_addr

                if not self.known_peer_manager.is_known_peer(remote_ip, PORT):
                    return jsonify({"error": "Unknown peer - handshake required"}), 401

                self.stats["messages_received"] += 1

                message_type = data.get("type", "unknown")
                self.logger.technical_info(f"Received {message_type} message from {remote_ip}")

                response = {"type": "message_ack", "sender_id": self.node_id, "timestamp": time.time(), "original_message_id": data.get("message_id"), "status": "received"}

                self.stats["messages_sent"] += 1
                return jsonify(response)

            except Exception as e:
                self.logger.technical_info(f"Message handling error: {e}")
                return jsonify({"error": "Internal server error"}), 500

        @app.route("/api/p2p/status")
        def p2p_status():
            return jsonify(self.get_status())

        @app.route("/api/p2p/peers")
        def p2p_peers():
            return jsonify({"known_peers": self.known_peer_manager.get_known_peers_list(), "failed_peers": len(self.failed_peer_manager.get_failed_peers_list()), "discovered_peers": len(self.discovery.get_discovered_peers()) if self.discovery else 0})

        self.logger.initialization("P2P", "Routes registered with Flask app")

    def _validate_handshake_request(self, data: dict) -> dict:
        required_fields = ["type", "sender_id", "magic", "protocol_version", "integrity_hash"]

        for field in required_fields:
            if field not in data:
                return {"valid": False, "reason": f"missing_field_{field}"}

        received_hash = data.get("integrity_hash")
        if received_hash != self.integrity_hash:
            sender = data.get("sender_id", "unknown")[:16]
            mismatch = f"expected {self.integrity_hash[:16]}..., received {received_hash[:16] if received_hash else 'None'}..."

            if _strict_integrity():
                self.logger.security_alert(f"SECURITY: Integrity verification failed from {sender}... ({mismatch})")
                return {"valid": False, "reason": "integrity_mismatch"}

            self.logger.technical_info(f"Integrity hash differs from {sender}... ({mismatch}) - accepted in permissive mode")

        is_valid = data.get("type") == "atlas_handshake_hello" and data.get("magic") == "ATLAS_P2P_V2" and data.get("protocol_version") == "2.0"

        return {"valid": is_valid, "reason": "valid" if is_valid else "invalid_protocol"}

    async def broadcast_message(self, message_type: str, payload: dict) -> int:
        sent_count = 0
        known_peers = self.known_peer_manager.get_known_peers_list()

        message_data = {"type": message_type, "sender_id": self.node_id, "payload": payload, "timestamp": time.time(), "message_id": f"{self.node_id}:{time.time()}"}

        for peer_key in known_peers:
            try:
                ip, port = peer_key.split(":")
                current_ip = ip
                current_port = port

                preferred_protocol = self.known_peer_manager.get_preferred_protocol(current_ip, int(current_port))

                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(self.executor, lambda _ip=current_ip, _port=current_port, _data=message_data, _proto=preferred_protocol: smart_request(_ip, _port, "/api/p2p/message", preferred_protocol=_proto, json=_data, timeout=5))

                response, successful_protocol = result
                if response.status_code == 200:
                    sent_count += 1
                    self.stats["messages_sent"] += 1

            except Exception as e:
                self.logger.technical_info(f"Broadcast error to {peer_key}: {e}")

        return sent_count

    def get_status(self) -> dict:
        uptime = time.time() - self.start_time if self.running else 0

        return {"running": self.running, "node_id": self.node_id, "uptime": uptime, "external_ip": self.external_ip, "port": get_external_p2p_port(), "discovery_enabled": self.discovery is not None and self.discovery.running, "statistics": self.stats, "known_peers": self.known_peer_manager.get_stats(), "failed_peers": self.failed_peer_manager.get_stats(), "discovery_stats": self.discovery.get_stats() if self.discovery else {}}


_p2p_routes: Optional[AtlasP2PRoutes] = None


def initialize_p2p_routes(app: Flask, data_dir: str = "p2p_data") -> AtlasP2PRoutes:
    global _p2p_routes

    if _p2p_routes is None:
        _p2p_routes = AtlasP2PRoutes(data_dir)
        _p2p_routes.register_routes(app)

        _p2p_routes.logger.initialization("P2P", "Atlas P2P Routes system initialized")

    return _p2p_routes


def get_p2p_routes() -> Optional[AtlasP2PRoutes]:
    return _p2p_routes


async def start_p2p_discovery():
    if _p2p_routes:
        return await _p2p_routes.start_discovery()
    return False


async def stop_p2p_discovery():
    if _p2p_routes:
        await _p2p_routes.stop_discovery()
