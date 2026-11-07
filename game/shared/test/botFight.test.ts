// Bots' senses and gunfights (Phase 9 M3; bots/DESIGN.md §4, §7): they know only what they see, hear and are told, and
// they notice, aim and shoot by their difficulty.
import { describe, expect, it } from "vitest";
import { PawnMode, raycastLevel, Room, Source, TICK_HZ, type BotLevel, type Vec3 } from "../src/index.js";

async function lab(seed = 3) {
  return Room.create("FIGHT", "oregon", { lab: true, seed });
}

/** A bot standing at `at`, facing `yawDeg`, its order to stay there. */
function botAt(room: Room, at: Vec3, team: 0 | 1, level: BotLevel = "normal", yawDeg = 0) {
  const id = room.addBot(team, level)!;
  const bot = room.botOf(id)!;
  room.sim.teleport(room.bodyOf(id)!.possessedPawnId, at[0], at[1], at[2], yawDeg);
  bot.order = at;
  return { id, bot, pawn: () => room.sim.pawns.get(room.bodyOf(id)!.possessedPawnId)! };
}

const steps = (room: Room, seconds: number, stop?: () => boolean) => {
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    room.step();
    if (stop?.()) return true;
  }
  return false;
};

/** A clear line (no wall, no panel) between two eyes. */
function clear(room: Room, a: Vec3, b: Vec3): boolean {
  const e: Vec3 = [a[0], a[1] + 1.6, a[2]];
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  return raycastLevel(room.sim, e, [d[0] / len, d[1] / len, d[2] / len], len) === null;
}

describe("bots' senses and fights (Phase 9 M3)", () => {
  it("an enemy standing still behind a wall is never known; one sprinting there is heard (where, roughly), not seen", async () => {
    const room = await lab();
    // Dining and the Kitchen, the soft wall between them.
    const a = botAt(room, [19.0, 0, 27.0], 1, "elite", 90);
    const b = botAt(room, [21.8, 0, 27.0], 0, "elite", -90);
    expect(clear(room, [19.0, 0, 27.0], [21.8, 0, 27.0])).toBe(false);
    steps(room, 4);
    expect(a.bot.senses.contacts.has(b.pawn().id)).toBe(false);
    // Now the attacker sprints up and down the Kitchen.
    b.bot.order = null;
    const far: Vec3 = [27.5, 0, 27.0];
    const near: Vec3 = [21.8, 0, 27.0];
    let heard = false;
    for (let lap = 0; lap < 3 && !heard; lap++) {
      b.bot.legs.sprint = true;
      b.bot.order = lap % 2 ? near : far;
      heard = steps(room, 3, () => a.bot.senses.contacts.get(b.pawn().id)?.source === Source.Heard);
    }
    expect(heard).toBe(true);
    const c = a.bot.senses.contacts.get(b.pawn().id)!;
    expect(c.visible).toBe(false);
    expect(c.detected).toBe(false);
    expect(Math.hypot(c.pos[0] - b.pawn().state.x, c.pos[2] - b.pawn().state.z)).toBeLessThan(4);
  }, 60000);

  it("an enemy in the open is noticed, aimed at and shot; a downed one is finished", async () => {
    const room = await lab();
    // Yaw 0 faces −z: A (north) faces B; B faces away, south.
    const a = botAt(room, [-21.125, 0, 45.875], 1, "normal", 0);
    const bPos: Vec3 = [-21.125, 0, 35.875];
    const b = botAt(room, bPos, 0, "recruit", 0);
    expect(clear(room, [-21.125, 0, 45.875], bPos)).toBe(true);
    const hp = b.pawn().state.hp;
    const hit = steps(room, 4, () => b.pawn().state.hp < hp || b.pawn().state.mode !== PawnMode.Walk);
    expect(hit).toBe(true);
    expect(a.bot.senses.contacts.get(b.pawn().id)?.detected).toBe(true);
    steps(room, 6, () => b.pawn().state.mode === PawnMode.Dead);
    expect(b.pawn().state.mode).toBe(PawnMode.Dead);
  }, 60000);

  it("what one bot sees, its teammate is told of after the comms delay", async () => {
    const room = await lab();
    // A Recruit sees it (and takes its time over it); its Elite teammate looks the other way (north); the enemy faces away.
    const a = botAt(room, [-21.125, 0, 45.875], 1, "recruit", 0);
    const mate = botAt(room, [-31.125, 0, 45.875], 1, "elite", 180);
    const enemy = botAt(room, [-21.125, 0, 35.875], 0, "recruit", 0);
    let seenAt = -1;
    const told = steps(room, 4, () => {
      if (seenAt < 0 && a.bot.senses.contacts.get(enemy.pawn().id)?.source === Source.Seen) seenAt = room.sim.tick;
      return mate.bot.senses.contacts.get(enemy.pawn().id)?.source === Source.Told;
    });
    expect(told).toBe(true);
    // A saw it first; the teammate (looking away) was told a little later.
    expect(seenAt).toBeGreaterThan(0);
    expect(room.sim.tick - seenAt).toBeGreaterThanOrEqual(Math.floor(0.3 * TICK_HZ));
  }, 60000);

  it("duels at 12 m in the open (the Junkyard): an Elite bot beats a Recruit most of the time", async () => {
    let elite = 0;
    const rounds = 5;
    for (let seed = 1; seed <= rounds; seed++) {
      const room = await lab(seed);
      // Facing each other.
      const e = botAt(room, [-21.125, 0, 45.875], 1, "elite", 0);
      const r = botAt(room, [-21.125, 0, 33.875], 0, "recruit", 180);
      steps(room, 12, () => e.pawn().state.mode !== PawnMode.Walk || r.pawn().state.mode !== PawnMode.Walk);
      if (r.pawn().state.mode !== PawnMode.Walk && e.pawn().state.mode === PawnMode.Walk) elite++;
    }
    expect(elite).toBeGreaterThanOrEqual(4);
  }, 120000);
});
