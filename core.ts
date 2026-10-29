/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 cemuu
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface VoiceChannel {
    id: string;
    guildId: string;
    name: string;
    type: number;
    userLimit: number;
}

export interface WakePlan {
    userId: string;
    guildId: string;
    source: VoiceChannel;
    destination: VoiceChannel;
}

/** Input must be in sidebar order, including the source and inaccessible rooms. */
export function nextRoom(
    source: VoiceChannel,
    channels: VoiceChannel[],
    afkId: string | undefined,
    allowed: (channel: VoiceChannel) => boolean,
    occupancy: (id: string) => number
): VoiceChannel | undefined {
    if (source.type !== 2 || !allowed(source)) return;
    const index = channels.findIndex(channel => channel.id === source.id);
    if (index < 0) return;
    return channels.slice(index + 1).find(channel =>
        channel.guildId === source.guildId
        && channel.type === 2
        && channel.id !== afkId
        && allowed(channel)
        && (channel.userLimit === 0 || occupancy(channel.id) < channel.userLimit)
    );
}

export type WakeResult =
    | { kind: "success"; plan: WakePlan; }
    | { kind: "busy" | "cooldown" | "unavailable" | "interrupted"; }
    | { kind: "outbound-failed"; error: unknown; }
    | { kind: "return-failed"; plan: WakePlan; error?: unknown; };

export interface WakeAdapter {
    plan(userId: string): WakePlan | undefined;
    channel(userId: string): string | null;
    canReturn(plan: WakePlan): boolean;
    move(plan: WakePlan, channelId: string): Promise<void>;
    sleep(milliseconds: number): Promise<void>;
    now(): number;
    changed(): void;
}

export class WakeEngine {
    activeUser: string | undefined;
    readonly pendingReturns = new Map<string, WakePlan>();
    enabled = true;
    private readonly cooldowns = new Map<string, number>();

    constructor(private readonly adapter: WakeAdapter, private readonly delay: () => number) { }

    private async observe(plan: WakePlan, destination: string, waitingFrom: string): Promise<"arrived" | "interrupted" | "timeout"> {
        const deadline = this.adapter.now() + 5000;
        do {
            const current = this.adapter.channel(plan.userId);
            if (current === destination) return "arrived";
            if (current !== waitingFrom) return "interrupted";
            await this.adapter.sleep(100);
        } while (this.adapter.now() < deadline);
        return "timeout";
    }

    private async restore(plan: WakePlan): Promise<WakeResult> {
        const current = this.adapter.channel(plan.userId);
        if (current === plan.source.id) {
            this.pendingReturns.delete(plan.userId);
            return { kind: "success", plan };
        }
        // Do not pull back somebody who disconnected or chose a third room.
        if (current !== plan.destination.id) {
            this.pendingReturns.delete(plan.userId);
            return { kind: "interrupted" };
        }
        if (!this.adapter.canReturn(plan)) return { kind: "return-failed", plan };
        try {
            await this.adapter.move(plan, plan.source.id);
            const outcome = await this.observe(plan, plan.source.id, plan.destination.id);
            if (outcome === "arrived") {
                this.pendingReturns.delete(plan.userId);
                return { kind: "success", plan };
            }
            if (outcome === "interrupted") {
                this.pendingReturns.delete(plan.userId);
                return { kind: "interrupted" };
            }
            return { kind: "return-failed", plan };
        } catch (error) {
            if (this.adapter.channel(plan.userId) === plan.source.id) {
                this.pendingReturns.delete(plan.userId);
                return { kind: "success", plan };
            }
            return { kind: "return-failed", plan, error };
        }
    }

    async run(userId: string): Promise<WakeResult> {
        if (!this.enabled) return { kind: "unavailable" };
        if (this.activeUser) return { kind: "busy" };
        if ((this.cooldowns.get(userId) ?? 0) > this.adapter.now()) return { kind: "cooldown" };
        const recovery = this.pendingReturns.get(userId);
        const plan = recovery ?? this.adapter.plan(userId);
        if (!plan) return { kind: "unavailable" };
        // Validate again at click time, rather than trusting the hovered row.
        if (!recovery && this.adapter.channel(userId) !== plan.source.id) return { kind: "unavailable" };

        this.activeUser = userId;
        this.adapter.changed();
        try {
            if (recovery) return await this.restore(plan);
            try {
                await this.adapter.move(plan, plan.destination.id);
            } catch (error) {
                // A response may fail after the server has applied the move.
                if (this.adapter.channel(userId) === plan.destination.id) {
                    this.pendingReturns.set(userId, plan);
                    return await this.restore(plan);
                }
                return { kind: "outbound-failed", error };
            }

            this.pendingReturns.set(userId, plan);
            const observed = await this.observe(plan, plan.destination.id, plan.source.id);
            if (observed === "interrupted") {
                this.pendingReturns.delete(userId);
                return { kind: "interrupted" };
            }
            if (observed === "timeout") {
                // The server acknowledged the outbound move but gateway state
                // did not arrive. Compensate back to the original channel once.
                if (!this.adapter.canReturn(plan)) return { kind: "return-failed", plan };
                try {
                    await this.adapter.move(plan, plan.source.id);
                    this.pendingReturns.delete(userId);
                    return { kind: "success", plan };
                } catch (error) {
                    return { kind: "return-failed", plan, error };
                }
            }

            await this.adapter.sleep(Math.min(2500, Math.max(500, this.delay())));
            // Disabling the plugin stops new moves, but never cancels a return.
            return await this.restore(plan);
        } finally {
            this.cooldowns.set(userId, this.adapter.now() + 3000);
            this.activeUser = undefined;
            this.adapter.changed();
        }
    }
}
