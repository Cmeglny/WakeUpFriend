/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 cemuu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildChannelStore, GuildStore, PermissionsBits, PermissionStore, RestAPI, showToast, UserStore, VoiceStateStore } from "@webpack/common";

import { nextRoom, VoiceChannel, WakeEngine, WakePlan, WakeResult } from "./core";
import style from "./style.css?managed";

const logger = new Logger("WakeUpFriend");
const rowSelector = '#channels [class*="voiceUser_"]';
const buttonSelector = ".vc-wakeupfriend-button";
const settings = definePluginSettings({
    returnDelay: {
        type: OptionType.NUMBER,
        description: "Geri getirmeden önce beklenecek süre (ms, 500–2500).",
        default: 1000,
        isValid: value => typeof value === "number" && Number.isFinite(value) && value >= 500 && value <= 2500
    }
});

function currentChannel(userId: string): string | null {
    return VoiceStateStore.getVoiceStateForUser(userId)?.channelId ?? null;
}

function info(id: string): VoiceChannel | undefined {
    const channel = ChannelStore.getChannel(id);
    if (!channel?.guild_id) return;
    return { id, guildId: channel.guild_id, name: channel.name ?? id, type: channel.type, userLimit: channel.userLimit ?? 0 };
}

function allowed(channel: VoiceChannel): boolean {
    const native = ChannelStore.getChannel(channel.id);
    return !!native && native.guild_id === channel.guildId
        && PermissionStore.can(PermissionsBits.VIEW_CHANNEL, native)
        && PermissionStore.can(PermissionsBits.CONNECT, native)
        && PermissionStore.can(PermissionsBits.MOVE_MEMBERS, native);
}

function planFor(userId: string): WakePlan | undefined {
    if (userId === UserStore.getCurrentUser()?.id) return;
    const id = currentChannel(userId);
    const source = id && info(id);
    if (!source || source.type !== 2) return;
    const guild = GuildStore.getGuild(source.guildId);
    if (!guild) return;
    const nativeChannels = GuildChannelStore.getChannels(source.guildId).VOCAL.map(entry => entry.channel);
    const categoryKey = (channel: typeof nativeChannels[number]): [number, string] => {
        const parent = channel.parent_id && ChannelStore.getChannel(channel.parent_id);
        return parent ? [parent.position, parent.id] : [-1, ""];
    };
    nativeChannels.sort((a, b) => {
        const [ap, ai] = categoryKey(a), [bp, bi] = categoryKey(b);
        return ap - bp || ai.localeCompare(bi, "en", { numeric: true }) || a.position - b.position || a.id.localeCompare(b.id, "en", { numeric: true });
    });
    const channels = nativeChannels.map(channel => info(channel.id)).filter((channel): channel is VoiceChannel => !!channel);
    const destination = nextRoom(source, channels, guild.afkChannelId ?? undefined, allowed,
        channelId => Object.keys(VoiceStateStore.getVoiceStatesForChannel(channelId)).length);
    if (!destination) return;
    return { userId, guildId: source.guildId, source, destination };
}

let observer: MutationObserver | undefined;
let animationFrame = 0;
let running = false;

function scheduleRefresh() {
    if (running && !animationFrame) animationFrame = requestAnimationFrame(refresh);
}

const engine = new WakeEngine({
    plan: planFor,
    channel: currentChannel,
    canReturn: plan => {
        const source = info(plan.source.id);
        return !!source && source.guildId === plan.guildId && allowed(source);
    },
    async move(plan, channelId) {
        const channel = info(channelId);
        if (!channel || channel.guildId !== plan.guildId || !allowed(channel)) throw new Error("Taşıma yetkisi veya kanal erişimi değişti.");
        await RestAPI.patch({
            url: `/guilds/${plan.guildId}/members/${plan.userId}`,
            body: { channel_id: channelId }
        });
    },
    sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    now: () => Date.now(),
    changed: scheduleRefresh
}, () => settings.store.returnDelay);

interface RowProps { user?: { id?: string; }; userId?: string; voiceState?: { userId?: string; }; }
interface Fiber { memoizedProps?: RowProps; return?: Fiber; }

/** Read only the voice row's own/ancestor props; never identify people by display names. */
function userForRow(row: HTMLElement): string | undefined {
    const key = Object.keys(row).find(key => key.startsWith("__reactFiber$"));
    if (!key) return;
    let fiber = (row as unknown as Record<string, Fiber>)[key];
    for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return!) {
        const props = fiber.memoizedProps;
        const id = props?.user?.id ?? props?.voiceState?.userId ?? props?.userId;
        if (id && /^\d+$/.test(id) && currentChannel(id)) return id;
    }
}

function report(result: WakeResult) {
    if (result.kind === "success") {
        showToast({ text: `WakeUpFriend: ${result.plan.source.name} kanalına geri getirildi.`, variant: "success" });
    } else if (result.kind === "return-failed") {
        logger.error("Return failed", result.error);
        showToast({ text: `WakeUpFriend: Geri dönüş başarısız. Yeniden denemek için kırmızı oka bas (${result.plan.source.name}).`, variant: "critical", duration: 10000 });
    } else if (result.kind === "outbound-failed") {
        logger.error("Move failed", result.error);
        showToast({ text: "WakeUpFriend: Taşınamadı. Yetkiyi ve kanal erişimini kontrol et.", variant: "critical" });
    } else {
        const messages = {
            busy: "Başka bir taşıma işlemi sürüyor.",
            cooldown: "Tekrar denemeden önce 3 saniye bekle.",
            unavailable: "Uygun alt oda veya taşıma yetkisi bulunamadı.",
            interrupted: "Kişinin ses kanalı değişti; geri çekme iptal edildi."
        };
        showToast({ text: `WakeUpFriend: ${messages[result.kind]}` });
    }
}

function makeButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vc-wakeupfriend-button";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M8 20V4m-4 4 4-4 4 4m4-4v16m-4-4 4 4 4-4");
    svg.append(path);
    button.append(svg);
    button.addEventListener("mousedown", event => event.stopPropagation());
    button.addEventListener("dblclick", event => event.stopPropagation());
    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const { userId } = button.dataset;
        if (!running || !userId) return;
        if (button.dataset.recovery !== "true" && currentChannel(userId) !== button.dataset.channelId) {
            report({ kind: "unavailable" });
            scheduleRefresh();
            return;
        }
        void engine.run(userId).then(report).catch(error => {
            logger.error("Unexpected error", error);
            showToast({ text: "WakeUpFriend: İşlem tamamlanamadı; kişinin ses kanalını kontrol et.", variant: "critical" });
        }).finally(scheduleRefresh);
    });
    return button;
}

/** Discord may add or replace the LIVE badge after this button was created. */
function placeButton(row: HTMLElement, button: HTMLButtonElement) {
    const content = row.querySelector(':scope > [class*="content_"]');
    const icons = content?.querySelector(':scope > [class*="icons_"]');
    const live = icons?.querySelector('[class*="badgeWrapper_"], .badge__52929');
    if (live?.parentElement) {
        if (button.parentElement !== live.parentElement || button.nextElementSibling !== live) live.before(button);
    } else if (icons) {
        if (icons.firstElementChild !== button) icons.prepend(button);
    } else {
        const host = content ?? row;
        if (button.parentElement !== host || host.lastElementChild !== button) host.append(button);
    }
}

function refresh() {
    animationFrame = 0;
    if (!running) return;
    for (const row of document.querySelectorAll<HTMLElement>(rowSelector)) {
        const userId = userForRow(row);
        const recovery = userId && engine.pendingReturns.get(userId);
        const plan = userId ? recovery ?? planFor(userId) : undefined;
        let button = row.querySelector<HTMLButtonElement>(buttonSelector);
        if (!userId || !plan) {
            button?.remove();
            row.classList.remove("vc-wakeupfriend-row");
            continue;
        }
        row.classList.add("vc-wakeupfriend-row");
        if (!button) {
            button = makeButton();
        }
        placeButton(row, button);
        button.dataset.userId = userId;
        button.dataset.channelId = plan.source.id;
        button.dataset.recovery = String(!!recovery);
        button.dataset.busy = String(engine.activeUser === userId);
        button.disabled = !!engine.activeUser;
        const label = recovery
            ? `WakeUpFriend: ${plan.source.name} kanalına geri getir`
            : `WakeUpFriend: ${plan.destination.name} kanalına taşı ve geri getir`;
        button.title = label;
        button.setAttribute("aria-label", label);
    }
}

export default definePlugin({
    name: "WakeUpFriend",
    description: "Ses kanalında üzerine geldiğin kişiyi uygun alt odaya taşıyıp geri getirir (Üyeleri Taşı yetkisi gerekir).",
    authors: [{ name: "cemuu", id: 0n }],
    enabledByDefault: true,
    settings,
    managedStyle: style,

    start() {
        running = engine.enabled = true;
        let lastRoot = document.getElementById("channels");
        observer = new MutationObserver(mutations => {
            const root = document.getElementById("channels");
            const rootChanged = root !== lastRoot;
            lastRoot = root;
            if (rootChanged || mutations.some(mutation =>
                (!root || mutation.target === root || root.contains(mutation.target))
                && (mutation.removedNodes.length > 0 || Array.from(mutation.addedNodes).some(node =>
                    !(node instanceof HTMLElement) || !node.matches(buttonSelector)))
            )) scheduleRefresh();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        VoiceStateStore.addChangeListener(scheduleRefresh);
        PermissionStore.addChangeListener(scheduleRefresh);
        GuildChannelStore.addChangeListener(scheduleRefresh);
        UserStore.addChangeListener(scheduleRefresh);
        scheduleRefresh();
    },

    stop() {
        running = engine.enabled = false;
        observer?.disconnect();
        observer = undefined;
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        VoiceStateStore.removeChangeListener(scheduleRefresh);
        PermissionStore.removeChangeListener(scheduleRefresh);
        GuildChannelStore.removeChangeListener(scheduleRefresh);
        UserStore.removeChangeListener(scheduleRefresh);
        document.querySelectorAll(buttonSelector).forEach(button => button.remove());
        document.querySelectorAll(".vc-wakeupfriend-row").forEach(row => row.classList.remove("vc-wakeupfriend-row"));
    }
});
