// 时间工具职责
// 1. 获取当前可信时间戳
// 2. 时间戳转换为本地 Date
// 3. 使用服务器时间校准本地时间，避免依赖玩家系统时间

const SECOND_TS_THRESHOLD = 1e12;
const MAX_DATE_TS = 8.64e15;

export class TimeStamp {
    private _baseServerTs = 0;
    private _basePerfTs = 0;
    private _lastServerTs = 0;
    private _lastSyncLocalTs = 0;
    private _lastRawTs = 0;
    private _timeCheatDetected = false;

    /**
     * 当前校准后的时间戳，单位毫秒。
     */
    now(): number {
        const rawNow = Date.now();
        if (this._lastRawTs > 0 && Math.abs(rawNow - this._lastRawTs) > 10 * 1000) {
            this._timeCheatDetected = true;
        }
        this._lastRawTs = rawNow;

        if (!this.calibrated) {
            return rawNow;
        }
        return this._baseServerTs + (this.perfNow() - this._basePerfTs);
    }

    /**
     * 原始本地时间戳，单位毫秒。
     */
    raw(): number {
        return Date.now();
    }

    /**
     * 将秒/毫秒时间戳统一转换为本地 Date。
     */
    ts2date(ts: number): Date {
        return new Date(this.normalizeTs(ts));
    }

    isSameDay(ts1: number, ts2: number): boolean {
        const d1 = this.ts2date(ts1);
        const d2 = this.ts2date(ts2);
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    }

    endOfDay(ts: number): number {
        const date = this.ts2date(ts);
        date.setHours(23, 59, 59, 999);
        return date.getTime();
    }

    endOfToday(): number {
        return this.endOfDay(this.now());
    }

    startOfDay(ts: number): number {
        const date = this.ts2date(ts);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    }

    startOfToday(): number {
        return this.startOfDay(this.now());
    }

    /**
     * 使用服务器时间戳校准本地时间。
     * @returns 当前校准后的时间戳（毫秒）。
     */
    serverNow(serverTs: number): number {
        serverTs = this.normalizeTs(serverTs);
        this._baseServerTs = serverTs;
        this._basePerfTs = this.perfNow();
        this._lastServerTs = serverTs;
        this._lastSyncLocalTs = Date.now();
        this._lastRawTs = this._lastSyncLocalTs;
        this._timeCheatDetected = false;
        return this.now();
    }

    /**
     * 当前与本地时间的偏移量，单位毫秒。
     */
    get offsetMs(): number {
        if (!this.calibrated) {
            return 0;
        }
        return this._baseServerTs + (this.perfNow() - this._basePerfTs) - Date.now();
    }

    /**
     * 最近一次用于校准的服务器时间戳，单位毫秒。
     */
    get lastServerTs(): number {
        return this._lastServerTs;
    }

    /**
     * 最近一次校准时的本地时间戳，单位毫秒。
     */
    get lastSyncLocalTs(): number {
        return this._lastSyncLocalTs;
    }

    /**
     * 判断是否已经做过服务器时间校准。
     */
    get calibrated(): boolean {
        return this._lastSyncLocalTs > 0;
    }

    /**
     * 是否检测到本地系统时间发生明显跳变。
     */
    get timeCheatDetected(): boolean {
        return this._timeCheatDetected;
    }

    private normalizeTs(ts: number): number {
        if (!Number.isFinite(ts)) {
            throw new Error(`invalid timestamp: ${ts}`);
        }

        const value = Math.trunc(ts);
        if (!Number.isSafeInteger(value)) {
            throw new Error(`unsafe timestamp: ${ts}`);
        }

        const normalizedTs = Math.abs(value) < SECOND_TS_THRESHOLD ? value * 1000 : value;
        if (!Number.isSafeInteger(normalizedTs) || Math.abs(normalizedTs) > MAX_DATE_TS) {
            throw new Error(`timestamp out of range: ${ts}`);
        }

        return normalizedTs;
    }

    private perfNow(): number {
        if (typeof performance !== "undefined" && typeof performance.now === "function") {
            return performance.now();
        }
        return Date.now();
    }
}