// atlas-ui/react/static/js/Components/FabricatorTab.tsx
import React, { useEffect, useState } from "react";
import { FabricatorSystem, Recipe } from "../Utils/FabricatorSystem.tsx";
import { SpaceshipResource } from "../Utils/SpaceshipResources.tsx";
import { resourceLabel } from "../Utils/ResourceLabels.tsx";
import { subscribeClock } from "../Utils/clock.tsx";

const formatBag = (bag: Partial<SpaceshipResource>): string =>
  Object.entries(bag)
    .map(([key, amount]) => `${resourceLabel(key)} ${amount}`)
    .join(" · ");

const formatRemaining = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}` : `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const RecipeCard: React.FC<{ recipe: Recipe; onCrafted: (text: string) => void }> = ({ recipe, onCrafted }) => {
  const check = FabricatorSystem.canCraft(recipe.id);
  const remaining = FabricatorSystem.remainingMs(recipe.id);

  const [busy, setBusy] = useState(false);

  // The server owns both the wallet and the cooldown; re-read on mount so a
  // refresh cannot show a stale "可生产" button.
  useEffect(() => {
    void FabricatorSystem.sync();
  }, []);

  const craft = async () => {
    if (busy) return;
    if (!check.ok) {
      onCrafted(check.reason ?? "无法生产");
      return;
    }
    setBusy(true);
    const result = await FabricatorSystem.run(recipe.id);
    setBusy(false);
    onCrafted(result.message);
  };

  return (
    <div className="rounded-lg border border-teal-500/20 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-200">
          <span className="mr-1">{recipe.icon}</span>
          {recipe.name}
        </span>
        <span className="text-[11px] text-teal-300 shrink-0">{formatBag(recipe.output)}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5">{recipe.desc}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-gray-400">原料 {formatBag(recipe.cost)}</span>
        <button
          onClick={() => void craft()}
          disabled={!check.ok || busy}
          title={check.reason ?? ""}
          className="px-2 py-1 rounded text-[11px] bg-teal-600/80 hover:bg-teal-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {remaining > 0 ? `冷却 ${formatRemaining(remaining)}` : "生产"}
        </button>
      </div>
    </div>
  );
};

const FabricatorTab: React.FC = () => {
  const [, setTick] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return subscribeClock(() => setTick((value) => value + 1));
  }, []);

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2400);
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400">把中级原料加工成稀有材料，每条配方独立冷却。</p>
      {FabricatorSystem.recipes().map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} onCrafted={notify} />
      ))}
      {message && <p className="text-xs text-center text-teal-300">{message}</p>}
    </div>
  );
};

export default FabricatorTab;
