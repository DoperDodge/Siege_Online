// The kill plane in a room (Phase 5, DECISIONS D-076): a body it brings back is in a new life, so nothing aimed at
// or owed by its old life carries over, and nothing owed to the old life is lost. Oregon has a kill plane under
// the map; a body teleported over the void east of it falls through.
import { describe, expect, it } from "vitest";
import { Cause, DT, loadGameData, PawnMode, type GameEvent, type ShotOnBody } from "../src/index.js";
import { roomWith } from "./roomHarness.js";

/** The room's internals these tests reach into: damage with an attacker, and the tick's judged shots. */
interface RoomInside {
  hurt(victim: unknown, d: { amount: number; kill: boolean }, by: unknown): { outcome: string };
  members: Map<number, unknown>;
  judged: unknown[];
  resolveShots(): void;
}

async function overTheVoid() {
  const { room, clients, tick } = await roomWith("oregon", ["sledge", "mute"]);
  for (let i = 0; i < 20; i++) tick();
  const [a, b] = clients;
  const inside = room as unknown as RoomInside;
  const pawnOf = (c: typeof a) => room.sim.pawns.get(c.session.ctrl!.possessedPawnId)!;
  const B = pawnOf(b);
  room.sim.teleport(B.id, 85, 0, 31.5, 0); // past the map's east edge
  for (let i = 0; i < 10; i++) tick();
  const shot = (shooter: typeof a, bodies: ShotOnBody[], lives: Map<number, number>) => ({
    m: inside.members.get(shooter.id),
    cause: Cause.Bullet,
    ctrlId: shooter.session.ctrl!.id,
    team: pawnOf(shooter).team,
    seq: 1,
    weaponId: "l85a2",
    receivedTick: room.sim.tick,
    rewoundTick: room.sim.tick,
    origin: [85, 0, 33] as [number, number, number],
    bodies,
    lives,
    panelOps: [],
  });
  return { room, a, b, B, tick, inside, shot };
}

const dbno = loadGameData().combat.dbno;
const kills = (evs: GameEvent[]) => evs.filter((e): e is Extract<GameEvent, { kind: "kill" }> => e.kind === "kill");

describe("the kill plane in a room", () => {
  it("a downed body that bleeds out on the step the kill plane brings it back still credits whoever downed it", async () => {
    const run = async (bleedSteps: number | null) => {
      const { a, b, B, tick, inside, shot } = await overTheVoid();
      expect(inside.hurt(B, { amount: B.state.hp, kill: false }, { cause: Cause.Bullet, attacker: shot(a, [], new Map()), headshot: false }).outcome).toBe("downed");
      if (bleedSteps !== null) B.state.downHp = Math.fround((dbno.hp * DT * (bleedSteps - 0.5)) / dbno.bleedStillSeconds);
      const life = B.life;
      let steps = 0;
      while (B.life === life && steps < 64 * 30) {
        tick();
        steps++;
      }
      return { steps, kill: kills(b.events).at(-1), downer: a.session.ctrl!.id };
    };
    const { steps } = await run(null);
    const { kill, downer } = await run(steps);
    expect(kill).toMatchObject({ killerCtrl: downer, cause: Cause.Bleed });
  });

  it("a shot judged on a body that comes back in a new life before the shot applies does nothing", async () => {
    for (const comesBack of [false, true]) {
      const { a, b, B, inside, shot, room, tick } = await overTheVoid();
      inside.hurt(B, { amount: B.state.hp, kill: false }, { cause: Cause.Bullet, attacker: shot(a, [], new Map()), headshot: false }); // down, falling
      while (B.state.invulnTicks > 0) tick(); // past the moment of going down
      expect(B.state.mode).toBe(PawnMode.Downed);
      const head: ShotOnBody = { pawnId: B.id, kill: true, amount: 0, headshot: true, zone: "head", pellets: 1, distance: 2 };
      inside.judged.push(shot(a, [head], new Map([[B.id, B.life]])));
      if (comesBack) room.sim.teleport(B.id, 0, 0, 0, 0); // what the kill plane does inside a catch-up step: a new life
      inside.resolveShots();
      expect(B.state.mode === PawnMode.Dead, `comes back: ${comesBack}`).toBe(!comesBack);
      expect(kills(b.events).length, `comes back: ${comesBack}`).toBe(0); // the kill feed reaches clients with the next step
    }
  });
});
