// Training feedback (Phase 9 M9; bots/DESIGN.md §11): each person's round report at the round's end.
import { describe, expect, it } from "vitest";
import { ByteReader, decodeRoundReport, encodeLobbyAction, encodeRoundReport, handleRoomMessage, Msg, Phase, Room, TICK_HZ, type RoundReport } from "../src/index.js";

describe("round reports (Phase 9 M9)", () => {
  it("encode and decode", () => {
    const r: RoundReport = {
      round: 2,
      format: "drill_duel",
      drill: "duel",
      side: "attack",
      operator: "sledge",
      won: true,
      seconds: 7.5,
      death: null,
      firstSeen: { t: 1.2, by: "BOT Mantis", at: [1, 0, 2], room: "1F_KITCHEN", distM: 8 },
      dealt: [{ to: "BOT Mantis", hp: 140 }],
      taken: [{ from: "BOT Mantis", hp: 30 }],
      kills: 1,
      plantS: null,
      disableS: null,
      utility: [{ gadget: "frag", n: 1 }],
      score: { ttk: 3.4 },
    };
    const b = encodeRoundReport(r);
    expect(b[0]).toBe(Msg.RoundReport);
    expect(decodeRoundReport(new ByteReader(b.subarray(1)))).toEqual(r);
  });

  it("a duel lost to the bot: who killed you and with what, who saw you first, the damage you took, no time to kill", async () => {
    const reports: RoundReport[] = [];
    const room = await Room.create("REP", "oregon", { format: "drill_duel", seed: 3 });
    const host = room.join("you", {
      send(b: Uint8Array) {
        if (b[0] === Msg.RoundReport) reports.push(decodeRoundReport(new ByteReader(b.subarray(1))));
      },
      buffered: () => 0,
    })!;
    const send = (b: Uint8Array) => handleRoomMessage(room, host, b[0], new ByteReader(b.subarray(1)));
    room.step();
    send(encodeLobbyAction({ kind: "start" }));
    const m = room.director!.match;
    for (let i = 0; i < 60 * TICK_HZ && m.phase !== Phase.RoundEnd; i++) room.step();
    expect(m.phase).toBe(Phase.RoundEnd);
    expect(reports.length).toBe(1);
    const r = reports[0];
    const bot = [...m.players.values()].find((p) => p.bot !== null)!;
    expect(r.round).toBe(1);
    expect(r.drill).toBe("duel");
    expect(r.won).toBe(false);
    expect(r.death?.by).toBe(bot.name);
    expect(r.death?.weapon).not.toBe("");
    expect(r.firstSeen?.by).toBe(bot.name);
    expect(r.firstSeen!.t).toBeLessThanOrEqual(r.death!.t);
    expect(r.taken[0]?.from).toBe(bot.name);
    expect(r.taken.reduce((n, x) => n + x.hp, 0)).toBeGreaterThan(0);
    expect(r.score.ttk).toBe(-1);
  }, 120000);
});
