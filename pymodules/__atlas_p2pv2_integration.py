# pymodules/__atlas_p2pv2_integration.py

import os
import json
import time
import asyncio
import threading
from typing import Optional, Dict, Any
from flask import Flask, request, jsonify

from pymodules.__atlas_fixed_vars import PORT, P2P_DATA_DIR, get_external_p2p_port
from pymodules.__atlas_p2pv2_routes import initialize_p2p_routes, get_p2p_routes, start_p2p_discovery, stop_p2p_discovery

p2p_routes = None
p2p_thread = None
p2p_loop = None
p2p_discovery_started = False


def initialize_p2pv2_system(app: Flask):
    global p2p_routes, p2p_thread, p2p_loop, p2p_discovery_started

    if p2p_routes is not None and p2p_discovery_started:
        return p2p_routes
    elif p2p_routes is not None and not p2p_discovery_started:
        return start_p2p_discovery_if_needed()

    try:
        import os

        os.makedirs("internal_data/logs", exist_ok=True)
        os.makedirs(P2P_DATA_DIR, exist_ok=True)

        from pymodules.__atlas_p2pv2_routes import get_p2p_routes

        p2p_routes = get_p2p_routes()

        if p2p_routes is None:
            p2p_routes = initialize_p2p_routes(app, P2P_DATA_DIR)
            register_p2pv2_api(app)

        discovery_ready = threading.Event()
        discovery_success = threading.Event()

        def run_discovery():
            global p2p_loop
            p2p_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(p2p_loop)

            async def discovery_main():
                try:
                    discovery_ready.set()
                    success = await start_p2p_discovery()
                    if success:
                        discovery_success.set()
                        while True:
                            await asyncio.sleep(1)
                    else:
                        print("      Failed to start P2P discovery")
                except Exception as e:
                    print(f"      P2P discovery error: {e}")

            p2p_loop.run_until_complete(discovery_main())

        p2p_thread = threading.Thread(target=run_discovery, daemon=True)
        p2p_thread.start()
        if discovery_ready.wait(timeout=2):
            time.sleep(0.5)
            p2p_discovery_started = True

        return p2p_routes

    except Exception as e:
        print(f"Failed to initialize P2P system: {e}")
        p2p_routes = None
        return None


def start_p2p_discovery_if_needed():
    global p2p_routes, p2p_thread, p2p_loop, p2p_discovery_started

    if p2p_discovery_started or p2p_routes is None:
        return p2p_routes

    try:
        discovery_ready = threading.Event()

        def run_discovery():
            global p2p_loop
            p2p_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(p2p_loop)

            async def discovery_main():
                try:
                    discovery_ready.set()
                    success = await start_p2p_discovery()
                    if success:
                        while True:
                            await asyncio.sleep(1)
                    else:
                        print("      Failed to start P2P discovery (post-onboarding)")
                except Exception as e:
                    print(f"      P2P discovery error (post-onboarding): {e}")

            p2p_loop.run_until_complete(discovery_main())

        p2p_thread = threading.Thread(target=run_discovery, daemon=True)
        p2p_thread.start()
        if discovery_ready.wait(timeout=1):
            time.sleep(0.2)
            p2p_discovery_started = True
            print("P2P discovery started after onboarding")

        return p2p_routes

    except Exception as e:
        print(f"Failed to start P2P discovery: {e}")
        return p2p_routes


def register_p2pv2_api(app: Flask):

    @app.route("/api/p2pv2/status")
    def p2pv2_status():
        if not p2p_routes:
            return jsonify({"error": "P2P v2 system not initialized"}), 503

        status = p2p_routes.get_status()
        return jsonify(status)

    @app.route("/api/p2pv2/peers")
    def p2pv2_peers():
        if not p2p_routes:
            return jsonify({"error": "P2P v2 system not available"}), 503

        try:
            status = p2p_routes.get_status()

            return jsonify({"known_peers": len(status.get("known_peers", {}).get("total_known_peers", 0)), "discovered_peers": len(status.get("discovery_stats", {}).get("discovered_peers", 0)), "failed_peers": status.get("failed_peers", {}).get("total_failed_peers", 0), "system_info": {"node_id": status.get("node_id", "unknown")[:16] + "...", "uptime": status.get("uptime", 0), "discovery_enabled": status.get("discovery_enabled", False), "external_ip": status.get("external_ip", "unknown")}})

        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/p2pv2/detailed")
    def p2pv2_detailed():
        if not p2p_routes:
            return jsonify({"error": "P2P v2 system not available"}), 503

        try:
            return jsonify(p2p_routes.get_status())

        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/p2pv2/stats")
    def p2pv2_stats():
        if not p2p_routes:
            return jsonify({"error": "P2P v2 system not available"}), 503

        try:
            status = p2p_routes.get_status()
            stats = status.get("statistics", {})

            return jsonify({"messages_sent": stats.get("messages_sent", 0), "messages_received": stats.get("messages_received", 0), "connections_attempted": stats.get("connections_attempted", 0), "connections_successful": stats.get("connections_successful", 0), "connections_failed": stats.get("connections_failed", 0), "handshakes_completed": stats.get("handshakes_completed", 0), "handshakes_failed": stats.get("handshakes_failed", 0), "peers_discovered": stats.get("peers_discovered", 0), "uptime": status.get("uptime", 0), "running": status.get("running", False)})

        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/p2pv2/broadcast", methods=["POST"])
    def p2pv2_broadcast():
        if not p2p_routes:
            return jsonify({"error": "P2P v2 system not available"}), 503

        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "No data provided"}), 400

            message_type = data.get("message_type", "atlas_message")
            payload = data.get("payload", {})

            if p2p_loop:
                future = asyncio.run_coroutine_threadsafe(p2p_routes.broadcast_message(message_type, payload), p2p_loop)
                sent_count = future.result(timeout=5)

                return jsonify({"message": "Broadcast sent", "message_type": message_type, "sent_to_peers": sent_count})
            else:
                return jsonify({"error": "P2P system not ready"}), 503

        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/p2pv2/network")
    def p2pv2_network():
        if not p2p_routes:
            return jsonify({"error": "P2P v2 system not available"}), 503

        try:
            status = p2p_routes.get_status()

            network_info = {"node_id": status.get("node_id", "unknown"), "external_ip": status.get("external_ip", "unknown"), "port": status.get("port", get_external_p2p_port()), "discovery_enabled": status.get("discovery_enabled", False), "system_status": "running" if status.get("running", False) else "stopped"}

            return jsonify(network_info)

        except Exception as e:
            return jsonify({"error": str(e)}), 500


def get_p2pv2_routes():
    return p2p_routes


def is_p2pv2_enabled() -> bool:
    return p2p_routes is not None and p2p_routes.running


def sync_atlas_universe_data_v2(universe):
    if not is_p2pv2_enabled():
        return False

    try:
        universe_config = {"version": getattr(universe, "version", "1.0"), "seed": getattr(universe, "seed", None), "timestamp": time.time(), "p2p_version": "2.0"}

        if p2p_routes and p2p_loop:
            future = asyncio.run_coroutine_threadsafe(p2p_routes.broadcast_message("atlas_universe_sync", universe_config), p2p_loop)
            sent_count = future.result(timeout=5)
            print(f"Universe data synced to {sent_count} peers")
            return sent_count > 0
        else:
            print(f"Universe data prepared (no peers available)")
            return True

    except Exception as e:
        print(f"Failed to sync universe data with P2P v2: {e}")
        return False


def sync_planet_data_v2(planet_id: str, planet_data: dict):
    if not is_p2pv2_enabled():
        return False

    try:
        sync_data = {"planet_id": planet_id, "basic_info": {"type": planet_data.get("type"), "size": planet_data.get("size"), "atmosphere": planet_data.get("atmosphere"), "temperature": planet_data.get("temperature")}, "last_updated": time.time(), "p2p_version": "2.0"}

        print(f"Planet data prepared for P2P v2 sync: {planet_id}")
        return True

    except Exception as e:
        print(f"Failed to sync planet data with P2P v2: {e}")
        return False


def get_shared_planets_v2() -> list:
    if not is_p2pv2_enabled():
        return []

    try:
        return []

    except Exception as e:
        print(f"Failed to get shared planets from P2P v2: {e}")
        return []


def cleanup_p2pv2_system():
    global p2p_routes, p2p_loop

    if p2p_routes and p2p_loop:
        print("Shutting down P2P v2 system...")
        try:
            future = asyncio.run_coroutine_threadsafe(stop_p2p_discovery(), p2p_loop)
            future.result(timeout=5)
        except Exception as e:
            print(f"Error during P2P shutdown: {e}")

        p2p_routes = None
        p2p_loop = None
        print("P2P v2 system shut down")
