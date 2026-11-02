# pymodules/__universe_routes_pages.py

import os
import sys
from flask import render_template, request, redirect, url_for, session
from pymodules.__atlas_fixed_vars import VERSION, VERSION_HASH, RUN
from pymodules.__atlas_stargate import (
    generate_planet_url,
    generate_system_url,
    generate_galaxy_url,
    decode_url,
)


def register_universe_page_routes(app, universe, config):
    from pymodules.__universe_routes_uip import get_universe

    def safe_value(value):
        """Convert values to safe JSON serializable types"""
        if value is None:
            return None
        if isinstance(value, (int, float, bool, str)):
            return value
        if isinstance(value, (list, tuple)):
            return [safe_value(item) for item in value]
        if isinstance(value, dict):
            return {safe_value(k): safe_value(v) for k, v in value.items()}
        return str(value)

    def get_safe_universe_config():
        """Create a universe config dictionary with only safe JSON serializable values"""
        return {
            "remote": safe_value(config.remote),
            "seed_name": safe_value(config.seed_name),
            "node_id": safe_value(config.node_id),
            "seed_str": safe_value(config.seed_str),
            "cosmic_origin_time": safe_value(config.cosmic_origin_time),
        }
    
    def safe_serialize(obj):
        """Safely serialize any object to a JSON-compatible structure"""
        import json
        try:
            json.dumps(obj)
            return obj
        except (TypeError, ValueError):
            return safe_value(obj)

    def get_current_galaxy():
        universe = get_universe()
        if universe is None:
            return None
        galaxy_data = session.get("galaxy")
        if galaxy_data and "coordinates" in galaxy_data:
            try:
                coordinates = galaxy_data["coordinates"]
                if len(coordinates) == 3:
                    x, y, z = coordinates
                    galaxy = universe.get_galaxy(x, y, z)
                    return galaxy
            except Exception as e:
                print(f"Error retrieving current galaxy: {e}")
        return None

    def get_current_system():
        galaxy = get_current_galaxy()
        system_index = session.get("system")
        if galaxy and system_index is not None:
            try:
                return galaxy.get_solar_system(system_index)
            except Exception as e:
                print(f"Error retrieving current system: {e}")
        return None

    @app.route("/")
    def index():
        import __main__
        from pymodules.__atlas_startup_mode import is_p2p_discovery_enabled, set_startup_complete

        if not config.is_initialized or get_universe() is None:
            if os.path.exists("atlas.ini"):
                if __main__.RunAtlasProtocol():
                    if not is_p2p_discovery_enabled():
                        print()
                        print("✅ \033[1mAtlas Initialization Protocol Finished\033[0m")
                        print()
                        set_startup_complete()
            else:
                return redirect(url_for("onboarding"))

        universe_config = get_safe_universe_config()
        return render_template("index.html", version=VERSION, versionHash=VERSION_HASH, run_mode=RUN, universe_config=universe_config)

    @app.route("/onboarding", methods=["GET", "POST"])
    def onboarding():
        if os.path.exists("atlas.ini"):
            return redirect(url_for("index"))

        if request.method == "POST":
            universe_type = request.form.get("universe_type")
            custom_seed = request.form.get("custom_seed")

            if config.setup_universe(universe_type, custom_seed):
                import __main__
                from pymodules.__atlas_startup_mode import set_startup_complete

                if __main__.RunAtlasProtocol():
                    print()
                    print("✅ \033[1mAtlas Initialization Protocol Finished\033[0m")
                    print()
                    set_startup_complete()

                return redirect(url_for("index"))
            else:
                return render_template("onboarding.html", error="Failed to create configuration", run_mode=RUN)

        return render_template("onboarding.html", version=VERSION, versionHash=VERSION_HASH, run_mode=RUN)

    @app.route("/universe-faq")
    def universe_faq():
        universe_config = get_safe_universe_config()
        return render_template("faq.html", version=VERSION, versionHash=VERSION_HASH, run_mode=RUN, universe_config=universe_config)

    @app.route("/multiverse")
    def multiverse():
        universe_config = get_safe_universe_config()
        return render_template("multiverse.html", version=VERSION, versionHash=VERSION_HASH, run_mode=RUN, image_url="", universe_config=universe_config)

    @app.route("/navigate", methods=["POST"])
    def navigate():
        try:
            coordinates = request.form.get("coordinates")
            if coordinates:
                x, y, z = map(int, coordinates.split(","))
            else:
                x = int(request.form.get("x", 0))
                y = int(request.form.get("y", 0))
                z = int(request.form.get("z", 0))

            system_index = request.form.get("system")
            planet_name = request.form.get("planet")
            page = int(request.form.get("page", 1))
            galaxy = get_universe().get_galaxy(x, y, z)

            session["galaxy"] = {
                "seed": galaxy.seed,
                "name": galaxy.name,
                "constants": galaxy.constants.__dict__,
                "galaxy_type": galaxy.galaxy_type,
                "coordinates": (x, y, z),
            }

            if planet_name and system_index:
                session["system"] = int(system_index)
                return redirect(url_for("view_planet", planet_name=planet_name))
            elif system_index:
                session["system"] = int(system_index)
                return redirect(url_for("view_system", system_index=int(system_index)))
            else:
                session["system"] = None
                session[f"page_{galaxy.coordinates}"] = page
                return redirect(url_for("view_galaxy", page=page))

        except Exception as e:
            return render_template("error.html", message=f"Navigation failed: {str(e)}", run_mode=RUN)

    @app.route("/galaxy", defaults={"page": 1})
    @app.route("/galaxy/<int:page>")
    def view_galaxy(page):
        try:
            current_galaxy = get_current_galaxy()
            if not current_galaxy:
                return redirect(url_for("index"))

            session[f"page_{current_galaxy.coordinates}"] = page

            per_page = 150
            start = (page - 1) * per_page
            end = start + per_page
            finish = (current_galaxy.num_systems - 1) // 150 + 1

            systems = [
                {
                    "name": safe_value(current_galaxy.get_solar_system(i).name),
                    "index": safe_value(i),
                    "number": safe_value(i + 1),
                    "num_planets": safe_value(current_galaxy.get_solar_system(i).num_planets),
                }
                for i in range(start, min(end, current_galaxy.num_systems))
            ]

            next_page = page + 1 if end < current_galaxy.num_systems else None
            prev_page = page - 1 if start > 0 else None

            galaxy_url = generate_galaxy_url(current_galaxy.coordinates, page)

            universe_config = get_safe_universe_config()

            return render_template(
                "galaxy.html",
                galaxy=current_galaxy,
                image_url="",
                systems=systems,
                page=page,
                prev_page=prev_page,
                next_page=next_page,
                finish=finish,
                galaxy_url=galaxy_url,
                version=VERSION,
                versionHash=VERSION_HASH,
                run_mode=RUN,
                universe_config=universe_config,
            )
        except ValueError as ve:
            return render_template("error.html", message=str(ve), run_mode=RUN)
        except Exception as e:
            return render_template("error.html", message=f"An unexpected error occurred: {str(e)}", run_mode=RUN)

    @app.route("/system/<int:system_index>")
    def view_system(system_index):
        try:
            current_galaxy = get_current_galaxy()
            if not current_galaxy:
                return redirect(url_for("index"))

            session["system"] = system_index
            current_system = current_galaxy.get_solar_system(system_index)

            calculated_page = (system_index // 150) + 1

            session_page = session.get(f"page_{current_galaxy.coordinates}", None)
            if session_page is None:
                page = calculated_page
                session[f"page_{current_galaxy.coordinates}"] = page
            else:
                per_page = 150
                start = (session_page - 1) * per_page
                end = start + per_page
                if system_index < start or system_index >= end:
                    page = calculated_page
                    session[f"page_{current_galaxy.coordinates}"] = page
                else:
                    page = session_page

            system_url = generate_system_url(current_galaxy.coordinates, current_system.index, page)
            image_url = ""

            star_summary = [
                {
                    "Type": safe_value(star["Type"]),
                    "Color": safe_value(star["Color"]),
                    "Size": safe_value(f"{star['Radius Factor']:.2f} 太阳半径"),
                }
                for star in current_system.stars
            ]

            system_summary = {
                "Star System Type": safe_value(current_system.star_system_type.capitalize()),
                "Number of Planets": safe_value(current_system.num_planets),
                "Stars": star_summary,
            }

            if request.headers.get("Accept") == "application/json":
                from flask import jsonify

                planets_list = []
                for planet in current_system.planets.values():
                    planets_list.append({"name": planet.name})

                return jsonify({"system": {"name": current_system.name, "index": current_system.index, "planets": planets_list}, "galaxy": {"name": current_galaxy.name, "coordinates": current_galaxy.coordinates}})

            universe_config = get_safe_universe_config()

            return render_template(
                "system.html",
                system=current_system,
                galaxy=current_galaxy,
                image_url=image_url,
                summary=system_summary,
                system_index=system_index,
                system_url=system_url,
                version=VERSION,
                versionHash=VERSION_HASH,
                run_mode=RUN,
                page=page,
                cosmic_origin_time=safe_value(config.cosmic_origin_time),
                universe_config=universe_config,
            )
        except ValueError as e:
            return render_template("error.html", message=str(e), run_mode=RUN)
        except Exception as e:
            return render_template("error.html", message=f"An unexpected error occurred: {str(e)}", run_mode=RUN)

    @app.route("/planet/<planet_name>")
    def view_planet(planet_name):
        try:
            current_system = get_current_system()
            if not current_system:
                return redirect(url_for("view_galaxy"))

            current_galaxy = get_current_galaxy()
            planet_name = planet_name.lower()
            page = session.get(f"page_{current_galaxy.coordinates}", 1)

            for planet_index, planet in current_system.planets.items():
                if planet.name.lower() == planet_name:
                    session["planet"] = planet_index

                    image_url = ""
                    planet_url = generate_planet_url(current_galaxy.coordinates, current_system.index, planet_name, page)

                    planet_summary = {
                        "类型": safe_value(planet.planet_type),
                        "大气": safe_value(planet.atmosphere),
                        "质量": safe_value(f"{planet.mass:.2e} kg"),
                        "直径": safe_value(f"{planet.diameter:.2f} km"),
                        "重力": safe_value(f"{planet.gravity:.2f} m/s²"),
                        "轨道半径": safe_value(f"{planet.orbital_radius:.2f} AU"),
                        "轨道周期": safe_value(f"{planet.orbital_period_seconds / (365.25 * 24 * 3600):.2f} 年"),
                        # `surface_temperature` is Celsius; this label said "K", so every
                        # planet read ~273 degrees too cold. Show both — the number players
                        # compare against is Celsius, astronomers read kelvin.
                        "表面温度": safe_value(f"{planet.surface_temperature:.1f} °C"),
                        "元素": safe_value(", ".join(planet.elements)),
                        "生命形式": safe_value(planet.life_forms),
                    }

                    universe_config = get_safe_universe_config()

                    return render_template(
                        "planet.html",
                        planet=planet,
                        planet_index=planet_index,
                        system=current_system,
                        galaxy=current_galaxy,
                        image_url=image_url,
                        summary=planet_summary,
                        planet_url=planet_url,
                        version=VERSION,
                        versionHash=VERSION_HASH,
                        run_mode=RUN,
                        cosmic_origin_time=safe_value(config.cosmic_origin_time),
                        initial_angle_rotation=safe_value(planet.initial_angle_rotation),
                        universe_config=universe_config,
                    )

            return redirect(url_for("view_system", system_index=current_system.index))
        except Exception as e:
            return render_template("error.html", message=f"An unexpected error occurred: {str(e)}", run_mode=RUN)

    @app.route("/stargate/<encoded_url>", endpoint="stargate")
    def stargate(encoded_url):
        try:
            decoded_data = decode_url(encoded_url)
            if decoded_data is None:
                return redirect(url_for("index"))

            params = {}
            for param in decoded_data.split("&"):
                key, value = param.split("=")
                params[key] = value

            coordinates = params.get("coordinates")
            system_index = params.get("system")
            planet_name = params.get("planet")
            page = params.get("page", 1)

            x, y, z = map(int, coordinates.split(","))
            galaxy = get_universe().get_galaxy(x, y, z)
            session["galaxy"] = {
                "seed": galaxy.seed,
                "name": galaxy.name,
                "constants": galaxy.constants.__dict__,
                "galaxy_type": galaxy.galaxy_type,
                "coordinates": (x, y, z),
            }

            if not system_index and not planet_name:
                session[f"page_{galaxy.coordinates}"] = page
                return redirect(url_for("view_galaxy", page=page))
            elif system_index and not planet_name:
                session["system"] = int(system_index)
                return redirect(url_for("view_system", system_index=int(system_index)))
            elif system_index and planet_name:
                session["system"] = int(system_index)
                return redirect(url_for("view_planet", planet_name=planet_name))
            else:
                raise ValueError("Malformed URL")

        except Exception as e:
            print(f"Error: {e}")
            return redirect(url_for("index", error=str(e)))
