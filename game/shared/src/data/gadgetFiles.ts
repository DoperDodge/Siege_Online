// Every data/gadgets/*.json file, imported explicitly (import.meta.glob is Vite-only; the server bundles with
// esbuild): the attackers' pool, then the defenders' (research/gadgets.md §1), then the operators' own items (their
// abilities, Phase 8 M4). A data test checks it lists every file.
import g_breach_charge from "../../../../data/gadgets/breach_charge.json";
import g_hard_breach_charge from "../../../../data/gadgets/hard_breach_charge.json";
import g_claymore from "../../../../data/gadgets/claymore.json";
import g_frag from "../../../../data/gadgets/frag.json";
import g_stun from "../../../../data/gadgets/stun.json";
import g_smoke from "../../../../data/gadgets/smoke.json";
import g_impact_emp from "../../../../data/gadgets/impact_emp.json";
import g_barbed_wire from "../../../../data/gadgets/barbed_wire.json";
import g_bulletproof_camera from "../../../../data/gadgets/bulletproof_camera.json";
import g_deployable_shield from "../../../../data/gadgets/deployable_shield.json";
import g_observation_blocker from "../../../../data/gadgets/observation_blocker.json";
import g_impact_grenade from "../../../../data/gadgets/impact_grenade.json";
import g_nitro_cell from "../../../../data/gadgets/nitro_cell.json";
import g_proximity_alarm from "../../../../data/gadgets/proximity_alarm.json";
import g_breaching_hammer from "../../../../data/gadgets/breaching_hammer.json";

export const gadgetFiles: Record<string, unknown>[] = [g_breach_charge, g_hard_breach_charge, g_claymore, g_frag, g_stun, g_smoke, g_impact_emp, g_barbed_wire, g_bulletproof_camera, g_deployable_shield, g_observation_blocker, g_impact_grenade, g_nitro_cell, g_proximity_alarm, g_breaching_hammer];
