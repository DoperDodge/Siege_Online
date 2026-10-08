// The messages a client sends once it is in a room, routed to the room: one table for the game server's
// lobby (game/server/src/lobby.ts) and the Range Lab's in-page room (Phase 3 M10, DECISIONS D-052).
import type { ByteReader } from "./bytes.js";
import { decodeInput, decodeLabTool, decodePickLoadout, decodePing, Msg } from "./protocol.js";
import type { Room } from "./room.js";

/** In-room messages that respawn or move a body: the server rate-limits these much more tightly. */
export const isHeavyRoomMessage = (type: number) => type === Msg.PickLoadout || type === Msg.LabTool;

/** Hand one in-room message to the room. False: not an in-room message (the caller decides what that means). */
export function handleRoomMessage(room: Room, memberId: number, type: number, r: ByteReader): boolean {
  switch (type) {
    case Msg.Input:
      room.onInput(memberId, decodeInput(r));
      return true;
    case Msg.Ping:
      room.onPing(memberId, decodePing(r).clientTime);
      return true;
    case Msg.Resync:
      room.onResync(memberId); // cheap (the next snapshot is sent in full), and must not be lost
      return true;
    case Msg.PickLoadout:
      room.pickLoadout(memberId, decodePickLoadout(r));
      return true;
    case Msg.LabTool:
      room.onLabTool(memberId, decodeLabTool(r));
      return true;
  }
  return false;
}
