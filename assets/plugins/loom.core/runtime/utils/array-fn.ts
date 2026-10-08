function shuffle<T>(arr: T[], result?: T[]): T[] {
    if (result && result !== arr) {
        result.length = 0;
        result.push(...arr);
    } else {
        result = arr;
    }

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

// 原地去重，修改原数组
function distinct<T, K = unknown>(arr: T[], key?: (item: T) => K): void {
    if (!key) {
        const set = new Set(arr);
        arr.length = 0;
        arr.push(...set);
        return;
    }

    const map = new Map<K, T>();
    for (const item of arr) {
        const k = key(item);
        if (!map.has(k)) {
            map.set(k, item);
        }
    }
    arr.length = 0;
    arr.push(...map.values());
}

function distinct2<T, K = unknown>(arr: T[], key?: (item: T) => K): T[] {
    if (!key) {
        return [...new Set(arr)];
    }
    const map = new Map<K, T>();
    for (const item of arr) {
        const k = key(item);
        if (!map.has(k)) {
            map.set(k, item);
        }
    }
    return Array.from(map.values());
}

function random<T>(array: T[]): T | undefined {
    const len = array.length;
    if (len === 0) return undefined;
    const idx = Math.floor(Math.random() * len);
    return array[idx];
}

function randomByWeightIdx(array: number[]): number | undefined {
    const len = array.length;
    if (len === 0) return undefined;
    let totalWeight = 0;
    let random = Math.random();
    for (let i = 0; i < len; i++) {
        const weight = array[i];
        if (Number.isFinite(weight) && weight > 0) {
            totalWeight += weight;
        }
    }
    if (totalWeight <= 0) return undefined;
    random *= totalWeight;
    for (let i = 0; i < len; i++) {
        const weight = array[i];
        if (!Number.isFinite(weight) || weight <= 0) continue;
        random -= weight;
        if (random <= 0) return i;
    }
    return undefined;
}

function randomByWeightObj<T extends { weight: number }>(array: T[]): T | undefined {
    const len = array.length;
    if (len === 0) return undefined;
    let totalWeight = 0;
    let random = Math.random();
    for (let i = 0; i < len; i++) {
        const weight = array[i].weight;
        if (Number.isFinite(weight) && weight > 0) {
            totalWeight += weight;
        }
    }
    if (totalWeight <= 0) return undefined;
    random *= totalWeight;
    for (let i = 0; i < len; i++) {
        const weight = array[i].weight;
        if (!Number.isFinite(weight) || weight <= 0) continue;
        random -= weight;
        if (random <= 0) return array[i];
    }
    return undefined;
}

function randomByWeight(array: number[]): number | undefined;
function randomByWeight<T extends { weight: number }>(array: T[]): T | undefined;
function randomByWeight(array: number[] | { weight: number }[]): number | { weight: number } | undefined {
    if (array.length === 0) return undefined;
    if (typeof array[0] === "number") return randomByWeightIdx(array as number[]);
    return randomByWeightObj(array as { weight: number }[]);
}

function binSearch<T extends number | string>(arr: T[], target: T): number {
    let left = 0;
    let right = arr.length - 1;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (arr[mid] === target) return mid;
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}

export const arrayf = {
    shuffle,
    distinct,
    distinct2,
    random,
    randomByWeight,
    binSearch,
};
