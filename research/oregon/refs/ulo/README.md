# Your screenshots go here

Drop in-game screenshots of Oregon here, following `research/oregon/SCREENSHOT_CHECKLIST.md`
(file names matter — they're how future sessions find the right shot).

- While this repository is **public**, everything in this folder except this README is **gitignored**:
  your screenshots show Ubisoft's game, so they stay on your PC and are never published. To share one
  with Claude, attach it in the chat instead.
- If you make the repo private (GitHub → Settings → General → Danger Zone → Change visibility), delete
  the two `research/oregon/refs/ulo` lines in `.gitignore` and the image check in
  `tools/mapgen/hygiene.test.ts` will allow this folder; images are then stored with **Git LFS** (see
  `.gitattributes`). On Windows, install Git LFS once (`git lfs install`), then `git add` / `git commit` /
  `git push` as normal.
