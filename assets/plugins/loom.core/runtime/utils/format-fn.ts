function fraction(current: number, total: number): string {
    return `${current}/${total}`;
}

function range(min: number, max: number, separator = "-"): string {
    return `${min}${separator}${max}`;
}

function pct(num: number, decimal = 1): string {
    if (isNaN(num)) return `${(0).toFixed(decimal)}%`;

    const rate = (num > 1) ? (num / 100) : num;
    return `${(rate * 100).toFixed(decimal)}%`;
}

function _x00(num: number) {
    return num.toString().padStart(2, "0");
}

function hms(seconds: number, short = false): string {
    const s = Math.max(0, seconds | 0);
    const h = (s / 3600) | 0;
    const m = ((s % 3600) / 60) | 0;
    const sec = s % 60;

    if (short) {
        if (h) return `${_x00(h)}:${_x00(m)}:${_x00(sec)}`;
        if (m) return `${_x00(m)}:${_x00(sec)}`;
        return `${_x00(sec)}`;
    }
    return `${_x00(h)}:${_x00(m)}:${_x00(sec)}`;
}

function dhms(seconds: number, short = false): string {
    const s = Math.max(0, seconds | 0);
    const d = (s / 86400) | 0;
    const h = ((s % 86400) / 3600) | 0;
    const m = ((s % 3600) / 60) | 0;
    const sec = s % 60;

    if (short) {
        if (d) return `${d} ${_x00(h)}:${_x00(m)}:${_x00(sec)}`;
        if (h) return `${_x00(h)}:${_x00(m)}:${_x00(sec)}`;
        if (m) return `${_x00(m)}:${_x00(sec)}`;
        return `${_x00(sec)}`;
    }

    if (d) return `${d} ${_x00(h)}:${_x00(m)}:${_x00(sec)}`;
    return `${_x00(h)}:${_x00(m)}:${_x00(sec)}`;
}

function dhmsAbbr(seconds: number, short = false): string {
    const s = Math.max(0, seconds | 0);
    const d = (s / 86400) | 0;
    const h = ((s % 86400) / 3600) | 0;
    const m = ((s % 3600) / 60) | 0;
    const sec = s % 60;

    if (short) {
        if (d) return `${d}d${h}h${m}m${sec}s`;
        if (h) return `${h}h${m}m${sec}s`;
        if (m) return `${m}m${sec}s`;
        return `${sec}s`;
    }

    return `${d}d${h}h${m}m${sec}s`;
}

function sign(num: number, unit?: string): string {
    if (isNaN(num)) return "0";
    if (unit) {
        if (num > 0) return `+${num} ${unit}`;
        return `${num} ${unit}`;
    }
    if (num > 0) return `+${num}`;
    return `${num}`;
}

const NUM_ABBR_UNITS = [
    { value: 1e12, symbol: "T" },
    { value: 1e9, symbol: "B" },
    { value: 1e6, symbol: "M" },
    { value: 1e3, symbol: "K" },
];
function abbr(num: number, decimal = 1): string {
    if (isNaN(num)) return "0";

    for (const unit of NUM_ABBR_UNITS) {
        if (Math.abs(num) >= unit.value) {
            const formatted = (num / unit.value).toFixed(decimal);
            return formatted.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") + unit.symbol;
        }
    }
    return num.toString();
}

function thousands(num: number): string {
    if (isNaN(num)) return "0";
    const [integer, decimal] = num.toString().split(".");
    const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decimal ? `${formattedInteger}.${decimal}` : formattedInteger;
}

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
function filesize(bytes: number, decimal = 1): string {
    if (isNaN(bytes)) return "0 B";
    const index = Math.min(Math.floor(Math.log10(bytes) / 3), FILE_SIZE_UNITS.length - 1);
    const value = bytes / Math.pow(1024, index);
    const formatted = value.toFixed(decimal).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
    return `${formatted} ${FILE_SIZE_UNITS[index]}`;
}

function truncate(text: string, maxLength: number, suffix = "..."): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - suffix.length) + suffix;
}

function fmt(template: string, ...args: any[]) {
    if (!template) return "";
    return template.replace(/{(\d+)}/g, (match, index) => {
        return args[index] ?? match;
    });
}

export const formatf = {
    fraction,
    range,
    pct,
    hms,
    dhms,
    dhmsAbbr,
    sign,
    abbr,
    thousands,
    filesize,
    truncate,
    fmt,
}