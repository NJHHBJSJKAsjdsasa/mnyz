"""reference data: resources, modules, tech, contracts, structures, config

Revision ID: 0002_reference
Revises: 0001_core
Create Date: 2026-10-25
"""

from __future__ import annotations

from alembic import op

revision = "0002_reference"
down_revision = "0001_core"
branch_labels = None
depends_on = None

RESOURCES = """
('antimatter', '反物质', 'base', true, 1),
('element115', '115 号元素', 'base', true, 2),
('deuterium', '氘', 'base', true, 3),
('quantumAlloy', '量子合金', 'mid', true, 4),
('plasmaCell', '等离子电池', 'mid', true, 5),
('neuralCircuit', '神经回路', 'mid', true, 6),
('exoticCrystal', '异星晶体', 'rare', true, 7),
('nebulaDust', '星云尘埃', 'rare', true, 8),
('blackHoleFragment', '黑洞碎片', 'rare', true, 9),
('ancientRelic', '远古遗物', 'artifact', false, 10),
('alienArtifact', '异星造物', 'artifact', false, 11),
('dimensionalShard', '维度碎片', 'artifact', false, 12)
"""

MODULES = """
('scanArray', '深空扫描阵列', 999,
 '{"base": {"quantumAlloy": 10, "neuralCircuit": 3, "exoticCrystal": 2}, "growth": 1.35, "scale": 3.5}',
 '{"kind": "sqrt", "per_level": 9, "cap": 90, "unit": "scan_cooldown_pct"}', 1),
('cargoBay', '模块化货舱', 999,
 '{"base": {"plasmaCell": 8, "quantumAlloy": 5, "alienArtifact": 1}, "growth": 1.35, "scale": 3.5}',
 '{"kind": "sqrt", "per_level": 5, "cap": 60, "unit": "trade_buy_pct"}', 2),
('warpCoil', '跃迁线圈', 999,
 '{"base": {"plasmaCell": 10, "neuralCircuit": 5, "nebulaDust": 2}, "growth": 1.35, "scale": 3.5}',
 '{"kind": "sqrt", "per_level": 8, "unit": "mining_pct"}', 3),
('archivist', '遗物解析器', 999,
 '{"base": {"neuralCircuit": 8, "quantumAlloy": 6, "exoticCrystal": 2}, "growth": 1.35, "scale": 3.5}',
 '{"kind": "linear", "per_two_levels": 1, "unit": "scan_yield"}', 4),
('weaponArray', '武器阵列', 999,
 '{"base": {"quantumAlloy": 14, "neuralCircuit": 6, "plasmaCell": 4}, "growth": 1.35, "scale": 3.5}',
 '{"kind": "linear", "base": 6, "per_level": 4, "unit": "firepower"}', 5),
('shieldMatrix', '护盾矩阵', 999,
 '{"base": {"plasmaCell": 12, "exoticCrystal": 3, "nebulaDust": 2}, "growth": 1.35, "scale": 3.5}',
 '{"kind": "linear", "base": 4, "per_level": 3, "unit": "shield"}', 6)
"""

TECH = """
('mining-1', 'mining', 1, '矿脉测绘', NULL, '{"antimatter": 300}'),
('mining-2', 'mining', 2, '深层钻探', 'mining-1', '{"antimatter": 800, "quantumAlloy": 20}'),
('mining-3', 'mining', 3, '元素分离', 'mining-2', '{"antimatter": 2000, "exoticCrystal": 10}'),
('mining-4', 'mining', 4, '重力选矿', 'mining-3', '{"antimatter": 5000, "ancientRelic": 2}'),
('travel-1', 'travel', 1, '航道校准', NULL, '{"antimatter": 300}'),
('travel-2', 'travel', 2, '惯性补偿', 'travel-1', '{"antimatter": 800, "quantumAlloy": 20}'),
('travel-3', 'travel', 3, '曲率稳流', 'travel-2', '{"antimatter": 2000, "exoticCrystal": 10}'),
('travel-4', 'travel', 4, '折跃共振', 'travel-3', '{"antimatter": 5000, "ancientRelic": 2}'),
('survey-1', 'survey', 1, '阵列微调', NULL, '{"antimatter": 300}'),
('survey-2', 'survey', 2, '多谱合成', 'survey-1', '{"antimatter": 800, "quantumAlloy": 20}'),
('survey-3', 'survey', 3, '噪声抑制', 'survey-2', '{"antimatter": 2000, "exoticCrystal": 10}'),
('survey-4', 'survey', 4, '深空解析', 'survey-3', '{"antimatter": 5000, "ancientRelic": 2}'),
('trade-1', 'trade', 1, '行情订阅', NULL, '{"antimatter": 300}'),
('trade-2', 'trade', 2, '议价协议', 'trade-1', '{"antimatter": 800, "quantumAlloy": 20}'),
('trade-3', 'trade', 3, '结算网络', 'trade-2', '{"antimatter": 2000, "exoticCrystal": 10}'),
('trade-4', 'trade', 4, '信用背书', 'trade-3', '{"antimatter": 5000, "ancientRelic": 2}')
"""

TEMPLATES = """
('deep_patrol', '深空巡检', 'scans', NULL,
 '{"resources": {"antimatter": [220, 380]}, "target": [8, 14], "vouchers": 0}'),
('trade_escort', '贸易护航', 'trades', 'cargoBay',
 '{"resources": {"deuterium": [120, 200], "quantumAlloy": [20, 36]}, "target": [5, 9], "vouchers": 0}'),
('vein_mining', '矿脉开采', 'collections', 'warpCoil',
 '{"resources": {"quantumAlloy": [30, 60]}, "target": [20, 40], "vouchers": 0}'),
('relic_survey', '遗迹调查', 'relicScans', 'archivist',
 '{"resources": {"exoticCrystal": [6, 12]}, "target": [3, 5], "vouchers": 1}'),
('lane_clear', '清剿航道', 'kills', 'weaponArray',
 '{"resources": {"plasmaCell": [18, 30], "neuralCircuit": [10, 18]}, "target": [2, 4], "vouchers": 0}')
"""

STRUCTURES = """
('production_bay', 'station', '生产舱', 999,
 '{"base": {"quantumAlloy": 400}, "growth": 1.5}', '{"antimatter_per_tick": 2, "deuterium_divisor": 2}'),
('observation_deck', 'station', '观测舱', 999,
 '{"base": {"quantumAlloy": 600}, "growth": 1.5}', '{"scan_cooldown_pct": 2, "cap": 25}'),
('trade_hub', 'station', '商贸舱', 999,
 '{"base": {"quantumAlloy": 800}, "growth": 1.5}', '{"sell_price_pct": 1, "cap": 20}'),
('surface_mine', 'planet', '地表矿场', 999,
 '{"base": {"quantumAlloy": 300}, "growth": 1.45}', '{"yield_per_tick": 3}'),
('surface_refinery', 'planet', '轨道精炼厂', 999,
 '{"base": {"quantumAlloy": 500}, "growth": 1.45}', '{"refine_pct": 5}'),
('surface_habitat', 'planet', '居住穹顶', 999,
 '{"base": {"quantumAlloy": 450}, "growth": 1.45}', '{"population_cap": 100}')
"""

CONFIG = """
('collect_cooldown_seconds', '900', 1),
('scan_cooldown_base_ms', '480000', 1),
('scan_cooldown_floor_ms', '30000', 1),
('station_tick_seconds', '900', 1),
('station_tick_cap', '16', 1),
('fleet_tick_seconds', '1800', 1),
('fleet_tick_cap', '12', 1),
('contract_ttl_hours', '12', 1),
('diminishing_after', '3', 1),
('diminishing_step', '0.15', 1),
('diminishing_floor', '0.4', 1),
('collect_cap_ratio', '0.25', 1),
('module_max_level', '999', 1),
('ship_max_level', '999', 1),
('refit_cost_scale', '3.5', 1),
('reference_version', '1', 2)
"""

TABLES = "resource_types, game_config, module_definitions, tech_nodes, contract_templates, structure_definitions"


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE resource_types (
  code text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('base','mid','rare','artifact')),
  is_tradable boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  data_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE module_definitions (
  code text PRIMARY KEY,
  name text NOT NULL,
  max_level integer NOT NULL DEFAULT 999 CHECK (max_level > 0),
  cost_curve jsonb NOT NULL,
  effect_curve jsonb NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE tech_nodes (
  code text PRIMARY KEY,
  branch text NOT NULL CHECK (branch IN ('mining','travel','survey','trade')),
  tier smallint NOT NULL CHECK (tier BETWEEN 1 AND 4),
  name text NOT NULL,
  requires text REFERENCES tech_nodes(code),
  cost jsonb NOT NULL,
  UNIQUE (branch, tier)
);

CREATE TABLE contract_templates (
  code text PRIMARY KEY,
  name text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('scans','trades','collections','relicScans','kills')),
  requires_module text REFERENCES module_definitions(code),
  reward_formula jsonb NOT NULL
);

CREATE TABLE structure_definitions (
  code text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('station','planet')),
  name text NOT NULL,
  max_level integer NOT NULL DEFAULT 999 CHECK (max_level > 0),
  cost_curve jsonb NOT NULL,
  yield_formula jsonb NOT NULL
);
"""
    )
    op.execute(
        f"""
INSERT INTO resource_types (code, name, category, is_tradable, sort_order) VALUES {RESOURCES}
ON CONFLICT (code) DO NOTHING;

INSERT INTO module_definitions (code, name, max_level, cost_curve, effect_curve, sort_order) VALUES {MODULES}
ON CONFLICT (code) DO NOTHING;

INSERT INTO tech_nodes (code, branch, tier, name, requires, cost) VALUES {TECH}
ON CONFLICT (code) DO NOTHING;

INSERT INTO contract_templates (code, name, metric, requires_module, reward_formula) VALUES {TEMPLATES}
ON CONFLICT (code) DO NOTHING;

INSERT INTO structure_definitions (code, kind, name, max_level, cost_curve, yield_formula) VALUES {STRUCTURES}
ON CONFLICT (code) DO NOTHING;

INSERT INTO game_config (key, value, data_version) VALUES {CONFIG}
ON CONFLICT (key) DO NOTHING;
"""
    )
    op.execute(
        """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    EXECUTE 'GRANT SELECT ON resource_types, game_config, module_definitions, tech_nodes, contract_templates, structure_definitions TO atlas_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_readonly') THEN
    EXECUTE 'GRANT SELECT ON resource_types, game_config, module_definitions, tech_nodes, contract_templates, structure_definitions TO atlas_readonly';
  END IF;
END $$;
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS structure_definitions")
    op.execute("DROP TABLE IF EXISTS contract_templates")
    op.execute("DROP TABLE IF EXISTS tech_nodes")
    op.execute("DROP TABLE IF EXISTS module_definitions")
    op.execute("DROP TABLE IF EXISTS game_config")
    op.execute("DROP TABLE IF EXISTS resource_types")
