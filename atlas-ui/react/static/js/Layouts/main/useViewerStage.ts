// Layouts/main/useViewerStage.ts — the home stage: coordinates + the star map.
//
// Until 2026-10-30 this file was a three-input state machine: dragging a slider,
// touching the 3D scene, or the random-jump animation would fade the 3D viewer in,
// and a 3–4s timer would fade it back out to the intro copy. The player's read on
// that was blunt and correct — "the centre feels empty": most of the time the
// biggest area on the page showed one paragraph and a lot of nothing, and the
// thing that makes the page worth looking at was hidden unless you poked it.
//
// So the cross-fade is gone. The star map is on permanently, and the copy moved
// to a corner plate (see `HomeScreen`). Coordinates are still the only state this
// hook owns; `show3DViewer` / `showNavigationText` are kept in the return shape
// because `MainLayout` threads them into `HomeScreenProps` and the 3D component's
// `isVisible` — they are simply always true now.

import { useCallback, useState } from "react";
import type { Coordinates } from "./format.ts";

export interface ViewerStage {
  coordinates: Coordinates;
  /** Always true: the star map is no longer hidden on a timer. */
  show3DViewer: boolean;
  /** Always true: the corner copy is permanent. */
  showNavigationText: boolean;
  handleCoordinateChange: (coordinates: Coordinates, isUserInteraction?: boolean) => void;
  /** Kept for the 3D component's callback wiring; nothing to pause any more. */
  handle3DUserInteraction: (isInteracting: boolean) => void;
}

const noop = () => {};

export const useViewerStage = (initial: Coordinates): ViewerStage => {
  const [coordinates, setCoordinates] = useState<Coordinates>(initial);

  const handleCoordinateChange = useCallback((next: Coordinates) => {
    setCoordinates(next);
  }, []);

  return {
    coordinates,
    show3DViewer: true,
    showNavigationText: true,
    handleCoordinateChange,
    handle3DUserInteraction: noop,
  };
};

export default useViewerStage;
