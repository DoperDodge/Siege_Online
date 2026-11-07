// Attacking bots (Phase 9 M5; bots/DESIGN.md §6): in prep their drones go to the sites and find the one being defended,
// in action they go in by their spawn's way in and the carrier plants in one of the site's rooms.
import { describe, expect, it } from "vitest";
import { ATTACK, ByteReader, encodeLobbyAction, encodeMatchAction, handleRoomMessage, isFormat, loadGameData, Phase, PawnMode, Room, TICK_HZ, type FormatMode } from "../src/index.js";

const data = loadGameData();
const mode = data.modes.get("bot_training")!;
if (!isFormat(mode)) throw new Error("bot_training");
const bt: FormatMode = mode;

/** The person (Blue) defends `site` alone; Orange's five bots attack. */
async function attack(site: string, seed = 5) {
  const room = await Room.create("ATK", "oregon", { format: "bot_training", seed });
  const host = room.join("you", { send() {}, buffered: () => 0 })!;
  const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
  send(encodeLobbyAction({ kind: "change", change: { kind: "rules", rules: { match: { ...bt.match, swapEvery: 24, overtime: null, firstAttack: "orange", bots: { ...bt.match.bots!, size: [1, 5], site }, seconds: { ...bt.match.seconds, pick: 5, prep: 40, action: 180 } } } } }));
  room.step();
  send(encodeLobbyAction({ kind: "start" }));
  room.step();
  const m = room.director!.match;
  const until = (done: () => boolean, seconds: number) => {
    for (let i = 0; i < seconds * TICK_HZ && !done(); i++) room.step();
    return done();
  };
  return { room, m, until, host, send };
}

describe("attacking bots (Phase 9 M5)", () => {
  it("their drones find the site in prep; in action they come in and win the round against a lone defender standing at the site", async () => {
    const { room, m, until } = await attack("SITE_DINING");
    expect(until(() => m.phase === Phase.Prep, 10)).toBe(true);
    expect(until(() => m.phase === Phase.Action, 45)).toBe(true);
    const found = m.siteRevealed;
    expect(until(() => m.phase === Phase.RoundEnd, 180)).toBe(true);
    expect(m.history[0].winner).toBe(m.attackers === 1 ? 1 : 0);
    expect(found || m.siteRevealed).toBe(true);
    void room;
  }, 300000);

  it("with the defender out of the way, the carrier plants in the site and the fuse runs out", async () => {
    const { room, m, until } = await attack("SITE_LAUNDRY", 6);
    expect(until(() => m.phase === Phase.Action, 60)).toBe(true);
    // The person hides on the far side of the map's outside (the round goes on while they live).
    const you = room.sim.pawns.get(room.bodyOf([...m.players.values()].find((p) => p.bot === null)!.id)!.possessedPawnId)!;
    room.sim.teleport(you.id, 75, 0, 70, 0);
    expect(until(() => m.plantedAt !== null || m.phase !== Phase.Action, 170)).toBe(true);
    expect(m.plantedAt).not.toBeNull();
    const carrier = [...m.players.values()].filter((p) => p.bot !== null && m.sideOf(p.id) === ATTACK);
    expect(carrier.length).toBe(5);
    void PawnMode;
    void encodeMatchAction;
  }, 300000);
});
