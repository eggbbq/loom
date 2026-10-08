export function createAwaiter(timer: Laya.Timer) {
    return {
        seconds(seconds: number): Promise<void> {
            return new Promise<void>((r) => {
                timer.once(seconds * 1000, null, () => {
                    r();
                });
            });
        },

        until(func: () => boolean, interval: number = 0): Promise<void> {
            return new Promise<void>((r) => {
                const caller = {};
                timer.loop(interval * 1000, caller, () => {
                    if (func()) {
                        timer.clearAll(caller);
                        r();
                    }
                });
            });
        },

        while(func: () => boolean, interval: number = 0): Promise<void> {
            return new Promise<void>((r) => {
                const caller = {};
                timer.loop(interval * 1000, caller, () => {
                    if (!func()) {
                        timer.clearAll(caller);
                        r();
                    }
                });
            });
        },

        frames(frames: number = 1): Promise<void> {
            return new Promise<void>((r) => {
                timer.frameOnce(frames, null, () => {
                    r();
                });
            });
        }
    }
}