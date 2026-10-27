# pymodules/__atlas_p2pv2_discovery.py

import asyncio
import hashlib
import socket
import struct
import time
import random
import os
import json
import urllib.request
from typing import Dict, List, Tuple, Optional, Set, Callable
from dataclasses import dataclass
import bencodepy

from pymodules.__atlas_fixed_vars import PORT, VERSION, VERSION_HASH, get_external_p2p_port
from pymodules.__atlas_p2pv2_logger import get_p2p_logger


@dataclass
class DiscoveredPeer:
    ip: str
    port: int
    discovered_at: float
    validated: bool = False
    last_seen: float = 0


@dataclass
class DHTNode:
    node_id: bytes
    ip: str
    port: int
    last_seen: float = 0
    token: Optional[bytes] = None


class AtlasP2PDiscovery:
    def __init__(self, data_dir: str = "p2p_data", atlas_port: int = None):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)

        self.node_id = self._generate_node_id()
        self.socket: Optional[socket.socket] = None
        self.port = 0
        self.running = False

        self.atlas_port = atlas_port or PORT

        self.routing_table: List[List[DHTNode]] = [[] for _ in range(160)]
        self.K = 8

        self.transactions: Dict[bytes, dict] = {}
        self.transaction_id = 0

        self.tokens: Dict[str, bytes] = {}
        self.token_timestamp: Dict[str, float] = {}

        infohash_string = f"the-atlas-multiverse-v2-{VERSION}-{VERSION_HASH}"
        self.atlas_infohash = hashlib.sha1(infohash_string.encode()).digest()
        self.discovered_peers: Dict[str, DiscoveredPeer] = {}

        self.invalid_peers_cache: Set[str] = set()
        self.non_valid_file = os.path.join(data_dir, "non_valid.json")

        self.external_ip: Optional[str] = None
        self.local_ips: Set[str] = set()

        self.bootstrap_nodes = [
            ("router.bittorrent.com", 6881),
            ("dht.transmissionbt.com", 6881),
            ("router.utorrent.com", 6881),
            ("dht.libtorrent.org", 25401),
        ]

        self.peer_discovered_callbacks: List[Callable[[DiscoveredPeer], None]] = []

        self.logger = get_p2p_logger()

        self.last_bootstrap_time = 0

        self._load_invalid_peers_cache()

    def _load_invalid_peers_cache(self):
        try:
            if os.path.exists(self.non_valid_file):
                with open(self.non_valid_file, "r") as f:
                    data = json.load(f)
                    invalid_peers = data.get("invalid_peers", [])

                    if isinstance(invalid_peers, list):
                        self.invalid_peers_cache = set(invalid_peers)
                    elif isinstance(invalid_peers, dict):
                        self.invalid_peers_cache = set(invalid_peers.keys())
                    else:
                        self.invalid_peers_cache = set()

                    self.logger.initialization("DHT", f"Loaded {len(self.invalid_peers_cache)} invalid peers from cache")
            else:
                self.invalid_peers_cache = set()
        except Exception as e:
            self.logger.technical_info(f"Failed to load invalid peers cache: {e}")
            self.invalid_peers_cache = set()

    def _save_invalid_peers_cache(self):
        try:
            data = {}
            if os.path.exists(self.non_valid_file):
                try:
                    with open(self.non_valid_file, "r") as f:
                        data = json.load(f)
                except Exception:
                    data = {}

            data["invalid_peers"] = list(self.invalid_peers_cache)
            data["last_updated"] = time.time()

            with open(self.non_valid_file, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            self.logger.technical_info(f"Failed to save invalid peers cache: {e}")
            self.logger.technical_info(f"Failed to save invalid peers cache: {e}")

    def _add_to_invalid_cache(self, ip: str, port: int, reason: str):
        peer_key = f"{ip}:{port}"
        if peer_key not in self.invalid_peers_cache:
            self.invalid_peers_cache.add(peer_key)
            self._save_invalid_peers_cache()

    def _is_in_invalid_cache(self, ip: str, port: int) -> bool:
        peer_key = f"{ip}:{port}"
        return peer_key in self.invalid_peers_cache

    def _generate_node_id(self) -> bytes:
        return os.urandom(20)

    def _make_tid(self) -> bytes:
        self.transaction_id = (self.transaction_id + 1) % 65536
        return struct.pack("!H", self.transaction_id)

    def _encode(self, msg: dict) -> bytes:
        return bencodepy.encode(msg)

    def _decode(self, data: bytes) -> Optional[dict]:
        try:
            return bencodepy.decode(data)
        except Exception:
            return None

    def _distance(self, id1: bytes, id2: bytes) -> int:
        return int.from_bytes(id1, "big") ^ int.from_bytes(id2, "big")

    def _bucket_index(self, node_id: bytes) -> int:
        distance = self._distance(self.node_id, node_id)
        if distance == 0:
            return 0
        return 159 - distance.bit_length() + 1

    def _add_node(self, node: DHTNode):
        idx = self._bucket_index(node.node_id)
        bucket = self.routing_table[idx]

        for i, existing in enumerate(bucket):
            if existing.node_id == node.node_id:
                bucket[i] = node
                return

        if len(bucket) < self.K:
            bucket.append(node)

    def _get_closest_nodes(self, target: bytes, k: int = 8) -> List[DHTNode]:
        all_nodes = []
        for bucket in self.routing_table:
            all_nodes.extend(bucket)

        all_nodes.sort(key=lambda n: self._distance(n.node_id, target))
        return all_nodes[:k]

    def _compact_nodes(self, nodes: List[DHTNode]) -> bytes:
        result = b""
        for node in nodes:
            try:
                result += node.node_id
                result += socket.inet_aton(node.ip)
                result += struct.pack("!H", node.port)
            except Exception:
                pass
        return result

    def _uncompact_nodes(self, data: bytes) -> List[DHTNode]:
        nodes = []
        for i in range(0, len(data), 26):
            if i + 26 > len(data):
                break
            try:
                node_id = data[i : i + 20]
                ip = socket.inet_ntoa(data[i + 20 : i + 24])
                port = struct.unpack("!H", data[i + 24 : i + 26])[0]
                nodes.append(DHTNode(node_id, ip, port, time.time()))
            except Exception:
                pass
        return nodes

    def _uncompact_peers(self, data: bytes) -> List[Tuple[str, int]]:
        peers = []
        for i in range(0, len(data), 6):
            if i + 6 > len(data):
                break
            try:
                ip = socket.inet_ntoa(data[i : i + 4])
                port = struct.unpack("!H", data[i + 4 : i + 6])[0]
                peers.append((ip, port))
            except Exception:
                pass
        return peers

    async def _detect_network_info(self):
        services = ["https://httpbin.org/ip", "https://ipinfo.io/ip", "https://api.ipify.org"]

        for service in services:
            try:
                with urllib.request.urlopen(service, timeout=5) as response:
                    data = response.read().decode("utf-8").strip()
                    if service == "https://httpbin.org/ip":
                        import json

                        data = json.loads(data)["origin"]

                    parts = data.split(".")
                    if len(parts) == 4 and all(0 <= int(part) <= 255 for part in parts):
                        self.external_ip = data
                        break
            except Exception:
                continue

        try:
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            self.local_ips.add(local_ip)
            self.local_ips.add("127.0.0.1")
            self.local_ips.add("localhost")
        except Exception:
            pass

    def _is_self_peer(self, ip: str, port: int) -> bool:
        """Only our own announced endpoint counts as self.

        Matching on IP alone hides every instance behind the same NAT, and made
        two local instances on different ports invisible to each other.
        """
        if port != get_external_p2p_port():
            return False

        return ip == self.external_ip or ip in self.local_ips

    async def start(self) -> bool:
        try:
            await self._detect_network_info()

            self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

            # Announce on a stable UDP port: an ephemeral port changes on every
            # restart and is never reachable through NAT port forwarding.
            preferred_port = get_external_p2p_port()
            try:
                self.socket.bind(("0.0.0.0", preferred_port))
            except OSError:
                self.logger.initialization("DHT", f"UDP {preferred_port} unavailable, using an ephemeral port")
                self.socket.bind(("0.0.0.0", 0))

            self.port = self.socket.getsockname()[1]
            self.socket.setblocking(False)

            self.running = True
            self.start_time = time.time()

            self.logger.initialization("DHT", f"DHT Discovery started on port {self.port}")
            self.logger.initialization("DHT", f"Node ID: {self.node_id.hex()[:16]}...")
            self.logger.initialization("DHT", f"Atlas infohash: {self.atlas_infohash.hex()}")

            self.logger.initialization("DHT", f"Discovery started on port {self.port}, Node ID: {self.node_id.hex()[:16]}..., Atlas infohash: {self.atlas_infohash.hex()}")

            asyncio.create_task(self._receive_loop())
            asyncio.create_task(self._maintenance_loop())
            asyncio.create_task(self._discovery_loop())

            await self._bootstrap()
            self.last_bootstrap_time = time.time()

            return True

        except Exception as e:
            self.logger.critical_error(f"Failed to start DHT discovery: {e}")
            return False

    async def stop(self):
        self.running = False
        if self.socket:
            self.socket.close()
        self.logger.technical_info("DHT Discovery stopped")

    async def _bootstrap(self):
        from pymodules.__atlas_startup_mode import is_startup_mode

        if not is_startup_mode():
            self.logger.initialization("DHT", "Bootstrapping DHT network")

        for host, port in self.bootstrap_nodes:
            try:
                ip = socket.gethostbyname(host)
                await self._send_find_node(ip, port, os.urandom(20))
                self.logger.discovery_detail(f"Bootstrapping DHT with {host} - success")
            except Exception as e:
                self.logger.discovery_detail(f"Bootstrapping DHT with {host} - failed: {e}")

    async def _receive_loop(self):
        while self.running:
            try:
                self.socket.settimeout(0.1)
                try:
                    data, addr = self.socket.recvfrom(65536)
                    if data:
                        asyncio.create_task(self._handle_message(data, addr))
                except socket.timeout:
                    pass
                await asyncio.sleep(0.01)
            except Exception as e:
                if self.running:
                    self.logger.technical_info(f"Receive error: {e}")
                await asyncio.sleep(1)

    async def _handle_message(self, data: bytes, addr: Tuple[str, int]):
        msg = self._decode(data)
        if not msg:
            return

        msg_type = msg.get(b"y", b"")

        if msg_type == b"r":
            await self._handle_response(msg, addr)
        elif msg_type == b"q":
            await self._handle_query(msg, addr)

    async def _handle_response(self, msg: dict, addr: Tuple[str, int]):
        tid = msg.get(b"t", b"")
        if tid not in self.transactions:
            return

        transaction = self.transactions.pop(tid)
        response = msg.get(b"r", {})

        if b"id" in response:
            node = DHTNode(response[b"id"], addr[0], addr[1], time.time())
            self._add_node(node)

        query_type = transaction.get("type")

        if query_type == "find_node" and b"nodes" in response:
            nodes = self._uncompact_nodes(response[b"nodes"])
            self.logger.discovery_detail(f"DHT find_node response from {addr[0]}:{addr[1]} - {len(nodes)} nodes")
            for node in nodes:
                self._add_node(node)

        elif query_type == "get_peers":
            if b"token" in response:
                token = response[b"token"]
                node_key = f"{addr[0]}:{addr[1]}"

                node = DHTNode(response[b"id"], addr[0], addr[1], time.time())
                node.token = token
                self._add_node(node)

                if transaction.get("infohash") == self.atlas_infohash:
                    await self._send_announce_peer(addr[0], addr[1], self.atlas_infohash, token)

            if b"values" in response:
                total_peers = 0
                for value in response[b"values"]:
                    if len(value) % 6 == 0:
                        peers = self._uncompact_peers(value)
                        total_peers += len(peers)
                        for ip, port in peers:
                            await self._add_discovered_peer(ip, port)

                self.logger.discovery_detail(f"DHT get_peers response from {addr[0]}:{addr[1]} - {total_peers} peers")

            if b"nodes" in response:
                nodes = self._uncompact_nodes(response[b"nodes"])
                for node in nodes:
                    self._add_node(node)

                if transaction.get("infohash") == self.atlas_infohash:
                    for node in nodes[:3]:
                        await self._send_get_peers(node.ip, node.port, self.atlas_infohash)

    async def _handle_query(self, msg: dict, addr: Tuple[str, int]):
        tid = msg.get(b"t", b"")
        query = msg.get(b"q", b"")
        args = msg.get(b"a", {})

        if b"id" in args:
            node = DHTNode(args[b"id"], addr[0], addr[1], time.time())
            self._add_node(node)

        response = {b"id": self.node_id}

        if query == b"ping":
            pass

        elif query == b"find_node":
            target = args.get(b"target", b"")
            if target:
                nodes = self._get_closest_nodes(target)
                response[b"nodes"] = self._compact_nodes(nodes)

        elif query == b"get_peers":
            infohash = args.get(b"info_hash", b"")

            token = os.urandom(8)
            self.tokens[addr[0]] = token
            self.token_timestamp[addr[0]] = time.time()
            response[b"token"] = token

            nodes = self._get_closest_nodes(infohash)
            if nodes:
                response[b"nodes"] = self._compact_nodes(nodes)

        reply = {b"t": tid, b"y": b"r", b"r": response}

        try:
            self.socket.sendto(self._encode(reply), addr)
        except Exception:
            pass

    async def _send_find_node(self, ip: str, port: int, target: bytes):
        tid = self._make_tid()

        msg = {b"t": tid, b"y": b"q", b"q": b"find_node", b"a": {b"id": self.node_id, b"target": target}}

        self.transactions[tid] = {"type": "find_node", "time": time.time()}

        self.logger.discovery_detail(f"DHT find_node query to {ip}:{port} for {target.hex()[:16]}...")

        try:
            self.socket.sendto(self._encode(msg), (ip, port))
        except Exception as e:
            self.logger.discovery_detail(f"Failed to send find_node to {ip}:{port}: {e}")

    async def _send_get_peers(self, ip: str, port: int, infohash: bytes):
        tid = self._make_tid()

        msg = {b"t": tid, b"y": b"q", b"q": b"get_peers", b"a": {b"id": self.node_id, b"info_hash": infohash}}

        self.transactions[tid] = {"type": "get_peers", "time": time.time(), "infohash": infohash, "nodes": [f"{ip}:{port}"]}

        self.logger.discovery_detail(f"DHT get_peers query to {ip}:{port} for {infohash.hex()[:16]}...")

        try:
            self.socket.sendto(self._encode(msg), (ip, port))
        except Exception as e:
            self.logger.discovery_detail(f"Failed to send get_peers to {ip}:{port}: {e}")

    async def _send_announce_peer(self, ip: str, port: int, infohash: bytes, token: bytes, implied_port: bool = False):
        tid = self._make_tid()

        msg = {b"t": tid, b"y": b"q", b"q": b"announce_peer", b"a": {b"id": self.node_id, b"info_hash": infohash, b"port": get_external_p2p_port() if not implied_port else 0, b"token": token, b"implied_port": 1 if implied_port else 0}}

        self.transactions[tid] = {"type": "announce_peer", "time": time.time(), "infohash": infohash}

        self.logger.discovery_detail(f"DHT announce_peer to {ip}:{port} for infohash {infohash.hex()[:16]}... port={get_external_p2p_port()}")

        try:
            self.socket.sendto(self._encode(msg), (ip, port))
        except Exception as e:
            self.logger.discovery_detail(f"Failed to send announce_peer to {ip}:{port}: {e}")

    async def _add_discovered_peer(self, ip: str, port: int):
        self.logger.discovery_detail(f"Discovered peer {ip}:{port} via DHT")

        if self._is_in_invalid_cache(ip, port):
            self.logger.discovery_detail(f"Filtered peer {ip}:{port} - in invalid cache")
            return

        if port < 1024 or port > 65535:
            self.logger.discovery_detail(f"Filtered peer {ip}:{port} - invalid port range")
            self._add_to_invalid_cache(ip, port, "Invalid port range")
            return

        if self._is_self_peer(ip, port):
            self.logger.discovery_detail(f"Filtered peer {ip}:{port} - self connection")
            self._add_to_invalid_cache(ip, port, "Self connection")
            if ip == self.external_ip:
                self.logger.technical_info(f"Detected self-connection attempt to {ip}:{port} - added to non_valid.json")
            return

        peer_key = f"{ip}:{port}"
        current_time = time.time()

        if peer_key not in self.discovered_peers:
            self.logger.discovery_detail(f"Accepted peer {ip}:{port}")

            peer = DiscoveredPeer(ip=ip, port=port, discovered_at=current_time, last_seen=current_time)
            self.discovered_peers[peer_key] = peer

            for callback in self.peer_discovered_callbacks:
                try:
                    callback(peer)
                except Exception as e:
                    self.logger.technical_info(f"Peer discovery callback error: {e}")
                    self.logger.discovery_detail(f"Peer discovery callback error: {e}")
        else:
            self.discovered_peers[peer_key].last_seen = current_time

    async def _search_atlas_peers(self):
        from pymodules.__atlas_startup_mode import is_startup_mode

        if is_startup_mode() or not hasattr(self, "_search_count"):
            self._search_count = 0
        self._search_count += 1

        if is_startup_mode() or self._search_count % 5 == 1:
            self.logger.initialization("DHT", "Searching for Atlas peers and announcing ourselves...")

        closest = self._get_closest_nodes(self.atlas_infohash, k=20)

        self.logger.discovery_detail(f"DHT announce for infohash {self.atlas_infohash.hex()[:16]}... port={PORT}")
        if is_startup_mode() or self._search_count % 5 == 1:
            self.logger.discovery_detail(f"Search & Announce cycle: {len(closest)} routing nodes + bootstrap queries")

        announced_count = 0
        queries_sent = 0
        for node in closest:
            await self._send_get_peers(node.ip, node.port, self.atlas_infohash)
            queries_sent += 1

            token_found = False
            for bucket in self.routing_table:
                for dht_node in bucket:
                    if dht_node.ip == node.ip and dht_node.port == node.port and dht_node.token:
                        await self._send_announce_peer(node.ip, node.port, self.atlas_infohash, dht_node.token)
                        announced_count += 1
                        token_found = True
                        break
                if token_found:
                    break

            await asyncio.sleep(0.05)

        if is_startup_mode() and self._search_count <= 2:
            for host, port in self.bootstrap_nodes[:1]:
                try:
                    ip = socket.gethostbyname(host)
                    await self._send_get_peers(ip, port, self.atlas_infohash)
                    queries_sent += 1
                    await asyncio.sleep(0.1)
                except Exception:
                    pass

        if is_startup_mode() or announced_count >= 3 or (self._search_count % 5 == 1 and queries_sent > 0):
            self.logger.initialization("DHT", f"Sent {queries_sent} queries, announced to {announced_count} nodes with tokens")

    async def _discovery_loop(self):
        while self.running:
            try:
                from pymodules.__atlas_startup_mode import is_p2p_discovery_enabled

                if not is_p2p_discovery_enabled():
                    await asyncio.sleep(5)
                    continue

                await self._search_atlas_peers()

                uptime = time.time() - getattr(self, "start_time", time.time())
                if uptime < 600:
                    await asyncio.sleep(30)
                else:
                    await asyncio.sleep(300)
            except Exception as e:
                self.logger.technical_info(f"Discovery loop error: {e}")
                await asyncio.sleep(30)

    async def _maintenance_loop(self):
        while self.running:
            try:
                current_time = time.time()

                expired = [tid for tid, t in self.transactions.items() if current_time - t.get("time", 0) > 60]
                for tid in expired:
                    del self.transactions[tid]

                expired_tokens = [ip for ip, ts in self.token_timestamp.items() if current_time - ts > 1200]
                for ip in expired_tokens:
                    self.tokens.pop(ip, None)
                    self.token_timestamp.pop(ip, None)

                expired_peers = [key for key, peer in self.discovered_peers.items() if current_time - peer.last_seen > 600]
                for key in expired_peers:
                    del self.discovered_peers[key]

                if random.random() < 0.3:
                    random_id = os.urandom(20)
                    closest = self._get_closest_nodes(random_id, k=8)
                    for node in closest:
                        await self._send_find_node(node.ip, node.port, random_id)

                current_time = time.time()
                if current_time - self.last_bootstrap_time >= 3600:
                    await self._bootstrap()
                    self.last_bootstrap_time = current_time

                await asyncio.sleep(30)

            except Exception as e:
                self.logger.technical_info(f"Maintenance error: {e}")
                await asyncio.sleep(60)

    def add_peer_discovered_callback(self, callback: Callable[[DiscoveredPeer], None]):
        self.peer_discovered_callbacks.append(callback)

    def get_discovered_peers(self) -> List[str]:
        return list(self.discovered_peers.keys())

    def get_fresh_peers(self, max_age_seconds: int = 300) -> List[str]:
        current_time = time.time()
        fresh_peers = []

        for peer_key, peer in self.discovered_peers.items():
            if current_time - peer.last_seen <= max_age_seconds:
                fresh_peers.append(peer_key)

        return fresh_peers

    def get_invalid_peers_count(self) -> int:
        return len(self.invalid_peers_cache)

    def clear_invalid_cache(self):
        self.invalid_peers_cache.clear()
        self._save_invalid_peers_cache()
        self.logger.maintenance("Cleared invalid peers cache")

    def get_stats(self) -> dict:
        total_nodes = sum(len(b) for b in self.routing_table)

        return {"running": self.running, "node_id": self.node_id.hex()[:16], "port": self.port, "external_ip": self.external_ip, "routing_table_size": total_nodes, "discovered_peers": len(self.discovered_peers), "invalid_peers_cached": len(self.invalid_peers_cache), "active_transactions": len(self.transactions), "atlas_infohash": self.atlas_infohash.hex()}
