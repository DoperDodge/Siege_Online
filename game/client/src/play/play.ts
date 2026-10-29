// The Play page (Phase 6, match/DESIGN.md §11): your name, a new match in any format, a room by its code, the match
// rooms anyone may join (the server's room list, refreshed every few seconds), and your loadouts: each operator's
// weapons and attachments, kept in this browser for matches and the labs (ui/loadout.ts). The match itself runs on
// the match page (labs/match.html), which creates or joins the room from its link.
import { ByteReader, decodeRoomList, encodeHello, encodeListRooms, isFormat, loadGameData, Msg, Phase, type RoomListEntry, type WeaponPick } from "@redmond/shared";
import { serverUrl } from "../net/online.js";
import { escapeHtml } from "../ui/dom.js";
import { changedPick, loadoutRows, saveLoadout, savedLoadout, type Slot } from "../ui/loadout.js";

const data = loadGameData();
const formats = [...data.modes.values()].filter(isFormat);
const formatName = (id: string) => formats.find((m) => m.id === id)?.match.name ?? id;
const NAME_KEY = "redmond.name";
const FORMAT_KEY = "redmond.format";
const LOADOUT_OP_KEY = "redmond.loadoutOperator";
const remembered = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return ""; // storage blocked
  }
};
const remember = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // not remembered; fine
  }
};

/** What each format is, in a line (the create box). */
const FORMAT_NOTES: Record<string, string> = {
  quick_match: "4 rounds, first to 3; the site is drawn; no bans.",
  unranked: "6 rounds, first to 4; defenders vote for the site; one ban per side each half.",
  ranked: "Unranked's rules with a local rating kept in this browser.",
  one_v_one: "One player a side, 6 rounds; the winner of a round can't pick the same operator again.",
  custom: "Every setting is the host's (starts as Unranked).",
  practice: "Rounds without end; one side may be empty.",
};

const root = document.getElementById("play")!;
root.innerHTML = `
  <h1>PLAY</h1>
  <p class="tag">Matches on Oregon: two teams of 1–5, uneven allowed. <a href="/">Home</a></p>
  <section><h2>Your name</h2><div class="row"><input class="name" maxlength="24" placeholder="Player" autocomplete="nickname"></div></section>
  <section><h2>New match</h2>
    <div class="row"><select class="format">${formats.map((m) => `<option value="${m.id}">${escapeHtml(m.match.name)}</option>`).join("")}</select><button class="primary create">Create</button></div>
    <p class="format-note"></p>
    <p class="note format-note">You host it: send the room code or the invite link to your friends.</p>
  </section>
  <section><h2>Join by code</h2><div class="row"><input class="code" maxlength="5" placeholder="CODE" autocapitalize="characters" spellcheck="false"><button class="join">Join</button></div><p class="error"></p></section>
  <section><h2>Open matches</h2><div class="rooms"><p class="empty">Looking for matches…</p></div></section>
  <section><h2>Loadouts</h2>
    <div class="row"><select class="lo-op">${(["attacker", "defender"] as const)
      .map(
        (side) =>
          `<optgroup label="${side === "attacker" ? "Attackers" : "Defenders"}">${[...data.operators.values()]
            .filter((o) => o.side === side)
            .map((o) => `<option value="${o.id}">${escapeHtml(o.name)} — ${o.healthRating} health / ${o.speedRating} speed</option>`)
            .join("")}</optgroup>`,
      )
      .join("")}</select></div>
    <div class="loadout"></div>
    <p class="note">Each operator keeps the weapons and attachments you set here: you carry them into every match and lab, and can still change them on a match's planning screen. <span class="unv">?</span> marks a number that is still a placeholder.</p>
  </section>
  <footer>Non-commercial fan project. No Ubisoft assets are used.</footer>`;
const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const nameInput = $<HTMLInputElement>(".name");
const formatSelect = $<HTMLSelectElement>(".format");
const codeInput = $<HTMLInputElement>(".code");
const error = $(".error");
nameInput.value = remembered(NAME_KEY);
formatSelect.value = formats.some((m) => m.id === remembered(FORMAT_KEY)) ? remembered(FORMAT_KEY) : (formats[0]?.id ?? "");
const showNote = () => ($(".format-note").textContent = FORMAT_NOTES[formatSelect.value] ?? "");
showNote();
formatSelect.onchange = () => {
  remember(FORMAT_KEY, formatSelect.value);
  showNote();
};
nameInput.oninput = () => remember(NAME_KEY, nameInput.value.trim());

/** The match page, which creates or joins the room itself (the name goes with it). */
function go(params: Record<string, string>) {
  remember(NAME_KEY, nameInput.value.trim());
  location.href = `/labs/match.html?${new URLSearchParams(params)}`;
}
$(".create").onclick = () => go({ format: formatSelect.value });
const join = (code: string) => {
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 5) {
    error.textContent = "A room code has 5 letters and digits.";
    return;
  }
  go({ room: c });
};
$(".join").onclick = () => join(codeInput.value);
codeInput.onkeydown = (e) => {
  if (e.key === "Enter") join(codeInput.value);
};
codeInput.value = (new URLSearchParams(location.search).get("room") ?? "").toUpperCase();

// ---------------------------------------------------------------- your loadouts

const opSelect = $<HTMLSelectElement>(".lo-op");
const loadoutBox = $(".loadout");
if (data.operators.has(remembered(LOADOUT_OP_KEY))) opSelect.value = remembered(LOADOUT_OP_KEY);
const showLoadout = () => (loadoutBox.innerHTML = loadoutRows(data, savedLoadout(data, opSelect.value)));
showLoadout();
opSelect.onchange = () => {
  remember(LOADOUT_OP_KEY, opSelect.value);
  showLoadout();
};
loadoutBox.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement;
  if (!t.dataset.slot || !t.dataset.part) return;
  saveLoadout(changedPick(savedLoadout(data, opSelect.value), t.dataset.slot as Slot, t.dataset.part as keyof WeaponPick, t.value));
  showLoadout(); // another weapon has other attachments
});

// ---------------------------------------------------------------- the room list

function showRooms(rooms: RoomListEntry[]) {
  const box = $(".rooms");
  if (!rooms.length) {
    box.innerHTML = '<p class="empty">No open matches right now: create one.</p>';
    return;
  }
  const state = (r: RoomListEntry) => (r.phase === Phase.Lobby ? "In the lobby" : r.phase === Phase.MatchEnd ? "Match over" : `Round ${r.round}`);
  box.innerHTML = `<table><tr><th>Code</th><th>Format</th><th>Players</th><th></th><th></th></tr>${rooms
    .map((r) => `<tr><td class="code">${escapeHtml(r.code)}</td><td>${escapeHtml(formatName(r.format))}</td><td>${r.players} / ${r.maxPlayers}</td><td>${state(r)}</td><td><button data-room="${escapeHtml(r.code)}">Join</button></td></tr>`)
    .join("")}</table>`;
  for (const b of box.querySelectorAll<HTMLButtonElement>("[data-room]")) b.onclick = () => join(b.dataset.room!);
}

/** A connection that only asks for the room list (it never joins); a new one when the server closes it. */
function listRooms() {
  const ws = new WebSocket(serverUrl());
  ws.binaryType = "arraybuffer";
  let timer: ReturnType<typeof setInterval> | null = null;
  ws.onopen = () => {
    const send = (b: Uint8Array) => ws.send(b as Uint8Array<ArrayBuffer>); // our encoders never use shared memory
    send(encodeHello(nameInput.value.trim() || "Player", data.dataHash));
    const ask = () => document.visibilityState === "visible" && ws.readyState === WebSocket.OPEN && send(encodeListRooms());
    ask();
    timer = setInterval(ask, 3000);
  };
  ws.onmessage = (e) => {
    if (!(e.data instanceof ArrayBuffer)) return;
    const bytes = new Uint8Array(e.data);
    try {
      if (bytes[0] === Msg.RoomList) showRooms(decodeRoomList(new ByteReader(bytes.subarray(1))));
      else if (bytes[0] === Msg.Error) $(".rooms").innerHTML = '<p class="empty">The game has been updated: refresh the page.</p>';
    } catch {
      // a message this page doesn't understand: the next list will do
    }
  };
  ws.onclose = () => {
    if (timer) clearInterval(timer);
    setTimeout(listRooms, 5000); // the server closes idle lobby connections; come back for the list
  };
}
listRooms();
