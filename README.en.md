# Stretching Voice-Broadcast App

Stretch without staring at your phone counting seconds: the app reads each move and the beat out loud, so you just follow the voice until the routine is done. Phone in your pocket, eyes on the mirror.

[简体中文](./README.md) | English

<p>
  <img src="./docs/screenshots/home-my-routines.png" alt="Home: my routines" width="200" />
  <img src="./docs/screenshots/action-library.png" alt="Exercise library with body-part filters" width="200" />
  <img src="./docs/screenshots/settings.png" alt="Settings: language and voice options" width="200" />
</p>

## What you can do

- **Follow by ear**: each move is announced — seconds left, switch sides, next exercise — no screen needed.
- **A built-in exercise library**: filter by body part and assemble a routine right away.
- **Your own routines**: create one by picking and ordering moves; common presets ship with it (morning full body, post-run legs, office desk recovery, before bed).
- **Loops and speed control**: run a sequence repeatedly, faster or slower.
- **Background audio**: layer ambient sound under the voice.
- **History**: keeps track of which routines you did and how often.

## Who it's for

Anyone who stretches but hates "phone in one hand, counting seconds"; runners and gym-goers cooling down; office workers sneaking a routine between meetings.

## Quick start

Requires Node and an Android environment (device or emulator).

```bash
npm install
npx expo start        # development
npm run android       # build and install on an Android device
npm run test          # run the tests
npm run typecheck     # type checking
```

Everything is stored on the device: no account, no login, works offline.

## Where it stands

- Version **1.2.0** (`app.json`).
- Primarily **Android**; development is paused at a milestone — see `docs/handoff/HANDOFF.md`.
- Known open items: Android foreground service, Doze power-saving behaviour and per-version adaptation are not scheduled yet.

## Read more

- Stack: Expo 57 + React Native, `expo-speech` for the voice, `expo-audio` for background sound, `expo-sqlite` for local data.
- Plans and acceptance records: `docs/plan/`, `docs/qa/`, `docs/handoff/`.
- Governance scaffolding shipped with this repo (unrelated to the app): `docs/ORCA-模板包原文.md`.
