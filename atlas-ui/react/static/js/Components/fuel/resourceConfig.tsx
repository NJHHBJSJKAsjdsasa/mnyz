// atlas-ui/react/static/js/Components/fuel/resourceConfig.tsx
// The twelve resources shown in the top bar, in canonical order.
//
// Amber Cockpit (2026-10-30): `gradient` and `glow` are gone. A 6px strip cannot
// show a gradient, and a 20px glow on twelve bars at once is exactly the "neon
// glass" the redesign removes. Each resource now has one flat `accent` hue, used
// for the fill and the icon — separation at a glance, no light.

import React from "react";
import type { SpaceshipResource } from "../../Utils/SpaceshipResources.tsx";
import AntimatterIcon from "../../Icons/AntimatterIcon.tsx";
import Element115Icon from "../../Icons/Element115Icon.tsx";
import DeuteriumIcon from "../../Icons/DeuteriumIcon.tsx";
import { RESOURCE_COLOR } from "../../Icons/palette.ts";

export interface FuelBarSpec {
  key: keyof SpaceshipResource;
  name: string;
  accent: string;
  icon: React.ReactNode;
}

const dot = <span aria-hidden className="block w-2 h-2" style={{ background: "currentColor" }} />;

export const FUEL_BARS: FuelBarSpec[] = [
  {
    key: "antimatter",
    name: "ANTIMATTER",
    accent: RESOURCE_COLOR.antimatter,
    icon: <AntimatterIcon size={16} color="currentColor" />,
  },
  {
    key: "element115",
    name: "ELEMENT 115",
    accent: RESOURCE_COLOR.element115,
    icon: <Element115Icon size={16} color="currentColor" />,
  },
  {
    key: "deuterium",
    name: "DEUTERIUM",
    accent: RESOURCE_COLOR.deuterium,
    icon: <DeuteriumIcon size={16} color="currentColor" />,
  },
  { key: "quantumAlloy", name: "QUANTUM ALLOY", accent: "#6bb793", icon: dot },
  { key: "plasmaCell", name: "PLASMA CELL", accent: "#c94f38", icon: dot },
  { key: "neuralCircuit", name: "NEURAL CIRCUIT", accent: "#e6b94a", icon: dot },
  { key: "exoticCrystal", name: "EXOTIC CRYSTAL", accent: "#b9755a", icon: dot },
  { key: "nebulaDust", name: "NEBULA DUST", accent: "#8f96a8", icon: dot },
  { key: "blackHoleFragment", name: "BLACK HOLE FRAGMENT", accent: "#646974", icon: dot },
  { key: "ancientRelic", name: "ANCIENT RELIC", accent: "#bf9a4a", icon: dot },
  { key: "alienArtifact", name: "ALIEN ARTIFACT", accent: "#a48f5b", icon: dot },
  { key: "dimensionalShard", name: "DIMENSIONAL SHARD", accent: "#7f6f47", icon: dot },
];
