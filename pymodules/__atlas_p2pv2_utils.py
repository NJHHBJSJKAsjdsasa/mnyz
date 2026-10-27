# pymodules/__atlas_p2pv2_utils.py

import json
import time
import socket
import urllib.request
import os
from typing import Set, List, Optional, Dict, Tuple
from dataclasses import dataclass, asdict
from enum import Enum

from pymodules.__atlas_fixed_vars import PORT, get_external_p2p_port
from pymodules.__atlas_p2pv2_logger import get_p2p_logger


class PeerStatus(Enum):

    ACTIVE = "active"
    INACTIVE = "inactive"
    STALE = "stale"
    ARCHIVED = "archived"

    def get_check_interval(self) -> int:
        intervals = {PeerStatus.ACTIVE: 60 * 60, PeerStatus.INACTIVE: 6 * 3600, PeerStatus.STALE: 7 * 24 * 3600, PeerStatus.ARCHIVED: 30 * 24 * 3600}
        return intervals[self]

    def get_description(self) -> str:
        descriptions = {PeerStatus.ACTIVE: "Currently available", PeerStatus.INACTIVE: "Recently went offline", PeerStatus.STALE: "Long-term offline", PeerStatus.ARCHIVED: "Very long offline"}
        return descriptions[self]


class FailureType(Enum):

    TEMPORARY = "temporary"
    PROTOCOL_MISMATCH = "protocol"
    AUTHENTICATION = "auth"
    MALICIOUS = "malicious"
    NETWORK = "network"

    def get_cooldown_seconds(self) -> int:
        cooldowns = {FailureType.TEMPORARY: 30 * 60, FailureType.PROTOCOL_MISMATCH: 2 * 3600, FailureType.AUTHENTICATION: 24 * 3600, FailureType.MALICIOUS: 30 * 24 * 3600, FailureType.NETWORK: 1 * 3600}
        return cooldowns[self]

    def get_description(self) -> str:
        descriptions = {FailureType.TEMPORARY: "Temporary connection issue", FailureType.PROTOCOL_MISMATCH: "Protocol compatibility issue", FailureType.AUTHENTICATION: "Authentication or handshake failure", FailureType.MALICIOUS: "Confirmed malicious behavior", FailureType.NETWORK: "Network connectivity issue"}
        return descriptions[self]


# Produced by the pre-2.0 rule "peer announced in DHT but HTTP timed out" which
# escalated normal public-DHT noise to a 30-day ban. Kept as an exact string so
# the migration above only touches entries created by that rule.
LEGACY_FALSE_POSITIVE_REASON = "Suspicious timeout - potential intrusion attempt"
LEGACY_FALSE_POSITIVE_COOLDOWN = 3600


@dataclass
class FailedPeer:

    address: str
    port: int
    first_failure: float
    last_failure: float
    failure_count: int
    failure_type: FailureType
    failure_reason: str
    ban_until: Optional[float] = None

    def __post_init__(self):
        if self.ban_until is None:
            cooldown = self.failure_type.get_cooldown_seconds()
            self.ban_until = self.last_failure + cooldown

    def to_dict(self) -> dict:
        data = asdict(self)
        data["failure_type"] = self.failure_type.value
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "FailedPeer":
        data = data.copy()
        if "failure_type" in data:
            data["failure_type"] = FailureType(data["failure_type"])
        else:
            data["failure_type"] = FailureType.TEMPORARY
        return cls(**data)

    def is_banned(self) -> bool:
        return self.ban_until is not None and time.time() < self.ban_until

    def time_until_unban(self) -> float:
        if not self.is_banned():
            return 0.0
        return self.ban_until - time.time()


@dataclass
class KnownPeer:

    address: str
    port: int
    node_id: str
    first_connected: float
    last_connected: float
    connection_count: int
    handshake_version: str
    capabilities: List[str]
    cosmic_origin_time: Optional[int] = None
    seed: Optional[str] = None
    integrity_hash: Optional[str] = None
    last_ping_ms: Optional[float] = None
    preferred_protocol: Optional[str] = None
    status: Optional[PeerStatus] = None
    last_seen: Optional[float] = None
    last_check_attempt: Optional[float] = None

    def __post_init__(self):
        if self.last_seen is None:
            self.last_seen = self.last_connected
        if self.last_check_attempt is None:
            self.last_check_attempt = self.last_connected
        if self.status is None:
            self.status = self._calculate_status()

    def _calculate_status(self) -> PeerStatus:
        current_time = time.time()
        time_since_seen = current_time - self.last_seen

        if time_since_seen < 60 * 60:
            return PeerStatus.ACTIVE
        elif time_since_seen < 3 * 3600:
            return PeerStatus.INACTIVE
        elif time_since_seen < 7 * 24 * 3600:
            return PeerStatus.STALE
        else:
            return PeerStatus.ARCHIVED

    def update_status(self):
        self.status = self._calculate_status()

    def mark_seen(self):
        self.last_seen = time.time()
        self.update_status()

    def mark_connected(self):
        current_time = time.time()
        self.last_connected = current_time
        self.last_seen = current_time
        self.last_check_attempt = current_time
        self.connection_count += 1
        self.status = PeerStatus.ACTIVE

    def needs_check(self) -> bool:
        if self.last_check_attempt is None:
            return True

        self.update_status()
        interval = self.status.get_check_interval()
        current_time = time.time()
        return (current_time - self.last_check_attempt) > interval

    def should_attempt_reconnection(self) -> bool:
        return self.needs_check()

    def time_until_next_check(self) -> float:
        if self.last_check_attempt is None:
            return 0

        self.update_status()
        interval = self.status.get_check_interval()
        current_time = time.time()
        elapsed = current_time - self.last_check_attempt
        remaining = interval - elapsed
        return max(0, remaining)

    def to_dict(self) -> dict:
        data = asdict(self)
        if self.status:
            data["status"] = self.status.value
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "KnownPeer":
        data = data.copy()
        if "status" in data and data["status"]:
            data["status"] = PeerStatus(data["status"])
        else:
            data["status"] = None
        return cls(**data)


class NetworkUtils:

    @staticmethod
    async def detect_external_ip() -> Optional[str]:
        services = [("https://httpbin.org/ip", lambda x: json.loads(x)["origin"]), ("https://ipinfo.io/ip", lambda x: x.strip()), ("https://api.ipify.org", lambda x: x.strip()), ("https://checkip.amazonaws.com", lambda x: x.strip()), ("https://icanhazip.com", lambda x: x.strip())]

        for service_url, parser in services:
            try:
                with urllib.request.urlopen(service_url, timeout=5) as response:
                    data = response.read().decode("utf-8")
                    ip = parser(data)

                    if NetworkUtils.is_valid_ip(ip):
                        return ip

            except Exception:
                continue

        return None

    @staticmethod
    def is_valid_ip(ip: str) -> bool:
        try:
            parts = ip.split(".")
            return len(parts) == 4 and all(0 <= int(part) <= 255 for part in parts)
        except Exception:
            return False

    @staticmethod
    def get_local_ips() -> Set[str]:
        local_ips = set()

        try:
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            local_ips.add(local_ip)
        except Exception:
            pass

        local_ips.update(["127.0.0.1", "localhost", "0.0.0.0"])

        try:
            import psutil

            network_interfaces = psutil.net_if_addrs()
            for addresses in network_interfaces.values():
                for addr in addresses:
                    if addr.family == 2:
                        local_ips.add(addr.address)
        except ImportError:
            pass

        return local_ips

    @staticmethod
    def is_private_ip(ip: str) -> bool:
        try:
            parts = [int(x) for x in ip.split(".")]
            return (parts[0] == 10) or (parts[0] == 172 and 16 <= parts[1] <= 31) or (parts[0] == 192 and parts[1] == 168) or (parts[0] == 127) or (parts[0] == 169 and parts[1] == 254)
        except Exception:
            return False


class SelfConnectionDetector:

    def __init__(self, listen_ports: List[int]):
        self.listen_ports = set(listen_ports)
        self.external_ip: Optional[str] = None
        self.local_ips: Set[str] = set()
        self.update_network_info()

    def update_network_info(self):
        self.local_ips = NetworkUtils.get_local_ips()

    async def detect_external_ip(self):
        self.external_ip = await NetworkUtils.detect_external_ip()

    def add_listen_port(self, port: int):
        self.listen_ports.add(port)

    def is_self_connection(self, ip: str, port: int) -> bool:
        if port == get_external_p2p_port() and ip == self.external_ip:
            return True

        if port in self.listen_ports and (ip == self.external_ip or ip in self.local_ips):
            return True

        return False

    def get_connection_info(self) -> dict:
        return {"external_ip": self.external_ip, "local_ips": list(self.local_ips), "listen_ports": list(self.listen_ports)}


class FailedPeerManager:

    def __init__(self, data_dir: str = "p2p_data"):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        self.failed_peers_file = os.path.join(data_dir, "failed_peers.json")
        self.failed_peers: Dict[str, FailedPeer] = {}
        self.logger = get_p2p_logger(data_dir)
        self.load_failed_peers()
        self._migrate_misclassified_bans()
        self.cleanup_expired_bans()

    def _get_peer_key(self, address: str, port: int) -> str:
        return f"{address}:{port}"

    def _migrate_misclassified_bans(self) -> int:
        """Downgrade bans created by the old "DHT timeout == MALICIOUS" rule.

        Public DHT swarms are full of non-Atlas endpoints; treating their HTTP
        timeout as an intrusion attempt poisoned the ban list with 30-day entries
        and blocked every later retry.
        """
        migrated = 0
        for peer in self.failed_peers.values():
            if peer.failure_type is not FailureType.MALICIOUS:
                continue
            if peer.failure_reason != LEGACY_FALSE_POSITIVE_REASON:
                continue
            peer.failure_type = FailureType.NETWORK
            peer.ban_until = peer.last_failure + LEGACY_FALSE_POSITIVE_COOLDOWN
            migrated += 1

        if migrated:
            self.logger.maintenance(f"Reclassified {migrated} timeout bans as network failures")
            self.save_failed_peers()
        return migrated

    def load_failed_peers(self):

        try:
            if os.path.exists(self.failed_peers_file):
                with open(self.failed_peers_file, "r") as f:
                    data = json.load(f)

                    self.failed_peers = {}
                    for peer_key, peer_data in data.get("failed_peers", {}).items():
                        try:
                            self.failed_peers[peer_key] = FailedPeer.from_dict(peer_data)
                        except Exception as e:
                            self.logger.technical_info(f"Error loading failed peer {peer_key}: {e}")

                self.logger.initialization("FailedPeerManager", f"Loaded {len(self.failed_peers)} failed peers from storage")
            else:
                self.logger.initialization("FailedPeerManager", "No failed peers file found, starting fresh")

        except Exception as e:
            self.logger.technical_info(f"Error loading failed peers: {e}")
            self.failed_peers = {}

    def save_failed_peers(self):
        try:
            data = {"last_updated": time.time(), "format_version": "1.0", "failed_peers": {peer_key: peer.to_dict() for peer_key, peer in self.failed_peers.items()}}

            temp_file = self.failed_peers_file + ".tmp"
            with open(temp_file, "w") as f:
                json.dump(data, f, indent=2)

            os.replace(temp_file, self.failed_peers_file)

        except Exception as e:
            self.logger.technical_info(f"Error saving failed peers: {e}")

    def add_failed_peer(self, address: str, port: int, reason: str, failure_type: FailureType = FailureType.TEMPORARY):
        peer_key = self._get_peer_key(address, port)
        current_time = time.time()

        if peer_key in self.failed_peers:
            peer = self.failed_peers[peer_key]
            peer.last_failure = current_time
            peer.failure_count += 1
            peer.failure_reason = reason

            if peer.failure_count >= 3 and failure_type == FailureType.TEMPORARY:
                failure_type = FailureType.NETWORK
            elif peer.failure_count >= 5 and failure_type in [FailureType.TEMPORARY, FailureType.NETWORK]:
                failure_type = FailureType.PROTOCOL_MISMATCH

            peer.failure_type = failure_type
            cooldown = failure_type.get_cooldown_seconds()
            peer.ban_until = current_time + cooldown

        else:
            self.failed_peers[peer_key] = FailedPeer(address=address, port=port, first_failure=current_time, last_failure=current_time, failure_count=1, failure_type=failure_type, failure_reason=reason)

        cooldown_desc = self._format_cooldown(failure_type.get_cooldown_seconds())
        self.logger.technical_info(f"Added failed peer: {peer_key} (type: {failure_type.get_description()}, cooldown: {cooldown_desc})")
        self.save_failed_peers()

    def _format_cooldown(self, seconds: int) -> str:
        if seconds < 3600:
            return f"{seconds//60} minutes"
        elif seconds < 86400:
            return f"{seconds//3600} hours"
        else:
            return f"{seconds//86400} days"

    def is_peer_failed(self, address: str, port: int) -> bool:
        peer_key = self._get_peer_key(address, port)
        return peer_key in self.failed_peers

    def is_peer_banned(self, address: str, port: int) -> bool:
        peer_key = self._get_peer_key(address, port)

        if peer_key not in self.failed_peers:
            return False

        peer = self.failed_peers[peer_key]

        if not peer.is_banned():
            del self.failed_peers[peer_key]
            self.save_failed_peers()
            return False

        return True

    def remove_failed_peer(self, address: str, port: int):
        peer_key = self._get_peer_key(address, port)

        if peer_key in self.failed_peers:
            del self.failed_peers[peer_key]
            self.logger.technical_info(f"Removed from failed list: {peer_key}")
            self.save_failed_peers()

    def cleanup_expired_bans(self):
        current_time = time.time()
        to_remove = []
        expired = 0

        for peer_key, peer in self.failed_peers.items():
            if peer.ban_until and current_time >= peer.ban_until:
                peer.ban_until = None
                expired += 1

            if current_time - peer.last_failure > (30 * 24 * 60 * 60):
                to_remove.append(peer_key)

        for peer_key in to_remove:
            del self.failed_peers[peer_key]

        if to_remove or expired:
            self.logger.maintenance(f"Cleaned up {len(to_remove)} old and {expired} expired failed peers")
            self.save_failed_peers()

    def get_failed_peers_list(self) -> List[str]:
        return list(self.failed_peers.keys())

    def get_banned_peers_list(self) -> List[str]:
        current_time = time.time()
        banned = []

        for peer_key, peer in self.failed_peers.items():
            if peer.ban_until and current_time < peer.ban_until:
                banned.append(peer_key)

        return banned

    def get_peer_info(self, address: str, port: int) -> Optional[FailedPeer]:
        peer_key = self._get_peer_key(address, port)
        return self.failed_peers.get(peer_key)

    def get_stats(self) -> dict:
        current_time = time.time()
        banned_count = sum(1 for peer in self.failed_peers.values() if peer.ban_until and current_time < peer.ban_until)

        return {"total_failed_peers": len(self.failed_peers), "currently_banned": banned_count, "file_path": self.failed_peers_file}


class KnownPeerManager:

    def __init__(self, data_dir: str = "p2p_data"):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        self.known_peers_file = os.path.join(data_dir, "known_peers.json")

        self.known_peers: Dict[str, KnownPeer] = {}
        self.endpoint_to_node: Dict[str, str] = {}

        self.logger = get_p2p_logger(data_dir)
        self.load_known_peers()

    def _get_endpoint_key(self, address: str, port: int) -> str:
        return f"{address}:{port}"

    def _get_node_id_by_endpoint(self, address: str, port: int) -> Optional[str]:
        endpoint_key = self._get_endpoint_key(address, port)
        return self.endpoint_to_node.get(endpoint_key)

    def _update_endpoint_mapping(self, node_id: str, address: str, port: int):
        endpoint_key = self._get_endpoint_key(address, port)

        old_endpoint = None
        for ep, nid in self.endpoint_to_node.items():
            if nid == node_id and ep != endpoint_key:
                old_endpoint = ep
                break

        if old_endpoint:
            del self.endpoint_to_node[old_endpoint]
            self.logger.technical_info(f"Endpoint updated for {node_id[:16]}...: {old_endpoint} → {endpoint_key}")

        self.endpoint_to_node[endpoint_key] = node_id

    def load_known_peers(self):

        try:
            if os.path.exists(self.known_peers_file):
                with open(self.known_peers_file, "r") as f:
                    data = json.load(f)

                    self.known_peers = {}
                    self.endpoint_to_node = {}

                    for key, peer_data in data.get("known_peers", {}).items():
                        try:
                            peer = KnownPeer.from_dict(peer_data)

                            if ":" in key and key.count(":") == 1 and key != peer.node_id:
                                self.logger.technical_info(f"Migrating legacy peer: {key} → {peer.node_id[:16]}...")
                                self.known_peers[peer.node_id] = peer
                                self.endpoint_to_node[key] = peer.node_id
                            else:
                                self.known_peers[peer.node_id] = peer
                                endpoint_key = self._get_endpoint_key(peer.address, peer.port)
                                self.endpoint_to_node[endpoint_key] = peer.node_id

                        except Exception as e:
                            self.logger.technical_info(f"Error loading known peer {key}: {e}")

                self.logger.initialization("KnownPeerManager", f"Loaded {len(self.known_peers)} known peers from storage")
            else:
                self.logger.initialization("KnownPeerManager", "No known peers file found, starting fresh")

        except Exception as e:
            self.logger.technical_info(f"Error loading known peers: {e}")
            self.known_peers = {}
            self.endpoint_to_node = {}

    def save_known_peers(self):
        try:
            for peer in self.known_peers.values():
                peer.update_status()

            data = {"last_updated": time.time(), "format_version": "2.0", "known_peers": {node_id: peer.to_dict() for node_id, peer in self.known_peers.items()}}

            temp_file = self.known_peers_file + ".tmp"
            with open(temp_file, "w") as f:
                json.dump(data, f, indent=2)

            os.replace(temp_file, self.known_peers_file)

        except Exception as e:
            self.logger.technical_info(f"Error saving known peers: {e}")

    def add_known_peer(self, address: str, port: int, node_id: str, handshake_version: str, capabilities: List[str], preferred_protocol: str = None, cosmic_origin_time: int = None, seed: str = None, integrity_hash: str = None):
        current_time = time.time()
        endpoint_key = self._get_endpoint_key(address, port)

        if node_id in self.known_peers:
            peer = self.known_peers[node_id]
            old_seed = peer.seed
            old_cosmic = peer.cosmic_origin_time
            old_endpoint = self._get_endpoint_key(peer.address, peer.port)

            if old_endpoint != endpoint_key:
                self.logger.technical_info(f"Node {node_id[:16]}... moved from {old_endpoint} to {endpoint_key}")
                if old_endpoint in self.endpoint_to_node:
                    del self.endpoint_to_node[old_endpoint]

            peer.address = address
            peer.port = port
            peer.last_connected = current_time
            peer.connection_count += 1
            peer.handshake_version = handshake_version
            peer.capabilities = capabilities

            if preferred_protocol:
                peer.preferred_protocol = preferred_protocol

            if cosmic_origin_time is not None and cosmic_origin_time != old_cosmic:
                self.logger.technical_info(f"Node {node_id[:16]}... changed universe: {old_cosmic} → {cosmic_origin_time}")
                peer.cosmic_origin_time = cosmic_origin_time
            elif cosmic_origin_time is not None:
                peer.cosmic_origin_time = cosmic_origin_time

            if seed is not None and seed != old_seed:
                self.logger.technical_info(f"Node {node_id[:16]}... changed seed: {old_seed[:8] if old_seed else 'none'}... → {seed[:8]}...")
                peer.seed = seed
            elif seed is not None:
                peer.seed = seed

            if integrity_hash is not None:
                peer.integrity_hash = integrity_hash

        else:
            existing_node_id = self.endpoint_to_node.get(endpoint_key)
            if existing_node_id and existing_node_id != node_id:
                self.logger.technical_info(f"Endpoint {endpoint_key} occupied by different node:")
                self.logger.technical_info(f"Old: {existing_node_id[:16]}... → New: {node_id[:16]}...")
                self.logger.technical_info("Replacing old node (probably reinstalled)")
                if existing_node_id in self.known_peers:
                    del self.known_peers[existing_node_id]

            self.known_peers[node_id] = KnownPeer(address=address, port=port, node_id=node_id, first_connected=current_time, last_connected=current_time, connection_count=1, handshake_version=handshake_version, capabilities=capabilities, preferred_protocol=preferred_protocol, cosmic_origin_time=cosmic_origin_time, seed=seed, integrity_hash=integrity_hash, status=PeerStatus.ACTIVE)

        self.endpoint_to_node[endpoint_key] = node_id

        peer = self.known_peers[node_id]
        peer.update_status()

        self.logger.technical_info(f"Added known peer: {endpoint_key} (Node: {node_id[:16]}...)")
        self.save_known_peers()

    def is_known_peer(self, address: str, port: int) -> bool:
        endpoint_key = self._get_endpoint_key(address, port)
        return endpoint_key in self.endpoint_to_node

    def needs_reconnection(self, address: str, port: int, cooldown_hours: int = 24) -> bool:
        node_id = self._get_node_id_by_endpoint(address, port)
        if not node_id or node_id not in self.known_peers:
            return True

        peer = self.known_peers[node_id]
        current_time = time.time()
        cooldown_seconds = cooldown_hours * 3600

        return (current_time - peer.last_connected) > cooldown_seconds

    def get_known_peer(self, address: str, port: int) -> Optional[KnownPeer]:
        node_id = self._get_node_id_by_endpoint(address, port)
        return self.known_peers.get(node_id) if node_id else None

    def get_preferred_protocol(self, address: str, port: int) -> Optional[str]:
        peer = self.get_known_peer(address, port)
        return peer.preferred_protocol if peer else None

    def set_preferred_protocol(self, address: str, port: int, protocol: str):
        node_id = self._get_node_id_by_endpoint(address, port)
        if node_id and node_id in self.known_peers and protocol in ["https", "http"]:
            self.known_peers[node_id].preferred_protocol = protocol
            self.save_known_peers()

    def update_peer_ping(self, address: str, port: int, ping_ms: float):
        node_id = self._get_node_id_by_endpoint(address, port)
        if node_id and node_id in self.known_peers:
            self.known_peers[node_id].last_ping_ms = ping_ms

    def get_known_peers_list(self) -> List[str]:
        return list(self.endpoint_to_node.keys())

    def get_best_peers(self, max_count: int = 10) -> List[KnownPeer]:
        peers = list(self.known_peers.values())

        for peer in peers:
            peer.update_status()

        def sort_key(p):
            status_priority = {PeerStatus.ACTIVE: 4, PeerStatus.INACTIVE: 3, PeerStatus.STALE: 2, PeerStatus.ARCHIVED: 1}
            return (status_priority.get(p.status, 0), p.connection_count, p.last_connected)

        peers.sort(key=sort_key, reverse=True)
        return peers[:max_count]

    def get_active_peers(self) -> List[KnownPeer]:
        active_peers = []
        for peer in self.known_peers.values():
            if peer.is_active():
                active_peers.append(peer)
        return active_peers

    def get_peers_by_status(self, status: PeerStatus) -> List[KnownPeer]:
        peers = []
        for peer in self.known_peers.values():
            peer.update_status()
            if peer.status == status:
                peers.append(peer)
        return peers

    def cleanup_old_peers(self):
        to_remove = []
        archived_count = 0

        for peer_key, peer in self.known_peers.items():
            peer.update_status()

            if peer.status == PeerStatus.ARCHIVED:
                current_time = time.time()
                if current_time - peer.last_connected > (365 * 24 * 60 * 60):
                    to_remove.append(peer_key)
                else:
                    archived_count += 1

        for node_id in to_remove:
            peer = self.known_peers.get(node_id)
            if peer:
                endpoint_key = self._get_endpoint_key(peer.address, peer.port)
                if endpoint_key in self.endpoint_to_node:
                    del self.endpoint_to_node[endpoint_key]

            del self.known_peers[node_id]

        if to_remove or archived_count:
            self.logger.maintenance(f"Cleanup: removed {len(to_remove)} very old peers, {archived_count} archived")
            self.save_known_peers()

    def find_peer_by_node_id(self, node_id: str) -> Optional[KnownPeer]:
        return self.known_peers.get(node_id)

    def get_peer_endpoint_by_node_id(self, node_id: str) -> Optional[Tuple[str, int]]:
        peer = self.known_peers.get(node_id)
        return (peer.address, peer.port) if peer else None

    def has_node_id(self, node_id: str) -> bool:
        return node_id in self.known_peers

    def remove_duplicate_node_ids(self):
        valid_mappings = {}

        for node_id, peer in self.known_peers.items():
            endpoint_key = self._get_endpoint_key(peer.address, peer.port)
            valid_mappings[endpoint_key] = node_id

        self.endpoint_to_node = valid_mappings
        self.save_known_peers()

        self.logger.maintenance(f"Validated {len(valid_mappings)} endpoint mappings")

    def get_stats(self) -> dict:
        if not self.known_peers:
            return {"total_known_peers": 0, "file_path": self.known_peers_file}

        for peer in self.known_peers.values():
            peer.update_status()

        status_counts = {status: 0 for status in PeerStatus}
        for peer in self.known_peers.values():
            status_counts[peer.status] += 1

        avg_connections = sum(p.connection_count for p in self.known_peers.values()) / len(self.known_peers)

        return {"total_known_peers": len(self.known_peers), "active_peers": status_counts[PeerStatus.ACTIVE], "inactive_peers": status_counts[PeerStatus.INACTIVE], "stale_peers": status_counts[PeerStatus.STALE], "archived_peers": status_counts[PeerStatus.ARCHIVED], "average_connections": round(avg_connections, 2), "file_path": self.known_peers_file, "most_connected": max(self.known_peers.values(), key=lambda p: p.connection_count).connection_count if self.known_peers else 0}

    def mark_peer_seen(self, address: str, port: int):
        node_id = self._get_node_id_by_endpoint(address, port)
        if node_id and node_id in self.known_peers:
            self.known_peers[node_id].mark_seen()
            self.save_known_peers()

    def mark_peer_check_failed(self, address: str, port: int):
        node_id = self._get_node_id_by_endpoint(address, port)
        if node_id and node_id in self.known_peers:
            self.known_peers[node_id].last_check_attempt = time.time()
            self.known_peers[node_id].update_status()
            self.save_known_peers()

    def detect_bot_networks(self) -> dict:
        patterns = {"same_cosmic_origin": {}, "same_seed": {}, "same_integrity_hash": {}, "suspicious_peers": []}

        for node_id, peer in self.known_peers.items():
            endpoint = f"{peer.address}:{peer.port}"

            if peer.cosmic_origin_time:
                cosmic_key = str(peer.cosmic_origin_time)
                if cosmic_key not in patterns["same_cosmic_origin"]:
                    patterns["same_cosmic_origin"][cosmic_key] = []
                patterns["same_cosmic_origin"][cosmic_key].append(endpoint)

            if peer.seed:
                if peer.seed not in patterns["same_seed"]:
                    patterns["same_seed"][peer.seed] = []
                patterns["same_seed"][peer.seed].append(endpoint)

            if peer.integrity_hash:
                if peer.integrity_hash not in patterns["same_integrity_hash"]:
                    patterns["same_integrity_hash"][peer.integrity_hash] = []
                patterns["same_integrity_hash"][peer.integrity_hash].append(endpoint)

            if not peer.cosmic_origin_time or not peer.seed or not peer.integrity_hash:
                patterns["suspicious_peers"].append({"peer": endpoint, "node_id": node_id[:16] + "...", "reason": "Missing universe data", "cosmic_origin": peer.cosmic_origin_time, "seed": peer.seed, "integrity_hash": peer.integrity_hash[:16] + "..." if peer.integrity_hash else None})

        return patterns

    def get_bot_network_report(self) -> str:
        patterns = self.detect_bot_networks()
        report_lines = ["Bot Network Detection Report:"]

        suspicious_cosmic = {k: v for k, v in patterns["same_cosmic_origin"].items() if len(v) > 1}
        if suspicious_cosmic:
            report_lines.append(f"\nMultiple peers with same cosmic_origin_time:")
            for cosmic, peers in suspicious_cosmic.items():
                report_lines.append(f"   {cosmic}: {len(peers)} peers - {peers}")

        suspicious_seeds = {k: v for k, v in patterns["same_seed"].items() if len(v) > 1}
        if suspicious_seeds:
            report_lines.append(f"\nMultiple peers with same seed (VERY SUSPICIOUS):")
            for seed, peers in suspicious_seeds.items():
                report_lines.append(f"   '{seed}': {len(peers)} peers - {peers}")

        suspicious_hashes = {k: v for k, v in patterns["same_integrity_hash"].items() if len(v) > 1}
        if suspicious_hashes:
            report_lines.append(f"\nMultiple peers with same integrity_hash (BOT NETWORK):")
            for hash_val, peers in suspicious_hashes.items():
                report_lines.append(f"   {hash_val[:16]}...: {len(peers)} peers - {peers}")

        if patterns["suspicious_peers"]:
            report_lines.append(f"\nPeers with missing universe data:")
            for suspicious in patterns["suspicious_peers"]:
                report_lines.append(f"   {suspicious['peer']}: {suspicious['reason']}")

        if len(report_lines) == 1:
            report_lines.append("No suspicious patterns detected")

        return "\n".join(report_lines)
