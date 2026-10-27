// atlas-ui/react/static/js/Utils/ResourceLabels.tsx
import { SpaceshipResource } from "./SpaceshipResources.tsx";

export const RESOURCE_LABELS: Record<keyof SpaceshipResource, string> = {
  antimatter: "反物质",
  element115: "115 号元素",
  deuterium: "氘",
  quantumAlloy: "量子合金",
  plasmaCell: "等离子电池",
  neuralCircuit: "神经回路",
  exoticCrystal: "异星晶体",
  nebulaDust: "星云尘埃",
  blackHoleFragment: "黑洞碎片",
  ancientRelic: "远古遗物",
  alienArtifact: "异星造物",
  dimensionalShard: "维度碎片",
};

export const resourceLabel = (key: string): string => RESOURCE_LABELS[key as keyof SpaceshipResource] ?? key;
