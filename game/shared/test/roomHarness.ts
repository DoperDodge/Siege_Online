// A room and in-process clients at zero latency, talking through the same message handlers the server
// uses (net/host.ts) and the ClientSession code the page runs. Each client's input for the next ticks is
// `cmd`; `tick()` advances everyone one tick.
import { ByteReader, ClientSession, DT, handleRoomMessage, Room, Stance, type GameEvent, type InputCmd } from "../src/index.js";

export async function roomWith(levelId: string, ops: string[]) {
  const room = await Room.create("WALLS", levelId, { lab: true, seed: 11 });
  const clock = { t: 0 };
  type Client = { session: ClientSession; id: number; toServer: Uint8Array[]; events: GameEvent[]; cmd: Partial<Omit<InputCmd, "seq">> };
  const clients: Client[] = [];
  const add = async (op: string) => {
    const toServer: Uint8Array[] = [];
    const events: GameEvent[] = [];
    const session = new ClientSession({ send: (b) => toServer.push(b), now: () => clock.t, onEvents: (_t, evs) => events.push(...evs), trackMispredictions: true });
    const id = room.join(`p${clients.length}`, { send: (b) => session.handle(b), buffered: () => 0 }, op)!;
    await session.loaded();
    const c: Client = { session, id, toServer, events, cmd: {} };
    clients.push(c);
    return c;
  };
  for (const op of ops) await add(op);
  const tick = () => {
    clock.t += DT * 1000;
    for (const c of clients) if (c.session.ready) c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...c.cmd });
    for (const c of clients)
      for (const b of c.toServer.splice(0)) {
        const r = new ByteReader(b.subarray(1));
        if (!handleRoomMessage(room, c.id, b[0], r)) throw new Error(`unexpected message ${b[0]}`);
      }
    room.step();
  };
  return { room, clients, add, tick };
}

