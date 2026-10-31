// The interaction tests' scene (Phase 8, gadgets/DESIGN.md §10): a lab room on the Destruction Lab level with
// in-process clients (roomHarness.ts), and what a row needs to set up: an entry put straight into the gadget table, a
// body moved, ticks run.
import { GFlag, kindOf, type Gadget, type Vec3 } from "../../src/index.js";
import { roomWith } from "../roomHarness.js";

export async function scene(ops: string[] = ["sledge", "mute"]) {
  const h = await roomWith("destruction_lab", ops);
  const sim = h.room.sim;
  const wait = (n: number) => {
    for (let i = 0; i < n; i++) h.tick();
  };
  wait(8);
  /** Client i's body. */
  const body = (i: number) => sim.pawns.get(h.clients[i].session.ctrl!.possessedPawnId)!;
  const teleport = (i: number, x: number, y: number, z: number, yawDeg = 0) => {
    h.room.onLabTool(h.clients[i].id, { kind: "teleport", x, y, z, yawDeg });
    wait(2);
  };
  /** An entry of `kind` straight into the table, client i's (its team), standing at `pos` facing `yaw`. */
  const put = (kind: string, i: number, pos: Vec3, over: Partial<Gadget> = {}): Gadget =>
    sim.gadgets.add({
      kind: kindOf(kind),
      owner: h.clients[i].session.ctrl!.id,
      team: body(i).team,
      pos,
      yaw: 0,
      vel: [0, 0, 0],
      flags: GFlag.OnFloor,
      panel: -1,
      launchTick: 0,
      fuseEnd: 0,
      signalEnd: 0,
      readyAt: 0,
      seq: 0,
      ...over,
    });
  return { ...h, sim, wait, body, teleport, put };
}
