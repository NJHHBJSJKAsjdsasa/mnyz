# pymodules/__atlas_p2pv2_logger.py

import logging
import os
import threading
from datetime import datetime
from typing import Optional


class AtlasP2PLogger:

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            with cls._lock:
                if not cls._instance:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, data_dir: str = "p2p_data", component: str = "P2P", log_level: str = "INFO"):
        if hasattr(self, "_initialized"):
            return

        self.data_dir = data_dir
        self.component = component
        os.makedirs(data_dir, exist_ok=True)

        env_level = os.environ.get("P2P_LOG_LEVEL", log_level).upper()

        level_map = {"DEBUG": logging.DEBUG, "INFO": logging.INFO, "WARNING": logging.WARNING, "ERROR": logging.ERROR, "CRITICAL": logging.CRITICAL}

        file_log_level = level_map.get(env_level, logging.INFO)

        self.logger = logging.getLogger("atlas_p2p")
        self.logger.setLevel(logging.DEBUG)

        if self.logger.handlers:
            return

        default_data_dir = os.getenv("ATLAS_P2P_DATA_DIR", os.path.join("internal_data", "p2p"))
        internal_logs = os.path.join("internal_data", "logs")
        if os.path.normpath(data_dir) == os.path.normpath(default_data_dir) and os.path.exists(internal_logs):
            log_file = os.path.join(internal_logs, "p2p.log")
        else:
            # Separate data dir (e.g. a second instance) keeps its own log.
            log_file = os.path.join(data_dir, "atlas_p2p.log")

        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(file_log_level)

        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.ERROR)

        file_format = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

        console_format = logging.Formatter("%(message)s")

        file_handler.setFormatter(file_format)
        console_handler.setFormatter(console_format)

        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)

        self._initialized = True

    def peer_connected(self, peer_key: str, node_id: str, details: Optional[str] = None):
        msg = f"🪐 Atlas Multiverse Discovered: {peer_key} ({node_id})"
        print(msg)
        self.logger.info(msg)

    def peer_disconnected(self, peer_key: str, node_id: str = "", reason: str = "inactive"):
        if node_id:
            msg = f"Atlas Multiverse Lost: {peer_key} ({node_id}) - {reason}"
        else:
            msg = f"Atlas Multiverse Lost: {peer_key} - {reason}"
        print(msg)
        self.logger.info(msg)

    def critical_error(self, message: str):
        self.logger.error(f"{message}")

    def system_ready(self, message: str):
        msg = f"🚀 {message}"
        print(msg)
        self.logger.info(msg)

    def debug(self, message: str):
        self.logger.debug(f"[DEBUG] {message}")

    def technical_info(self, message: str):
        # INFO: level 15 sat below the file handler's INFO threshold, so every
        # handshake decision (peer skipped, connection outcome) was invisible.
        self.logger.info(f"[TECH] {message}")

    def maintenance(self, message: str):
        # INFO: ban migrations/cleanups must be visible in the default log file.
        self.logger.info(f"[MAINT] {message}")

    def security_alert(self, message: str):
        # WARNING: the previous level 15 sat below the file handler's INFO threshold,
        # so security incidents were never written to p2p.log.
        self.logger.warning(f"[SECURITY] {message}")

    def handshake_detail(self, request_id: str, peer_key: str, message: str):
        self.logger.debug(f"[{request_id}] {peer_key}: {message}")

    def initialization(self, component: str, message: str):
        self.logger.info(f"[INIT] {component}: {message}")

    def discovery_detail(self, message: str):
        self.logger.debug(f"[DHT] {message}")

    def crypto_detail(self, message: str):
        self.logger.debug(f"[CRYPTO] {message}")

    def get_log_file_path(self) -> str:
        return os.path.join(self.data_dir, "atlas_p2p.log")

    def clear_logs(self):
        log_file = self.get_log_file_path()
        if os.path.exists(log_file):
            os.remove(log_file)
            self.technical_info("Log file cleared")

    def get_recent_logs(self, lines: int = 50) -> list:
        log_file = self.get_log_file_path()
        if not os.path.exists(log_file):
            return []

        try:
            with open(log_file, "r", encoding="utf-8") as f:
                return f.readlines()[-lines:]
        except Exception:
            return []


_p2p_logger = None


def get_p2p_logger(data_dir: str = "p2p_data", log_level: str = "INFO") -> AtlasP2PLogger:
    global _p2p_logger
    if _p2p_logger is None:
        _p2p_logger = AtlasP2PLogger(data_dir, log_level=log_level)
    return _p2p_logger


def log_peer_connected(peer_key: str, node_id: str, details: str = None):
    get_p2p_logger().peer_connected(peer_key, node_id, details)


def log_peer_disconnected(peer_key: str, node_id: str = "", reason: str = "inactive"):
    get_p2p_logger().peer_disconnected(peer_key, node_id, reason)


def log_critical(message: str):
    get_p2p_logger().critical_error(message)


def log_debug(message: str):
    get_p2p_logger().debug(message)


def log_technical(message: str):
    get_p2p_logger().technical_info(message)


def log_maintenance(message: str):
    get_p2p_logger().maintenance(message)


def log_security(message: str):
    get_p2p_logger().security_alert(message)


def log_init(component: str, message: str):
    get_p2p_logger().initialization(component, message)
