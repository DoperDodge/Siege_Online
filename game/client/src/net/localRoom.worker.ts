// The Range Lab's offline room, in a Web Worker (DECISIONS D-052): messages in and out as transferable
// byte buffers, exactly what the WebSocket would carry (net/local.ts is the page's end).
import { LocalHost } from "./localHost.js";

export type FromLocalRoom = { kind: "open" } | { kind: "data"; bytes: ArrayBuffer } | { kind: "close"; code: number; reason: string };

const post = (m: FromLocalRoom, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

const host = new LocalHost(
  (bytes) => {
    const copy = bytes.slice(); // its own buffer, handed over without a copy
    post({ kind: "data", bytes: copy.buffer }, [copy.buffer]);
  },
  (code, reason) => post({ kind: "close", code, reason }),
);
self.onmessage = (e: MessageEvent<ArrayBuffer>) => host.onMessage(new Uint8Array(e.data));
host.start();
post({ kind: "open" });
