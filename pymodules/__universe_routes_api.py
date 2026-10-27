# pymodules/__universe_routes.py

import random
import json
import os
import time
import html
from pathlib import Path

from flask import jsonify, request, redirect, url_for, session, render_template

from pymodules.__atlas_fixed_vars import P2P_DATA_DIR, RUN
from pymodules.__atlas_redis_cache import redis_cache


def register_universe_routes(app, universe, config):
    from pymodules.__universe_routes_uip import get_universe

    @app.route("/api/universe/config")
    def get_universe_config():
        try:
            if not config.is_initialized:
                if not config.initialize():
                    return jsonify({"error": "配置未初始化"})

            # Deliberately not cached: config.seed/cosmic_origin_time change per
            # session in remote mode, so a shared key would leak another universe.
            response_data = {"success": True, "config_seed": config.seed, "seed_str": config.seed_str, "seed_hash": config.seed_hash, "seed_decimal": str(config.seed), "cosmic_origin_time": config.cosmic_origin_time, "cosmic_origin_datetime": str(config.cosmic_origin_datetime)}

            return jsonify(response_data)
        except Exception as e:
            return jsonify({"error": str(e)})

    @app.route("/api/generate-random-location", methods=["GET"])
    def generate_random_location():
        try:
            x = random.randint(0, 10000000)
            y = random.randint(0, 10000000)
            z = random.randint(0, 10000000)

            universe = get_universe()
            galaxy_data = {"name": f"Galaxy {x},{y},{z}", "galaxy_type": "Unknown", "num_systems": 0}
            system_data = None

            if universe:
                # Try to get galaxy from cache
                cache_key = f"galaxy:{x}:{y}:{z}"
                cached_galaxy = redis_cache.get(cache_key)

                if cached_galaxy:
                    galaxy_data = cached_galaxy
                else:
                    try:
                        galaxy = universe.get_galaxy(x, y, z)
                        galaxy_data = {
                            "name": galaxy.name,
                            "galaxy_type": galaxy.galaxy_type,
                            "num_systems": galaxy.num_systems
                        }
                        # Cache galaxy data for 1 hour
                        redis_cache.set(cache_key, galaxy_data, 3600)
                    except Exception:
                        pass

            # Create response data
            response_data = {"success": True, "coordinates": {"x": x, "y": y, "z": z}, "galaxy_name": galaxy_data["name"], "galaxy_type": galaxy_data["galaxy_type"], "num_systems": galaxy_data["num_systems"], "navigation_data": {"x": x, "y": y, "z": z}}

            if universe:
                rand = random.random()

                if rand > 0.05 and galaxy_data["num_systems"] > 0:
                    random_system = random.randint(0, galaxy_data["num_systems"] - 1)
                    
                    # Try to get system from cache
                    system_cache_key = f"system:{x}:{y}:{z}:{random_system}"
                    cached_system = redis_cache.get(system_cache_key)

                    if cached_system:
                        system_data = cached_system
                    else:
                        try:
                            system = universe.get_galaxy(x, y, z).get_solar_system(random_system)
                            system_data = {
                                "name": system.name,
                                "planets": [planet.name for planet in system.planets.values()]
                            }
                            # Cache system data for 1 hour
                            redis_cache.set(system_cache_key, system_data, 3600)
                        except Exception:
                            pass

                    if system_data:
                        response_data["system_name"] = system_data["name"]
                        response_data["system_index"] = random_system
                        response_data["navigation_data"]["system"] = random_system

                        if rand > 0.15 and system_data.get("planets"):
                            planets_list = []
                            for planet_name in system_data["planets"]:
                                planets_list.append({"name": planet_name})

                            if planets_list:
                                random_planet = random.choice(planets_list)
                                response_data["planet_name"] = random_planet["name"]
                                response_data["navigation_data"]["planet"] = random_planet["name"]

            return jsonify(response_data)

        except Exception as e:
            # Even if there's an error, return random coordinates
            x = random.randint(0, 10000000)
            y = random.randint(0, 10000000)
            z = random.randint(0, 10000000)
            return jsonify({"success": True, "coordinates": {"x": x, "y": y, "z": z}, "galaxy_name": f"Galaxy {x},{y},{z}", "galaxy_type": "Unknown", "num_systems": 0, "navigation_data": {"x": x, "y": y, "z": z}})

    @app.route("/api/system-intel", methods=["GET"])
    def system_intel():
        """Real planet composition for a coordinate + system index.

        Used by the in-game intel purchase: the client asks about a nearby system
        and shows actual planet types/elements, so the hint is never fabricated.
        """
        try:
            x = int(request.args.get("x", 0))
            y = int(request.args.get("y", 0))
            z = int(request.args.get("z", 0))
            wanted = int(request.args.get("system", 0))

            universe = get_universe()
            if not universe:
                return jsonify({"success": False, "error": "universe unavailable"})

            galaxy = universe.get_galaxy(x, y, z)
            total = int(getattr(galaxy, "num_systems", 0) or 0)
            if total <= 0:
                return jsonify({"success": True, "empty": True, "galaxy": {"name": galaxy.name, "num_systems": 0}, "planets": []})

            index = max(0, min(total - 1, wanted))
            system = galaxy.get_solar_system(index)

            planets = []
            for planet in list(system.planets.values())[:8]:
                planets.append(
                    {
                        "name": planet.name,
                        "planet_type": getattr(planet, "planet_type", "Unknown"),
                        "elements": list(getattr(planet, "elements", []))[:6],
                        "life_forms": getattr(planet, "life_forms", "None"),
                    }
                )

            return jsonify(
                {
                    "success": True,
                    "coordinates": {"x": x, "y": y, "z": z},
                    "galaxy": {"name": galaxy.name, "num_systems": total},
                    "system": {"index": index, "name": system.name},
                    "planets": planets,
                }
            )
        except Exception as e:
            return jsonify({"success": False, "error": str(e)})

    @app.route("/api/random-jump", methods=["POST"])
    def handle_random_jump():
        try:
            x = int(request.form["x"])
            y = int(request.form["y"])
            z = int(request.form["z"])

            universe = get_universe()
            
            if universe:
                try:
                    galaxy = universe.get_galaxy(x, y, z)
                    session["galaxy"] = {
                        "seed": galaxy.seed,
                        "name": galaxy.name,
                        "constants": galaxy.constants.__dict__,
                        "galaxy_type": galaxy.galaxy_type,
                        "coordinates": (x, y, z),
                    }
                except Exception:
                    # If galaxy can't be retrieved, set minimal galaxy info
                    session["galaxy"] = {
                        "seed": f"{x}{y}{z}",
                        "name": f"Galaxy {x},{y},{z}",
                        "constants": {},
                        "galaxy_type": "Unknown",
                        "coordinates": (x, y, z),
                    }
            else:
                # If universe is not initialized, set minimal galaxy info
                session["galaxy"] = {
                    "seed": f"{x}{y}{z}",
                    "name": f"Galaxy {x},{y},{z}",
                    "constants": {},
                    "galaxy_type": "Unknown",
                    "coordinates": (x, y, z),
                }

            system_index = request.form.get("system")
            planet_name = request.form.get("planet")

            if system_index:
                system_idx = int(system_index)
                session["system"] = system_idx

                if planet_name:
                    return redirect(url_for("view_planet", planet_name=planet_name))
                else:
                    return redirect(url_for("view_system", system_index=system_idx))
            else:
                session["system"] = None
                return redirect(url_for("view_galaxy"))

        except Exception as e:
            # Even if there's an error, redirect to galaxy view with coordinates
            try:
                x = int(request.form["x"])
                y = int(request.form["y"])
                z = int(request.form["z"])
            except Exception:
                x = random.randint(0, 10000000)
                y = random.randint(0, 10000000)
                z = random.randint(0, 10000000)
            
            session["galaxy"] = {
                "seed": f"{x}{y}{z}",
                "name": f"Galaxy {x},{y},{z}",
                "constants": {},
                "galaxy_type": "Unknown",
                "coordinates": (x, y, z),
            }
            session["system"] = None
            return redirect(url_for("view_galaxy"))

    @app.route("/api/multiverse/peers")
    def get_multiverse_peers():
        try:
            # Try to get from cache
            cache_key = "multiverse:peers"
            cached_data = redis_cache.get(cache_key)
            if cached_data:
                return jsonify(cached_data)

            # Follows --data-dir so a second instance reports its own peer list.
            peers_file = Path(P2P_DATA_DIR) / "known_peers.json"

            if not peers_file.exists():
                # Not cached: the file appears as soon as P2P discovers a peer.
                response_data = {"success": False, "error": "Peers data not available", "peers": []}
                return jsonify(response_data), 404

            with open(peers_file, "r") as f:
                data = json.load(f)

            sanitized_peers = []

            if "peers" in data:
                peers_data = data.get("peers", [])
            elif "known_peers" in data:
                peers_data = list(data.get("known_peers", {}).values())
            else:
                peers_data = []

            for peer in peers_data:
                try:
                    peer_id = peer.get("peer_id") or peer.get("node_id", "unknown")
                    seed_value = peer.get("seed", 0)

                    seed_value = str(seed_value)

                    last_seen = peer.get("last_seen") or peer.get("last_connected", 0)
                    cosmic_origin = peer.get("cosmic_origin_time", 0)

                    status = peer.get("status", "unknown").upper()
                    if status == "ACTIVE":
                        status = "ACTIVE"
                    else:
                        status = "INACTIVE"

                    sanitized_peer = {"peer_id": html.escape(str(peer_id)[:100]), "seed": seed_value, "cosmic_origin_time": float(cosmic_origin), "last_seen": int(last_seen), "status": status}

                    if seed_value == "1.618033988749895":
                        sanitized_peer["seed_name"] = "Core Continuum"
                    else:
                        sanitized_peer["seed_name"] = "Atlas Multiverse"

                    valid_statuses = ["ACTIVE", "INACTIVE", "STALE", "ARCHIVED"]
                    if sanitized_peer["status"] not in valid_statuses:
                        sanitized_peer["status"] = "UNKNOWN"

                    sanitized_peers.append(sanitized_peer)

                except (ValueError, TypeError) as e:
                    continue

            seed_groups = {}
            for peer in sanitized_peers:
                seed = peer["seed"]
                if seed not in seed_groups:
                    seed_groups[seed] = []
                seed_groups[seed].append(peer)

            processed_groups = []
            for seed, peers in seed_groups.items():
                peers.sort(key=lambda x: x["cosmic_origin_time"])

                group_data = {"seed": seed, "seed_name": peers[0]["seed_name"], "cosmic_origin_time": peers[0]["cosmic_origin_time"], "count": len(peers), "peers": peers}
                processed_groups.append(group_data)

            def sort_key(group):
                if group["seed_name"] == "Core Continuum":
                    return (0, -max(p["last_seen"] for p in group["peers"]))
                else:
                    return (1, -max(p["last_seen"] for p in group["peers"]))

            processed_groups.sort(key=sort_key)

            response_data = {"success": True, "groups": processed_groups, "total_peers": len(sanitized_peers), "timestamp": int(time.time())}

            # Cache the result for 5 minutes
            redis_cache.set(cache_key, response_data, 300)

            return jsonify(response_data)

        except Exception as e:
            return jsonify({"success": False, "error": f"获取节点数据失败: {str(e)}", "peers": []}), 500
