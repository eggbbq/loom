export enum EDeserializeError {
    OK,
    NOT_ENOUGH,
    EXCEED_SIZE,
}

const MIN_CAPACITY: number = 16
const f_2power32 = Math.pow(2, 32)
const f_2power56 = Math.pow(2, 56)

// 工具函数：替代 Buffer 的读写方法（适配浏览器环境）
class BinaryUtils {
    // 读取 UInt8
    static readUInt8(buffer: Uint8Array, offset: number): number {
        return buffer[offset]
    }

    // 读取 UInt16 BE（大端）
    static readUInt16BE(buffer: Uint8Array, offset: number): number {
        return (buffer[offset] << 8) | buffer[offset + 1]
    }

    // 读取 Int16 BE
    static readInt16BE(buffer: Uint8Array, offset: number): number {
        const val = this.readUInt16BE(buffer, offset)
        return val > 0x7FFF ? val - 0x10000 : val
    }

    // 读取 Int32 BE
    static readInt32BE(buffer: Uint8Array, offset: number): number {
        let val = (buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]
        return val >> 0 // 转为有符号整数
    }

    // 读取 UInt32 BE
    static readUInt32BE(buffer: Uint8Array, offset: number): number {
        return (buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]
    }

    // 读取 Int32 LE（小端）
    static readInt32LE(buffer: Uint8Array, offset: number): number {
        let val = (buffer[offset + 3] << 24) | (buffer[offset + 2] << 16) | (buffer[offset + 1] << 8) | buffer[offset]
        return val >> 0
    }

    // 读取 Float32 LE
    static readFloatLE(buffer: Uint8Array, offset: number): number {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        return view.getFloat32(offset, true)
    }

    // 读取 Float64 LE
    static readDoubleLE(buffer: Uint8Array, offset: number): number {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        return view.getFloat64(offset, true)
    }

    // 读取 BigInt64 BE
    static readBigInt64BE(buffer: Uint8Array, offset: number): bigint {
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        return view.getBigInt64(offset, false)
    }

    // Uint8Array 转字符串（UTF-8）
    static uint8ArrayToString(buffer: Uint8Array, start: number, end: number): string {
        const bytes = buffer.subarray(start, end)
        if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes)

        // LayaNative 的 JS 运行时可能没有 TextDecoder。
        let result = ''
        for (let i = 0; i < bytes.length;) {
            const first = bytes[i++]
            if (first < 0x80) {
                result += String.fromCharCode(first)
                continue
            }

            let codePoint: number
            let extra: number
            if (first >= 0xc2 && first <= 0xdf) { codePoint = first & 0x1f; extra = 1 }
            else if (first >= 0xe0 && first <= 0xef) { codePoint = first & 0x0f; extra = 2 }
            else if (first >= 0xf0 && first <= 0xf4) { codePoint = first & 0x07; extra = 3 }
            else { result += '\ufffd'; continue }

            let valid = true
            for (let j = 0; j < extra; j++) {
                const next = bytes[i]
                if (i >= bytes.length || next < 0x80 || next > 0xbf
                    || (j === 0 && ((first === 0xe0 && next < 0xa0)
                        || (first === 0xed && next >= 0xa0)
                        || (first === 0xf0 && next < 0x90)
                        || (first === 0xf4 && next >= 0x90)))) {
                    valid = false
                    break
                }
                codePoint = (codePoint << 6) | (next & 0x3f)
                i++
            }
            if (!valid) { result += '\ufffd'; continue }
            if (codePoint === 0xfeff && i === 3) continue
            if (codePoint <= 0xffff) result += String.fromCharCode(codePoint)
            else {
                codePoint -= 0x10000
                result += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff))
            }
        }
        return result
    }

    // 复制 Uint8Array
    static copyUint8Array(buffer: Uint8Array, start: number, end: number): Uint8Array {
        return buffer.subarray(start, end).slice() // slice 生成新数组
    }
}

export default class ByteBuf {
    private static emptyBuff: Uint8Array = new Uint8Array(0)
    private static emptyBytes: Uint8Array = new Uint8Array(0)

    private _bytes: Uint8Array
    private _readerIndex: number = 0
    private _writerIndex: number = 0

    constructor(bytes?: Uint8Array) {
        this._bytes = bytes != null ? new Uint8Array(bytes) : ByteBuf.emptyBuff
        this._readerIndex = 0
        this._writerIndex = bytes != null ? bytes.length : 0
    }

    Replace(bytes: Uint8Array): void {
        this._bytes = new Uint8Array(bytes)
        this._readerIndex = 0
        this._writerIndex = bytes.length
    }

    Replace2(bytes: Uint8Array, beginPos: number, endPos: number): void {
        this._bytes = new Uint8Array(bytes.subarray(beginPos, endPos))
        this._readerIndex = 0 // 重置为0，因为新数组是从beginPos开始的子数组
        this._writerIndex = endPos - beginPos
    }

    // 修复 getter 语法错误
    get capacity(): number { return this._bytes.length }
    get size(): number { return this._writerIndex - this._readerIndex }
    get empty(): boolean { return this._writerIndex <= this._readerIndex }
    get notEmpty(): boolean { return this._writerIndex > this._readerIndex }
    get remaining(): number { return this._writerIndex - this._readerIndex }

    getBytesNotSafe(): Uint8Array { return this._bytes }

    addReadIndex(add: number): void {
        this._readerIndex += add
    }

    copyData(): Uint8Array {
        const n = this.remaining
        if (n > 0) {
            return ByteBuf.emptyBytes.slice(this._readerIndex, this._writerIndex)
        } else {
            return ByteBuf.emptyBytes
        }
    }

    discardReadBytes(): void {
        // 复制未读取的数据到数组开头
        const remaining = this.remaining
        if (remaining > 0) {
            this._bytes.set(this._bytes.subarray(this._readerIndex, this._writerIndex), 0)
            // 截断数组（可选，节省内存）
            this._bytes = this._bytes.subarray(0, remaining)
        } else {
            this._bytes = ByteBuf.emptyBuff
        }
        this._writerIndex = remaining
        this._readerIndex = 0
    }

    clear(): void {
        this._readerIndex = this._writerIndex = 0
    }

    private static propSize(initSize: number, needSize: number): number {
        let i = Math.max(initSize, MIN_CAPACITY)
        while (true) {
            if (i >= needSize) return i
            i <<= 1
            // 防止无限循环
            if (i > Number.MAX_SAFE_INTEGER) break
        }
        return needSize
    }

    private ensureRead(size: number): void {
        if (this._readerIndex + size > this._writerIndex) {
            throw new Error(`Not enough data to read: need ${size}, remaining ${this.remaining}`)
        }
    }

    private canRead(size: number): boolean {
        return (this._readerIndex + size <= this._writerIndex)
    }

    readBool(): boolean {
        this.ensureRead(1)
        return BinaryUtils.readUInt8(this._bytes, this._readerIndex++) !== 0
    }

    readByte(): number {
        this.ensureRead(1)
        return BinaryUtils.readUInt8(this._bytes, this._readerIndex++)
    }

    readShort(): number {
        this.ensureRead(1)
        const h = BinaryUtils.readUInt8(this._bytes, this._readerIndex)
        if (h < 0x80) {
            this._readerIndex++
            return h
        } else if (h < 0xc0) {
            this.ensureRead(2)
            const x = BinaryUtils.readUInt16BE(this._bytes, this._readerIndex) & 0x3fff
            this._readerIndex += 2
            return x
        } else if (h === 0xff) {
            this.ensureRead(3)
            const x = BinaryUtils.readInt16BE(this._bytes, this._readerIndex + 1)
            this._readerIndex += 3
            return x
        } else {
            throw new Error(`Invalid short data at index ${this._readerIndex}`)
        }
    }

    readInt(): number {
        this.ensureRead(1)
        const h = BinaryUtils.readUInt8(this._bytes, this._readerIndex)
        if (h < 0x80) {
            this._readerIndex++
            return h
        } else if (h < 0xc0) {
            this.ensureRead(2)
            const x = BinaryUtils.readUInt16BE(this._bytes, this._readerIndex) & 0x3fff
            this._readerIndex += 2
            return x
        } else if (h < 0xe0) {
            this.ensureRead(3)
            const x = ((h & 0x1f) << 16) | BinaryUtils.readUInt16BE(this._bytes, this._readerIndex + 1)
            this._readerIndex += 3
            return x
        } else if (h < 0xf0) {
            this.ensureRead(4)
            const x = BinaryUtils.readInt32BE(this._bytes, this._readerIndex) & 0x0fffffff
            this._readerIndex += 4
            return x
        } else {
            this.ensureRead(5)
            const x = BinaryUtils.readInt32BE(this._bytes, this._readerIndex + 1)
            this._readerIndex += 5
            return x
        }
    }

    readFint(): number {
        this.ensureRead(4)
        // 修复：添加偏移量参数 this._readerIndex
        const x = BinaryUtils.readInt32LE(this._bytes, this._readerIndex)
        this._readerIndex += 4
        return x
    }

    readLongAsNumber(): number {
        this.ensureRead(1)
        const h = BinaryUtils.readUInt8(this._bytes, this._readerIndex)
        if (h < 0x80) {
            this._readerIndex++
            return h
        } else if (h < 0xc0) {
            this.ensureRead(2)
            const x = BinaryUtils.readUInt16BE(this._bytes, this._readerIndex) & 0x3fff
            this._readerIndex += 2
            return x
        } else if (h < 0xe0) {
            this.ensureRead(3)
            const x = ((h & 0x1f) << 16) | BinaryUtils.readUInt16BE(this._bytes, this._readerIndex + 1)
            this._readerIndex += 3
            return x
        } else if (h < 0xf0) {
            this.ensureRead(4)
            const x = BinaryUtils.readInt32BE(this._bytes, this._readerIndex) & 0x0fffffff
            this._readerIndex += 4
            return x
        } else if (h < 0xf8) {
            this.ensureRead(5)
            const xl = BinaryUtils.readUInt32BE(this._bytes, this._readerIndex + 1)
            const xh = h & 0x07
            this._readerIndex += 5
            return xh * 0x100000000 + xl
        } else if (h < 0xfc) {
            this.ensureRead(6)
            const xl = BinaryUtils.readUInt32BE(this._bytes, this._readerIndex + 2)
            const xh = BinaryUtils.readUInt16BE(this._bytes, this._readerIndex) & 0x3ff
            this._readerIndex += 6
            return xh * 0x100000000 + xl
        } else if (h < 0xfe) {
            this.ensureRead(7)
            const xl = BinaryUtils.readUInt32BE(this._bytes, this._readerIndex + 3)
            const xh = (BinaryUtils.readUInt32BE(this._bytes, this._readerIndex) >> 8) & 0x1ffff
            this._readerIndex += 7
            return xh * 0x100000000 + xl
        } else if (h < 0xff) {
            this.ensureRead(8)
            const xl = BinaryUtils.readUInt32BE(this._bytes, this._readerIndex + 4)
            const xh = BinaryUtils.readUInt32BE(this._bytes, this._readerIndex) & 0xffffff
            this._readerIndex += 8
            return xh * f_2power32 + xl
        } else {
            this.ensureRead(9)
            const x = BinaryUtils.readBigInt64BE(this._bytes, this._readerIndex + 1)
            this._readerIndex += 9
            return Number(x)
        }
    }

    readLong(): bigint {
        this.ensureRead(1)
        const h = BinaryUtils.readUInt8(this._bytes, this._readerIndex)
        if (h < 0x80) {
            this._readerIndex++
            return BigInt(h)
        } else if (h < 0xc0) {
            this.ensureRead(2)
            const x = BinaryUtils.readUInt16BE(this._bytes, this._readerIndex) & 0x3fff
            this._readerIndex += 2
            return BigInt(x)
        } else if (h < 0xe0) {
            this.ensureRead(3)
            const x = ((h & 0x1f) << 16) | BinaryUtils.readUInt16BE(this._bytes, this._readerIndex + 1)
            this._readerIndex += 3
            return BigInt(x)
        } else if (h < 0xf0) {
            this.ensureRead(4)
            const x = BinaryUtils.readInt32BE(this._bytes, this._readerIndex) & 0x0fffffff
            this._readerIndex += 4
            return BigInt(x)
        } else if (h < 0xf8) {
            this.ensureRead(5)
            const xl = BinaryUtils.readUInt32BE(this._bytes, this._readerIndex + 1)
            const xh = h & 0x07
            this._readerIndex += 5
            return BigInt(xh * 0x100000000 + xl)
        } else if (h < 0xfc) {
            this.ensureRead(6)
            const xl = BinaryUtils.readUInt32BE(this._bytes, this._readerIndex + 2)
            const xh = BinaryUtils.readUInt16BE(this._bytes, this._readerIndex) & 0x3ff
            this._readerIndex += 6
            return BigInt(xh * 0x100000000 + xl)
        } else if (h < 0xfe) {
            this.ensureRead(7)
            const xl = BinaryUtils.readUInt32BE(this._bytes, this._readerIndex + 3)
            const xh = (BinaryUtils.readUInt32BE(this._bytes, this._readerIndex) >> 8) & 0x1ffff
            this._readerIndex += 7
            return BigInt(xh * 0x100000000 + xl)
        } else if (h < 0xff) {
            this.ensureRead(8)
            const xl = BinaryUtils.readUInt32BE(this._bytes, this._readerIndex + 4)
            const xh = BinaryUtils.readUInt32BE(this._bytes, this._readerIndex) & 0xffffff
            this._readerIndex += 8
            return (BigInt(xh) << BigInt(32)) | BigInt(xl)
        } else {
            this.ensureRead(9)
            const x = BinaryUtils.readBigInt64BE(this._bytes, this._readerIndex + 1)
            this._readerIndex += 9
            return x
        }
    }

    readFloat(): number {
        this.ensureRead(4)
        const x = BinaryUtils.readFloatLE(this._bytes, this._readerIndex)
        this._readerIndex += 4
        return x
    }

    readDouble(): number {
        this.ensureRead(8)
        const x = BinaryUtils.readDoubleLE(this._bytes, this._readerIndex)
        this._readerIndex += 8
        return x
    }

    readSize(): number {
        return this.readInt()
    }

    readString(): string {
        const n = this.readSize()
        if (n > 0) {
            this.ensureRead(n)
            const s = BinaryUtils.uint8ArrayToString(this._bytes, this._readerIndex, this._readerIndex + n)
            this._readerIndex += n
            return s
        } else {
            return ""
        }
    }

    // 修复：返回值统一为 Uint8Array
    readBytes(): Uint8Array {
        const n = this.readSize()
        if (n > 0) {
            this.ensureRead(n)
            const x = BinaryUtils.copyUint8Array(this._bytes, this._readerIndex, this._readerIndex + n)
            this._readerIndex += n
            return x
        } else {
            return ByteBuf.emptyBuff
        }
    }

    readArrayBuffer(): ArrayBuffer {
        return this.readBytes().buffer as any;
    }

    SkipBytes(): void {
        const n = this.readSize()
        this.ensureRead(n)
        this._readerIndex += n
    }
}
