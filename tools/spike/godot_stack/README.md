# Godot tech-stack spike (PLAN.md §3)

A throwaway project that proves the chosen stack works before Phase 1. It is **not** game code.
On start it builds a floor and a capsule `CharacterBody3D` under **Jolt** at **64 Hz**, opens an
**ENet** server and client on `127.0.0.1:27777`, sends one reliable packet, and after 2 seconds prints
`[spike] RESULT: PASS` (body landed on the floor + packet received) and quits.

Results from the cloud session are in `DECISIONS.md` (D-003).

## Try it on your PC (Windows 11)
1. Install the **Godot 4.7.2 .NET** editor and the **.NET 10 SDK** (links in the root `README.md`).
2. Godot → *Import* → pick `tools/spike/godot_stack/project.godot` → *Import & Edit*.
3. Press **F5** (Run). The *Output* panel should end with `[spike] RESULT: PASS`.
4. Optional: *Project → Export → Windows Desktop → Export Project* writes
   `builds/spike/windows/RedmondSpike.exe` (needs export templates: *Editor → Manage Export Templates*).
   Run it from a terminal to see the same PASS line.

## Headless (what the cloud session ran)
```
dotnet build
godot --headless --path tools/spike/godot_stack --import
godot --headless --path tools/spike/godot_stack                     # prints RESULT: PASS
godot --headless --path tools/spike/godot_stack --export-release "Linux Dedicated Server" \
      ../../../builds/spike/server/RedmondSpikeServer.x86_64
```
