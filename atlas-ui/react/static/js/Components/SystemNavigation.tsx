// atlas-ui/react/static/js/Components/SystemNavigation.tsx
import React, { useState, useEffect } from "react";
import { markSystemAsVisited } from "../Utils/VisitHistory.tsx";
import { SpaceshipTravelManager } from "../Utils/SpaceshipTravelCosts.tsx";
import { go } from "../Utils/PageNavigation.ts";
import LevelStepper from "../Shell/LevelStepper.tsx";

interface System {
  name: string;
  index: number;
}

interface Galaxy {
  coordinates: number[];
}

interface SystemNavigationProps {
  currentSystem: System;
  galaxy: Galaxy;
}

const SystemNavigation: React.FC<SystemNavigationProps> = ({ currentSystem, galaxy }) => {
  const [hasPrev, setHasPrev] = useState<boolean>(false);
  const [hasNext, setHasNext] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setHasPrev(currentSystem.index > 0);
    setHasNext(true);
    setLoading(false);
  }, [currentSystem.index]);

  const handlePrevious = async () => {
    if (currentSystem.index > 0) {
      const distance = 1;

      if (!SpaceshipTravelManager.canAffordTravel("system", distance)) {
        SpaceshipTravelManager.executeTravel("system", distance);
        return;
      }

      if (!SpaceshipTravelManager.executeTravel("system", distance)) {
        return;
      }

      const coordinates = galaxy.coordinates.join(",");
      markSystemAsVisited(coordinates, currentSystem.index - 1);
      void go(`/system/${currentSystem.index - 1}`);
    }
  };

  const handleNext = async () => {
    const distance = 1;
    if (!SpaceshipTravelManager.canAffordTravel("system", distance)) {
      SpaceshipTravelManager.executeTravel("system", distance);
      return;
    }

    if (!SpaceshipTravelManager.executeTravel("system", distance)) {
      return;
    }

    const coordinates = galaxy.coordinates.join(",");
    markSystemAsVisited(coordinates, currentSystem.index + 1);
    void go(`/system/${currentSystem.index + 1}`);
  };

  if (loading) {
    return null;
  }

  return (
    <LevelStepper
      prevLabel={hasPrev ? `#${currentSystem.index - 1}` : null}
      nextLabel={hasNext ? `#${currentSystem.index + 1}` : null}
      prevTitle="上一个恒星系（消耗燃料）"
      nextTitle="下一个恒星系（消耗燃料）"
      onPrev={() => void handlePrevious()}
      onNext={() => void handleNext()}
      hint="恒星系"
    />
  );
};

export default SystemNavigation;
