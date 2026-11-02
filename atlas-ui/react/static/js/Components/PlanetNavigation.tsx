// atlas-ui/react/static/js/Components/PlanetNavigation.tsx
import React, { useState, useEffect } from "react";
import { markPlanetAsVisited, markSystemAsVisited } from "../Utils/VisitHistory.tsx";
import { SpaceshipTravelManager } from "../Utils/SpaceshipTravelCosts.tsx";
import { go } from "../Utils/PageNavigation.ts";
import LevelStepper from "../Shell/LevelStepper.tsx";

interface Planet {
  name: string;
}

interface System {
  name: string;
  index: number;
  planets?: Planet[];
}

interface Galaxy {
  coordinates: number[];
}

interface PlanetNavigationProps {
  currentPlanet: string;
  system: System;
  galaxy: Galaxy;
  systemPlanets: Planet[];
}

const PlanetNavigation: React.FC<PlanetNavigationProps> = ({ currentPlanet, system, galaxy, systemPlanets }) => {
  const [prevPlanet, setPrevPlanet] = useState<string | null>(null);
  const [nextPlanet, setNextPlanet] = useState<string | null>(null);
  const [hasPrev, setHasPrev] = useState<boolean>(false);
  const [hasNext, setHasNext] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (systemPlanets && systemPlanets.length > 0) {
      const currentIndex = systemPlanets.findIndex((p) => p.name.toLowerCase() === currentPlanet.toLowerCase());

      if (currentIndex !== -1) {
        if (currentIndex > 0) {
          setPrevPlanet(systemPlanets[currentIndex - 1].name.toLowerCase());
          setHasPrev(true);
        } else {
          if (system.index > 0) {
            setPrevPlanet("__prev_system__");
            setHasPrev(true);
          } else {
            setHasPrev(false);
          }
        }

        if (currentIndex < systemPlanets.length - 1) {
          setNextPlanet(systemPlanets[currentIndex + 1].name.toLowerCase());
          setHasNext(true);
        } else {
          setNextPlanet("__next_system__");
          setHasNext(true);
        }
      } else {
        setHasPrev(false);
        setHasNext(false);
      }
    } else {
      setHasPrev(false);
      setHasNext(false);
    }

    setLoading(false);
  }, [currentPlanet, system.index, systemPlanets]);

  const formatName = (name: string) => {
    return name.replace(/_/g, " ");
  };

  // In-system moves keep the galaxy coordinates, but a server quote needs a
  // non-zero distance, so the target is nudged by one unit on the last axis.
  const travelTarget = (coords: number[]): number[] => {
    const [x, y, z] = coords;
    if (z < 10000000) return [x, y, z + 1];
    if (y < 10000000) return [x, y + 1, z];
    return [Math.min(10000000, x + 1), y, z];
  };

  const handlePrevious = async () => {
    const coordinates = galaxy.coordinates.join(",");

    if (prevPlanet === "__prev_system__") {
      const outcome = await SpaceshipTravelManager.chargeTravel(
        "system",
        galaxy.coordinates,
        travelTarget(galaxy.coordinates),
        1
      );
      if (outcome === "emergency") {
        return;
      }
      try {
        const response = await fetch(`/system/${system.index - 1}`, {
          headers: { Accept: "application/json" },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.system && data.system.planets && data.system.planets.length > 0) {
            const lastPlanet = data.system.planets[data.system.planets.length - 1];
            const planetName = lastPlanet.name.toLowerCase();

            markPlanetAsVisited(coordinates, system.index - 1, planetName, data.system.planets);
            markSystemAsVisited(coordinates, system.index - 1);

            void go(`/planet/${planetName}`);
            return;
          }
        }
        void go(`/system/${system.index - 1}`);
      } catch (error) {
        void go(`/system/${system.index - 1}`);
      }
    } else if (prevPlanet) {
      const outcome = await SpaceshipTravelManager.chargeTravel(
        "planet",
        galaxy.coordinates,
        travelTarget(galaxy.coordinates),
        1
      );
      if (outcome === "emergency") {
        return;
      }
      markPlanetAsVisited(coordinates, system.index, prevPlanet, systemPlanets);
      void go(`/planet/${prevPlanet}`);
    }
  };

  const handleNext = async () => {
    const coordinates = galaxy.coordinates.join(",");

    if (nextPlanet === "__next_system__") {
      const outcome = await SpaceshipTravelManager.chargeTravel(
        "system",
        galaxy.coordinates,
        travelTarget(galaxy.coordinates),
        1
      );
      if (outcome === "emergency") {
        return;
      }
      try {
        const response = await fetch(`/system/${system.index + 1}`, {
          headers: { Accept: "application/json" },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.system && data.system.planets && data.system.planets.length > 0) {
            const firstPlanet = data.system.planets[0];
            const planetName = firstPlanet.name.toLowerCase();

            markPlanetAsVisited(coordinates, system.index + 1, planetName, data.system.planets);
            markSystemAsVisited(coordinates, system.index + 1);

            void go(`/planet/${planetName}`);
            return;
          }
        }
        void go(`/system/${system.index + 1}`);
      } catch (error) {
        void go(`/system/${system.index + 1}`);
      }
    } else if (nextPlanet) {
      const outcome = await SpaceshipTravelManager.chargeTravel(
        "planet",
        galaxy.coordinates,
        travelTarget(galaxy.coordinates),
        1
      );
      if (outcome === "emergency") {
        return; // Travel failed
      }
      markPlanetAsVisited(coordinates, system.index, nextPlanet, systemPlanets);
      void go(`/planet/${nextPlanet}`);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <LevelStepper
      prevLabel={hasPrev ? "上一颗" : null}
      nextLabel={hasNext ? "下一颗" : null}
      prevTitle="上一颗行星（跨恒星系会消耗燃料）"
      nextTitle="下一颗行星（跨恒星系会消耗燃料）"
      onPrev={() => void handlePrevious()}
      onNext={() => void handleNext()}
      hint="行星"
    />
  );
};

export default PlanetNavigation;
