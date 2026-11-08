# Stretch Voice Coach

Finish a stretch routine by following voice cues: each movement announces its name, key points, and side changes, so your hands stay off the phone—and afterwards you can see how long you have practiced by routine type.

[简体中文](./README.md) · [Android APK (PGYER)](https://www.pgyer.com/lashenyuyinbobao)

## What it is

An offline stretch coach for Android. It turns a sequence of movements into a routine, announces each one on cue, and speaks up for side changes, rests, and the finish; the screen only shows the current movement and remaining time, so you do not have to keep watching.

Voice lines are pre-generated local audio, so playback continues on the lock screen and in the background. No network, no login, no practice data uploaded.

## What it does

- **Offline voice routines**: each movement announces its name, key points, and side change from a bundled audio pack, with no system TTS or network dependency.
- **Movement library and routine building**: organize movements by training type (stretch, warm-up, core) and build your own routines.
- **Side change and rest cues**: unilateral movements prompt a side change on time, rests count down, and the next segment starts automatically.
- **Foreground service keep-alive**: keeps playing on the lock screen and in the background, with pause/resume/stop in the notification.
- **History stats**: only practice time with a trustworthy clock source is recorded, aggregated by training type with the latest 10 entries; entries can be deleted individually or cleared.
- **Chinese and English UI**: follows the system language on first launch, switchable in settings, and the choice survives restarts.
- **No account, no network**: data lives only in local SQLite.

## Install and run

On a real phone: download the latest APK from [PGYER](https://www.pgyer.com/lashenyuyinbobao) and install over the existing app to keep data.

From source (Node.js 20+ and Android Studio):

```bash
npm install
npm test              # jest unit tests
npm run typecheck
npx expo run:android  # build and install on a connected device
```

Release builds use a fixed signing key; upgrade in place and do not uninstall.

## Data and privacy

- Practice records stay on-device and are deleted on uninstall; there is no cloud sync or account system.
- Audio assets ship with the app, and playback makes no network requests.
- The repository and docs contain no real user practice data.

## Known limitations

- History starts counting only after stats are enabled; older versions had no history table, so past sessions cannot be recovered.
- A session that ends abnormally (for example, force-killed) may not be counted; the UI explains this.
- Only the Android line is maintained.

## Layout

```text
app/         # screens and navigation
features/    # routines, playback, history stats
domain/      # movements, routines, timing model
services/    # voice, foreground service, notifications
assets/audio # pre-generated voice and cue sounds
docs/        # plans, QA, handoff, governance
```

See `docs/pm/PRODUCT_PLAN_V1.3.md` for scope and `CHANGELOG.md` for changes.
