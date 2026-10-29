// The match messages (net/matchWire.ts): each one round-trips, and bad bytes are refused.
import { describe, expect, it } from "vitest";
import {
  ByteReader,
  ByteWriter,
  decodeLobbyAction,
  decodeMatchAction,
  decodeMatchState,
  decodeRoomList,
  encodeLobbyAction,
  encodeMatchAction,
  encodeMatchState,
  encodeRoomList,
  Msg,
  NO_END,
  Phase,
  ProtocolError,
  WinReason,
  type LobbyAction,
  type MatchAction,
  type MatchView,
} from "../src/index.js";

const body = (b: Uint8Array) => new ByteReader(b.subarray(1));

describe("match messages", () => {
  it("lobby actions round-trip", () => {
    const all: LobbyAction[] = [
      { kind: "team", team: 1 },
      { kind: "ready", ready: true },
      { kind: "move", member: 300, team: 0 },
      { kind: "swapTeams" },
      { kind: "kick", member: 7 },
      { kind: "format", format: "ranked" },
      { kind: "change", change: { kind: "bans", maxPerSide: 2 } },
      { kind: "change", change: { kind: "reinforcementScaling", value: "full" } },
      { kind: "change", change: { kind: "rules", rules: { match: { rounds: 4 } } } },
      { kind: "start" },
      { kind: "backToLobby" },
      { kind: "private", private: true },
      { kind: "rating", rating: 1234 },
    ];
    for (const a of all) {
      const b = encodeLobbyAction(a);
      expect(b[0]).toBe(Msg.LobbyAction);
      expect(decodeLobbyAction(body(b))).toEqual(a);
    }
  });

  it("match actions round-trip; none is the empty id", () => {
    const all: MatchAction[] = [
      { kind: "banVote", operator: "mute" },
      { kind: "banVote", operator: null },
      { kind: "siteVote", site: "SITE_DORMS" },
      { kind: "spawn", group: "A_JUNKYARD" },
      { kind: "defuser", take: false },
    ];
    for (const a of all) expect(decodeMatchAction(body(encodeMatchAction(a)))).toEqual(a);
  });

  it("the match state and the room list round-trip", () => {
    const v: MatchView = {
      format: "ranked",
      phase: Phase.PostPlant,
      phaseStart: 123456,
      phaseEnd: NO_END,
      round: 7,
      attackers: 1,
      overtime: true,
      score: [3, 3],
      host: 1,
      you: 2,
      private: false,
      redWalls: true,
      players: [
        { id: 1, name: "Ana", team: 0, ready: true, connected: true, side: 1, alive: true, operator: "mute", spawn: null, banVote: "sledge", siteVote: "SITE_DORMS", kills: 4, deaths: 2, assists: 1, rating: 1100 },
        { id: 2, name: "Bo", team: 1, ready: false, connected: false, side: null, alive: false, operator: null, spawn: "B_STREET", banVote: null, siteVote: null, kills: 0, deaths: 3, assists: 0, rating: null },
      ],
      bans: [["thermite"], ["pulse"]],
      site: "SITE_LAUNDRY",
      siteRevealed: true,
      carrier: 2,
      history: [{ round: 1, attackers: 0, winner: 1, reason: WinReason.Disabled, site: "SITE_DINING" }],
      winner: null,
      forfeit: false,
      mvp: 0,
      detected: [17, 18],
      defuser: { carrier: 12, dropped: null, planted: [1.5, -3.25, 30.125], canPlant: false, plantTicks: 448, disableTicks: 448 },
      rules: '{"match":{"rounds":6}}',
      rulesVersion: 3,
    };
    expect(decodeMatchState(body(encodeMatchState(v)))).toEqual(v);
    expect(decodeMatchState(body(encodeMatchState({ ...v, rules: null, winner: 0, forfeit: true, mvp: 1 })))).toMatchObject({ rules: null, winner: 0, forfeit: true, mvp: 1 });
    expect(decodeMatchState(body(encodeMatchState({ ...v, defuser: null }))).defuser).toBeNull();
    const dropped = { carrier: 0, dropped: [4, 0, 2] as [number, number, number], planted: null, canPlant: true, plantTicks: 1, disableTicks: 2 };
    expect(decodeMatchState(body(encodeMatchState({ ...v, defuser: dropped }))).defuser).toEqual(dropped);
    const rooms = [{ code: "ABCDE", format: "quick_match", players: 3, maxPlayers: 10, phase: Phase.Action, round: 2 }];
    expect(decodeRoomList(body(encodeRoomList(rooms)))).toEqual(rooms);
  });

  it("bad bytes are refused", () => {
    const bad = (bytes: number[]) => () => decodeLobbyAction(new ByteReader(Uint8Array.from(bytes)));
    expect(bad([99])).toThrow(ProtocolError);
    expect(bad([0, 2])).toThrow(ProtocolError); // team 2
    expect(bad([1, 5])).toThrow(ProtocolError); // ready 5
    expect(bad([6, 1, 9])).toThrow(ProtocolError); // an unknown scaling
    const json = new ByteWriter().u8(6).u8(2).str("{nope").finish();
    expect(() => decodeLobbyAction(new ByteReader(json))).toThrow(ProtocolError);
    expect(() => decodeMatchAction(new ByteReader(Uint8Array.of(3, 2)))).toThrow(ProtocolError);
    expect(() => decodeMatchState(new ByteReader(Uint8Array.of(0, 9)))).toThrow(ProtocolError);
  });
});
