export type Point = {
  x: number
  y: number
}

export type AStarOptions = {
  width: number
  height: number
  /**
   * 0 = blocked, 1 = walkable.
   * Length must be width * height.
   */
  walkable: Uint8Array
  allowDiagonal?: boolean
  /**
   * Prevent diagonal squeezing through blocked corners.
   */
  preventCornerCutting?: boolean
}

export type FindPathOptions = {
  maxIterations?: number
  /**
   * If the requested end is blocked or disconnected, return a path to the
   * reachable cell whose center is closest to the requested end.
   */
  findNearestReachable?: boolean
}

export type PathResult = {
  found: boolean
  path: Point[]
  iterations: number
  /** True only when the requested end cell itself was reached. */
  reachedTarget: boolean
  /** Actual final cell, or null when no path was found. */
  resolvedEnd: Point | null
}

class MinHeap {
  private heap: number[] = []

  constructor(private readonly fScore: Float32Array) {}

  get size(): number {
    return this.heap.length
  }

  clear(): void {
    this.heap.length = 0
  }

  push(id: number): void {
    this.heap.push(id)
    this.bubbleUp(this.heap.length - 1)
  }

  pop(): number | undefined {
    const root = this.heap[0]
    const last = this.heap.pop()

    if (last !== undefined && this.heap.length > 0) {
      this.heap[0] = last
      this.bubbleDown(0)
    }

    return root
  }

  private less(a: number, b: number): boolean {
    return this.fScore[a] < this.fScore[b]
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (!this.less(this.heap[index], this.heap[parent])) break
      ;[this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]]
      index = parent
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length

    while (true) {
      let smallest = index
      const left = index * 2 + 1
      const right = left + 1

      if (left < length && this.less(this.heap[left], this.heap[smallest])) smallest = left
      if (right < length && this.less(this.heap[right], this.heap[smallest])) smallest = right
      if (smallest === index) break

      ;[this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]]
      index = smallest
    }
  }
}

/**
 * Fixed-size high-performance A* grid.
 * Best for local windows, chunks, rooms, or bounded maps.
 */
export class AStarGrid {
  readonly width: number
  readonly height: number
  readonly walkable: Uint8Array

  private readonly allowDiagonal: boolean
  private readonly preventCornerCutting: boolean

  private readonly gScore: Float32Array
  private readonly fScore: Float32Array
  private readonly parent: Int32Array
  private readonly opened: Uint8Array
  private readonly closed: Uint8Array
  private readonly touched: Int32Array
  private touchedCount = 0
  private readonly heap: MinHeap

  constructor(options: AStarOptions) {
    const { width, height, walkable } = options

    if (width <= 0 || height <= 0) throw new Error('width and height must be positive')
    if (walkable.length !== width * height) throw new Error('walkable length must equal width * height')

    this.width = width
    this.height = height
    this.walkable = walkable
    this.allowDiagonal = options.allowDiagonal ?? false
    this.preventCornerCutting = options.preventCornerCutting ?? true

    const size = width * height
    this.gScore = new Float32Array(size)
    this.fScore = new Float32Array(size)
    this.parent = new Int32Array(size)
    this.opened = new Uint8Array(size)
    this.closed = new Uint8Array(size)
    this.touched = new Int32Array(size)
    this.heap = new MinHeap(this.fScore)

    this.parent.fill(-1)
  }

  setWalkable(x: number, y: number, value: boolean): void {
    if (!this.inBounds(x, y)) return
    this.walkable[this.id(x, y)] = value ? 1 : 0
  }

  isWalkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.walkable[this.id(x, y)] === 1
  }

  findPath(start: Point, end: Point, options: FindPathOptions = {}): PathResult {
    this.resetSearchState()

    if (!this.inBounds(start.x, start.y) || !this.inBounds(end.x, end.y)) {
      return { found: false, path: [], iterations: 0, reachedTarget: false, resolvedEnd: null }
    }

    const findNearestReachable = options.findNearestReachable ?? false
    if (!this.isWalkable(start.x, start.y) || (!findNearestReachable && !this.isWalkable(end.x, end.y))) {
      return { found: false, path: [], iterations: 0, reachedTarget: false, resolvedEnd: null }
    }

    const startId = this.id(start.x, start.y)
    const endId = this.id(end.x, end.y)

    this.touch(startId)
    this.gScore[startId] = 0
    this.fScore[startId] = this.heuristic(start.x, start.y, end.x, end.y)
    this.parent[startId] = -1
    this.opened[startId] = 1
    this.heap.push(startId)

    let iterations = 0
    let nearestId = startId
    let nearestDistanceSq = this.distanceSquared(start.x, start.y, end.x, end.y)
    let nearestPathCost = 0
    const maxIterations = options.maxIterations ?? this.width * this.height

    while (this.heap.size > 0 && iterations < maxIterations) {
      const currentId = this.heap.pop()
      if (currentId === undefined) break
      if (this.closed[currentId]) continue
      iterations++

      const cx = currentId % this.width
      const cy = Math.floor(currentId / this.width)
      const distanceSq = this.distanceSquared(cx, cy, end.x, end.y)
      if (distanceSq < nearestDistanceSq || (distanceSq === nearestDistanceSq && this.gScore[currentId] < nearestPathCost)) {
        nearestId = currentId
        nearestDistanceSq = distanceSq
        nearestPathCost = this.gScore[currentId]
      }

      if (currentId === endId) {
        return { found: true, path: this.buildPath(endId), iterations, reachedTarget: true, resolvedEnd: { x: end.x, y: end.y } }
      }

      this.closed[currentId] = 1
      this.visitNeighbors(currentId, cx, cy, end.x, end.y)
    }

    if (findNearestReachable) {
      const resolvedEnd = { x: nearestId % this.width, y: Math.floor(nearestId / this.width) }
      return { found: true, path: this.buildPath(nearestId), iterations, reachedTarget: false, resolvedEnd }
    }

    return { found: false, path: [], iterations, reachedTarget: false, resolvedEnd: null }
  }

  private visitNeighbors(currentId: number, cx: number, cy: number, ex: number, ey: number): void {
    this.tryVisit(currentId, cx + 1, cy, 1, ex, ey)
    this.tryVisit(currentId, cx - 1, cy, 1, ex, ey)
    this.tryVisit(currentId, cx, cy + 1, 1, ex, ey)
    this.tryVisit(currentId, cx, cy - 1, 1, ex, ey)

    if (!this.allowDiagonal) return

    this.tryVisitDiagonal(currentId, cx, cy, cx + 1, cy + 1, ex, ey)
    this.tryVisitDiagonal(currentId, cx, cy, cx - 1, cy + 1, ex, ey)
    this.tryVisitDiagonal(currentId, cx, cy, cx + 1, cy - 1, ex, ey)
    this.tryVisitDiagonal(currentId, cx, cy, cx - 1, cy - 1, ex, ey)
  }

  private tryVisitDiagonal(currentId: number, cx: number, cy: number, nx: number, ny: number, ex: number, ey: number): void {
    if (this.preventCornerCutting) {
      const dx = nx - cx
      const dy = ny - cy
      if (!this.isWalkable(cx + dx, cy) || !this.isWalkable(cx, cy + dy)) return
    }

    this.tryVisit(currentId, nx, ny, Math.SQRT2, ex, ey)
  }

  private tryVisit(currentId: number, nx: number, ny: number, cost: number, ex: number, ey: number): void {
    if (!this.isWalkable(nx, ny)) return

    const nid = this.id(nx, ny)
    if (this.closed[nid]) return

    const tentativeG = this.gScore[currentId] + cost

    if (!this.opened[nid]) {
      this.touch(nid)
      this.opened[nid] = 1
      this.parent[nid] = currentId
      this.gScore[nid] = tentativeG
      this.fScore[nid] = tentativeG + this.heuristic(nx, ny, ex, ey)
      this.heap.push(nid)
      return
    }

    if (tentativeG < this.gScore[nid]) {
      this.parent[nid] = currentId
      this.gScore[nid] = tentativeG
      this.fScore[nid] = tentativeG + this.heuristic(nx, ny, ex, ey)
      this.heap.push(nid)
    }
  }

  private buildPath(endId: number): Point[] {
    const reversed: Point[] = []
    let current = endId

    while (current !== -1) {
      reversed.push({ x: current % this.width, y: Math.floor(current / this.width) })
      current = this.parent[current]
    }

    return reversed.reverse()
  }

  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    const dx = Math.abs(x1 - x2)
    const dy = Math.abs(y1 - y2)

    if (this.allowDiagonal) {
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
    }

    return dx + dy
  }

  private distanceSquared(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x1 - x2
    const dy = y1 - y2
    return dx * dx + dy * dy
  }

  private touch(id: number): void {
    this.touched[this.touchedCount++] = id
  }

  private resetSearchState(): void {
    for (let i = 0; i < this.touchedCount; i++) {
      const id = this.touched[i]
      this.gScore[id] = 0
      this.fScore[id] = 0
      this.parent[id] = -1
      this.opened[id] = 0
      this.closed[id] = 0
    }

    this.touchedCount = 0
    this.heap.clear()
  }

  private id(x: number, y: number): number {
    return y * this.width + x
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }
}

export type InfiniteAStarOptions = {
  /**
   * Local search window width in cells.
   */
  windowWidth: number
  /**
   * Local search window height in cells.
   */
  windowHeight: number
  allowDiagonal?: boolean
  preventCornerCutting?: boolean
  /**
   * Return whether a world cell is walkable.
   * This can read from chunks, procedural terrain, server state, etc.
   */
  isWalkableWorld: (x: number, y: number) => boolean
}

export type InfiniteFindPathOptions = FindPathOptions & {
  /**
   * Center of local search window. Defaults to midpoint between start and end.
   */
  windowCenter?: Point
}

/**
 * Infinite-world wrapper.
 * It does NOT search the whole infinite world.
 * Instead, it creates a bounded local window around start/end and runs AStarGrid inside it.
 *
 * Best use cases:
 * - open-world chunk maps
 * - roguelike/procedural maps
 * - dynamic terrain
 * - agents that usually move local distances
 */
export class InfiniteAStarGrid {
  readonly windowWidth: number
  readonly windowHeight: number

  private readonly isWalkableWorld: (x: number, y: number) => boolean
  private readonly allowDiagonal: boolean
  private readonly preventCornerCutting: boolean
  private readonly buffer: Uint8Array
  private readonly grid: AStarGrid

  constructor(options: InfiniteAStarOptions) {
    if (options.windowWidth <= 0 || options.windowHeight <= 0) {
      throw new Error('windowWidth and windowHeight must be positive')
    }

    this.windowWidth = options.windowWidth
    this.windowHeight = options.windowHeight
    this.isWalkableWorld = options.isWalkableWorld
    this.allowDiagonal = options.allowDiagonal ?? false
    this.preventCornerCutting = options.preventCornerCutting ?? true
    this.buffer = new Uint8Array(this.windowWidth * this.windowHeight)
    this.grid = new AStarGrid({
      width: this.windowWidth,
      height: this.windowHeight,
      walkable: this.buffer,
      allowDiagonal: this.allowDiagonal,
      preventCornerCutting: this.preventCornerCutting,
    })
  }

  findPath(start: Point, end: Point, options: InfiniteFindPathOptions = {}): PathResult {
    const center = options.windowCenter ?? {
      x: Math.floor((start.x + end.x) / 2),
      y: Math.floor((start.y + end.y) / 2),
    }

    const halfWidth = Math.floor(this.windowWidth / 2)
    const halfHeight = Math.floor(this.windowHeight / 2)
    const origin = {
      x: center.x - halfWidth,
      y: center.y - halfHeight,
    }

    const localStart = { x: start.x - origin.x, y: start.y - origin.y }
    const localEnd = { x: end.x - origin.x, y: end.y - origin.y }

    if (!this.inLocalBounds(localStart) || !this.inLocalBounds(localEnd)) {
      return { found: false, path: [], iterations: 0, reachedTarget: false, resolvedEnd: null }
    }

    this.fillLocalWindow(origin)
    const result = this.grid.findPath(localStart, localEnd, options)

    if (!result.found) return result

    return {
      found: true,
      iterations: result.iterations,
      reachedTarget: result.reachedTarget,
      resolvedEnd: result.resolvedEnd
        ? { x: result.resolvedEnd.x + origin.x, y: result.resolvedEnd.y + origin.y }
        : null,
      path: result.path.map((p) => ({
        x: p.x + origin.x,
        y: p.y + origin.y,
      })),
    }
  }

  private fillLocalWindow(origin: Point): void {
    let i = 0

    for (let y = 0; y < this.windowHeight; y++) {
      for (let x = 0; x < this.windowWidth; x++) {
        this.buffer[i++] = this.isWalkableWorld(origin.x + x, origin.y + y) ? 1 : 0
      }
    }
  }

  private inLocalBounds(p: Point): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.windowWidth && p.y < this.windowHeight
  }
}

export type ChunkCoord = {
  cx: number
  cy: number
}

export type ChunkWalkabilityLayers = {
  /**
   * Static terrain mask. 0 = permanently blocked, 1 = terrain-walkable.
   */
  staticWalkable: Uint8Array
  /**
   * Number of active dynamic obstacles covering each cell.
   */
  dynamicBlockCount: Uint16Array
}

export type ChunkProvider = {
  chunkSize: number
  /**
   * Return the static and dynamic walkability layers for a loaded chunk.
   */
  getChunk(cx: number, cy: number): ChunkWalkabilityLayers | undefined
  /**
   * Unloaded chunks are treated as blocked by default.
   */
  unloadedIsWalkable?: boolean
}

/**
 * Helper for chunk-based infinite maps.
 * Plug this into InfiniteAStarGrid.isWalkableWorld.
 */
export class ChunkedWalkableWorld {
  readonly chunkSize: number
  private readonly getChunkData: (cx: number, cy: number) => ChunkWalkabilityLayers | undefined
  private readonly unloadedIsWalkable: boolean

  constructor(provider: ChunkProvider) {
    if (provider.chunkSize <= 0) throw new Error('chunkSize must be positive')

    this.chunkSize = provider.chunkSize
    this.getChunkData = provider.getChunk
    this.unloadedIsWalkable = provider.unloadedIsWalkable ?? false
  }

  isWalkable(x: number, y: number): boolean {
    const { cx, cy, lx, ly } = this.toChunkLocal(x, y)
    const chunk = this.getChunkData(cx, cy)

    if (!chunk) return this.unloadedIsWalkable

    const index = ly * this.chunkSize + lx
    return chunk.staticWalkable[index] === 1 && chunk.dynamicBlockCount[index] === 0
  }

  toChunkLocal(x: number, y: number): ChunkCoord & { lx: number; ly: number } {
    const cx = Math.floor(x / this.chunkSize)
    const cy = Math.floor(y / this.chunkSize)
    const lx = mod(x, this.chunkSize)
    const ly = mod(y, this.chunkSize)

    return { cx, cy, lx, ly }
  }
}

function mod(value: number, size: number): number {
  return ((value % size) + size) % size
}

// Example: infinite / chunked world
//
// const CHUNK_SIZE = 64
// const chunks = new Map<string, ChunkWalkabilityLayers>()
// const key = (cx: number, cy: number) => `${cx},${cy}`
//
// const createChunk = (): ChunkWalkabilityLayers => ({
//   staticWalkable: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(1),
//   dynamicBlockCount: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE),
// })
// chunks.set(key(0, 0), createChunk())
// chunks.set(key(1, 0), createChunk())
//
// const world = new ChunkedWalkableWorld({
//   chunkSize: CHUNK_SIZE,
//   getChunk: (cx, cy) => chunks.get(key(cx, cy)),
//   unloadedIsWalkable: false,
// })
//
// const astar = new InfiniteAStarGrid({
//   windowWidth: 128,
//   windowHeight: 96,
//   allowDiagonal: false,
//   isWalkableWorld: (x, y) => world.isWalkable(x, y),
// })
//
// const result = astar.findPath({ x: 10, y: 10 }, { x: 90, y: 20 })
// console.log(result.path)
