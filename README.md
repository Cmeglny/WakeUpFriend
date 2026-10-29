# WakeUpFriend

Show a double-arrow button when hovering over another member in a voice channel. If they are streaming, the button appears immediately to the left of the **LIVE** badge. Click it to move them to the next available voice room below and bring them back after one second by default.

## Features

- Requires **Move Members**, **View Channel**, and **Connect** permissions in the relevant channels.
- Skips stage, AFK, full, and inaccessible channels. No button appears when there is no suitable room below.
- Does not pull someone back if they move to another channel or disconnect. Your own voice row has no button.
- Runs one action at a time, with a three-second cooldown per member.
- If the return move fails, the red arrow retries only the return move.
- The return delay is configurable from **500 to 2500 ms** in the plugin settings.
- If Discord closes during an action, the pending return may not complete. Use Discord's normal move menu if needed.

## Installation

This repository contains a custom Vencord **userplugin**. You need **Git, Node.js, and pnpm**.

### Get the Vencord source

If you do not already have a Vencord source checkout:

```powershell
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile
```

### Add the plugin

Run these commands from your Vencord source directory:

```powershell
git clone https://github.com/Cmeglny/WakeUpFriend src/userplugins/wakeUpFriend
pnpm build
```

If this is your first time installing a source build into Discord Desktop, fully quit Discord from the system tray, then run:

```powershell
pnpm inject
```

In the Vencord Installer, select your Discord installation and apply the patch. Reopen Discord, then find **WakeUpFriend** under **Settings → Vencord → Plugins**. If your source build is already installed, rebuild it and fully restart Discord.

To install without Git, choose **Code → Download ZIP** on GitHub and extract it. Place the plugin directory so its entry point is exactly `Vencord/src/userplugins/wakeUpFriend/index.ts`, then follow the build step above. Keep your Vencord source directory in place.

Official guides: [Installing Vencord from source](https://docs.vencord.dev/installing/) · [Installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/)

## Updating

If you installed the plugin with Git, run these commands from your Vencord source directory:

```powershell
git -C src/userplugins/wakeUpFriend pull --ff-only
pnpm build
```

Fully restart Discord afterward. For ZIP installations, replace the plugin source files with the new version and rebuild.

## Compatibility

The sources were checked with **Vencord 1.15.14**, commit `644434941b515a2626a2161e219653cb36e723e7`. Changes to Discord's component structure or Vencord APIs may require updates.

## License

Copyright © 2026 cemuu. **GPL-3.0-or-later**. See [LICENSE](LICENSE) for the full license text. This is an independently maintained custom plugin.
