// atlas-ui/react/static/js/Components/EffectsControl.tsx
import React, { useState, useEffect } from "react";

interface EffectInfo {
  id: string;
  type: string;
  enabled: boolean;
}

interface EffectsControlProps {
  effects: EffectInfo[];
  onToggleEffect: (effectId: string, enabled: boolean) => void;
}

const EffectsControl: React.FC<EffectsControlProps> = ({ effects, onToggleEffect }) => {
  const [localEffects, setLocalEffects] = useState<EffectInfo[]>(effects);
  const [showEffects, setShowEffects] = useState(false);

  useEffect(() => {
    setLocalEffects(effects);
  }, [effects]);

  const handleToggle = (effectId: string, enabled: boolean) => {
    setLocalEffects((prev) => prev.map((e) => (e.id === effectId ? { ...e, enabled } : e)));
    onToggleEffect(effectId, enabled);
  };

  const formatEffectName = (type: string): string => {
    const effectNames: Record<string, string> = {
      crystalline_surface: "结晶表面",
      fire_eruption: "火焰喷发",
      carbon_trails: "碳轨迹",
      radiation_rings: "辐射环",
      molten_lava: "熔岩",
      lava_flows: "熔岩流",
      lava_rivers: "熔岩河",
      aquifer_water: "含水层",
      ocean_currents: "洋流",
      atmosphere_clouds: "大气云",
      crystal_formations: "晶体形成",
      cloud_layers: "云层",
      storm_systems: "风暴系统",
      volcanic_activity: "火山活动",
      aurora: "极光",
      magnetic_field: "磁场",
      city_lights: "城市灯光",
      bioluminescence: "生物发光",
      thermal_emissions: "热辐射",
    };

    return (
      effectNames[type] ||
      type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase())
        .replace("Layer", "")
        .replace("Effect", "")
        .trim()
    );
  };

  if (localEffects.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-400">3D效果控制</div>
        <button onClick={() => setShowEffects(!showEffects)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
          {showEffects ? "隐藏" : "显示"} ({localEffects.filter((e) => e.enabled).length}/{localEffects.length})
        </button>
      </div>

      {showEffects && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {localEffects.map((effect) => (
            <div key={effect.id} className="bg-white/[0.04] rounded p-2 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" checked={effect.enabled} onChange={(e) => handleToggle(effect.id, e.target.checked)} className="rounded border-gray-400 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-plate-2" />
                <span className={`${effect.enabled ? "text-white" : "text-gray-500"} transition-colors`}>{formatEffectName(effect.type)}</span>
              </label>
              <span className={`text-[10px] ${effect.enabled ? "text-green-400" : "text-gray-600"}`}>{effect.enabled ? "ON" : "OFF"}</span>
            </div>
          ))}
        </div>
      )}

      {showEffects && localEffects.length > 3 && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => {
              localEffects.forEach((e) => handleToggle(e.id, true));
            }}
            className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
          >
            启用全部
          </button>
          <button
            onClick={() => {
              localEffects.forEach((e) => handleToggle(e.id, false));
            }}
            className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
          >
            禁用全部
          </button>
        </div>
      )}
    </div>
  );
};

export default EffectsControl;
