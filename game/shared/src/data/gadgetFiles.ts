// Every data/gadgets/*.json file, imported explicitly (import.meta.glob is Vite-only; the server bundles with
// esbuild): the attackers' pool, then the defenders' (research/gadgets.md §1), then the operators' own items (their
// abilities, Phase 8 M4). A data test checks it lists every file.
import g_breach_charge from "../../../../data/gadgets/breach_charge.json";
import g_heavy_breach_charge from "../../../../data/gadgets/heavy_breach_charge.json";
import g_claymore from "../../../../data/gadgets/claymore.json";
import g_frag from "../../../../data/gadgets/frag.json";
import g_stun from "../../../../data/gadgets/stun.json";
import g_smoke from "../../../../data/gadgets/smoke.json";
import g_impact_emp from "../../../../data/gadgets/impact_emp.json";
import g_barbed_wire from "../../../../data/gadgets/barbed_wire.json";
import g_armoured_camera from "../../../../data/gadgets/armoured_camera.json";
import g_deployable_shield from "../../../../data/gadgets/deployable_shield.json";
import g_feed_blocker from "../../../../data/gadgets/feed_blocker.json";
import g_impact_grenade from "../../../../data/gadgets/impact_grenade.json";
import g_remote_charge from "../../../../data/gadgets/remote_charge.json";
import g_proximity_alarm from "../../../../data/gadgets/proximity_alarm.json";
import g_breaching_maul from "../../../../data/gadgets/breaching_maul.json";
import g_burn_frame from "../../../../data/gadgets/burn_frame.json";
import g_hailstone_drill from "../../../../data/gadgets/hailstone_drill.json";
import g_hailstone from "../../../../data/gadgets/hailstone.json";
import g_damper from "../../../../data/gadgets/damper.json";
import g_blood_oxygen_sensor from "../../../../data/gadgets/blood_oxygen_sensor.json";
import g_blind_pane from "../../../../data/gadgets/blind_pane.json";
import g_pane_canister from "../../../../data/gadgets/pane_canister.json";
import g_crossover_drone from "../../../../data/gadgets/crossover_drone.json";
import g_ringer from "../../../../data/gadgets/ringer.json";
import g_dropped_phone from "../../../../data/gadgets/dropped_phone.json";
import g_burr_mine from "../../../../data/gadgets/burr_mine.json";
import g_frame_barrier from "../../../../data/gadgets/frame_barrier.json";
import g_brownout_pistol from "../../../../data/gadgets/brownout_pistol.json";
import g_second_wind from "../../../../data/gadgets/second_wind.json";
import g_arc_pack from "../../../../data/gadgets/arc_pack.json";
import g_snare_latch from "../../../../data/gadgets/snare_latch.json";
import g_bailiff_post from "../../../../data/gadgets/bailiff_post.json";
import g_stud_driver from "../../../../data/gadgets/stud_driver.json";
import g_stud_ring from "../../../../data/gadgets/stud_ring.json";
import g_stud_spine from "../../../../data/gadgets/stud_spine.json";
import g_stud_cross from "../../../../data/gadgets/stud_cross.json";
import g_divining_coil from "../../../../data/gadgets/divining_coil.json";

export const gadgetFiles: Record<string, unknown>[] = [g_breach_charge, g_heavy_breach_charge, g_claymore, g_frag, g_stun, g_smoke, g_impact_emp, g_barbed_wire, g_armoured_camera, g_deployable_shield, g_feed_blocker, g_impact_grenade, g_remote_charge, g_proximity_alarm, g_breaching_maul, g_burn_frame, g_hailstone_drill, g_hailstone, g_damper, g_blood_oxygen_sensor, g_blind_pane, g_pane_canister, g_crossover_drone, g_ringer, g_dropped_phone, g_burr_mine, g_frame_barrier, g_brownout_pistol, g_second_wind, g_arc_pack, g_snare_latch, g_bailiff_post, g_stud_driver, g_stud_ring, g_stud_spine, g_stud_cross, g_divining_coil];
