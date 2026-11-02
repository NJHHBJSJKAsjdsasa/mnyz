// atlas-ui/react/static/js/Components/GalaxyNavigation.tsx
import React, { useState, useEffect, useRef } from "react";
import { SpaceshipTravelManager } from "../Utils/SpaceshipTravelCosts.tsx";
import LevelStepper from "../Shell/LevelStepper.tsx";

interface Galaxy {
  name: string;
  coordinates: number[];
}

interface GalaxyNavigationProps {
  currentGalaxy: Galaxy;
}

const GalaxyNavigation: React.FC<GalaxyNavigationProps> = ({ currentGalaxy }) => {
  const [hasPrev, setHasPrev] = useState<boolean>(false);
  const [hasNext, setHasNext] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  /**
   * Which step is waiting for confirmation.
   *
   * A galaxy hop spends fuel and replaces the whole galaxy — there is no undo, and
   * the button used to fire on the first click with nothing but a coordinate pair
   * printed on it. Now the first click arms it (amber, "确认跳跃"), the second
   * within `ARM_MS` commits. Losing a jump to a mis-click on "137·42·10" costs a
   * refuel; that is worth one extra click.
   */
  const [armed, setArmed] = useState<"prev" | "next" | null>(null);
  const armTimer = useRef<number | null>(null);

  const MAX_COORDINATE = 10000000;
  const ARM_MS = 4000;

  useEffect(() => {
    const [x, y, z] = currentGalaxy.coordinates;

    const canGoPrev = !(x === 0 && y === 0 && z === 0);

    const canGoNext = !(x === MAX_COORDINATE && y === MAX_COORDINATE && z === MAX_COORDINATE);

    setHasPrev(canGoPrev);
    setHasNext(canGoNext);
    setLoading(false);
  }, [currentGalaxy.coordinates]);

  const formatCoordinates = (coords: number[]) => {
    return `(${coords.join(", ")})`;
  };

  const getPreviousCoordinates = (): number[] => {
    const [x, y, z] = currentGalaxy.coordinates;

    if (z > 0) {
      return [x, y, z - 1];
    } else if (y > 0) {
      return [x, y - 1, MAX_COORDINATE];
    } else if (x > 0) {
      return [x - 1, MAX_COORDINATE, MAX_COORDINATE];
    }

    return [0, 0, 0];
  };

  const getNextCoordinates = (): number[] => {
    const [x, y, z] = currentGalaxy.coordinates;

    if (z < MAX_COORDINATE) {
      return [x, y, z + 1];
    } else if (y < MAX_COORDINATE) {
      return [x, y + 1, 0];
    } else if (x < MAX_COORDINATE) {
      return [x + 1, 0, 0];
    }

    return [MAX_COORDINATE, MAX_COORDINATE, MAX_COORDINATE];
  };

  /** First click arms, second click within ARM_MS commits. */
  const step = (direction: "prev" | "next", target: number[], allowed: boolean, go: () => void) => {
    if (!allowed || busy) return;
    if (armed === direction) {
      setArmed(null);
      if (armTimer.current) window.clearTimeout(armTimer.current);
      go();
      return;
    }
    setArmed(direction);
    if (armTimer.current) window.clearTimeout(armTimer.current);
    armTimer.current = window.setTimeout(() => setArmed(null), ARM_MS);
  };

  useEffect(() => {
    return () => {
      if (armTimer.current) window.clearTimeout(armTimer.current);
    };
  }, []);

  /** One jump: charge, then hand the target to the page router. */
  const jump = async (target: number[], allowed: boolean) => {
    if (!allowed || busy) return;
    setBusy(true);
    try {
      // chargeTravel explains a refusal itself (燃料不足 / 航行被拒绝) — before
      // 2026-10-30 this branch returned silently, which read as "按钮没反应".
      const outcome = await SpaceshipTravelManager.chargeTravel(
        "galaxy",
        currentGalaxy.coordinates,
        target,
        1
      );
      if (outcome === "emergency") return;

      const [x, y, z] = target;
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/navigate";
      for (const [name, value] of [
        ["x", x],
        ["y", y],
        ["z", z],
      ] as const) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } finally {
      // The form submit navigates away; this only runs if it did not.
      setBusy(false);
    }
  };

  if (loading) {
    return null;
  }

  const prevCoords = getPreviousCoordinates();
  const nextCoords = getNextCoordinates();

  const cost = SpaceshipTravelManager.previewTravelCost("galaxy", 1);

  return (
    <LevelStepper
      prevLabel={armed === "prev" ? "确认跳跃" : hasPrev ? prevCoords.join("·") : null}
      nextLabel={armed === "next" ? "确认跳跃" : hasNext ? nextCoords.join("·") : null}
      prevTitle={
        !hasPrev
          ? "已到宇宙边界"
          : armed === "prev"
            ? `再点一次跳到 (${prevCoords.join(", ")})，消耗 ${cost}`
            : `跳到相邻星系 (${prevCoords.join(", ")}) · 消耗 ${cost}`
      }
      nextTitle={
        !hasNext
          ? "已到宇宙边界"
          : armed === "next"
            ? `再点一次跳到 (${nextCoords.join(", ")})，消耗 ${cost}`
            : `跳到相邻星系 (${nextCoords.join(", ")}) · 消耗 ${cost}`
      }
      onPrev={() => step("prev", prevCoords, hasPrev, () => void jump(prevCoords, hasPrev))}
      onNext={() => step("next", nextCoords, hasNext, () => void jump(nextCoords, hasNext))}
      busy={busy}
      armedPrev={armed === "prev"}
      armedNext={armed === "next"}
      hint={armed ? `再点一次确认 · ${cost}` : "相邻星系"}
    />
  );
};

export default GalaxyNavigation;
