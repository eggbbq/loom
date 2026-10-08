import { ASTAR_CHUNKS_CHANGED, AstarChunkComponent } from "./astar-chunk-component";

const { regClass, property } = Laya;

@regClass()
export class AstarRuntimeDebugView extends Laya.Script {
    declare owner: Laya.Sprite3D;

    @property(AstarChunkComponent)
    source: AstarChunkComponent | null = null;

    @property({ type: Boolean })
    showChunkGrid = true;

    @property({ type: Boolean })
    showTileGrid = true;

    @property({ type: Number, min: 0, step: 1 })
    maxVisibleChunks = 64;

    @property({ type: Number, min: -10, max: 10, step: 0.01, fractionDigits: 2 })
    heightOffset = 0.1;

    @property({ type: Laya.Color })
    chunkColor = new Laya.Color(0, 0.5, 1, 0.8);

    @property({ type: Laya.Color })
    tileColor = new Laya.Color(0, 1, 0, 0.35);

    @property({ type: Boolean })
    showBlockedTiles = true;

    @property({ type: Number, min: -10, max: 10, step: 0.01, fractionDigits: 2 })
    blockHeightOffset = 0.11;

    @property({ type: Laya.Color })
    blockColor = new Laya.Color(1, 0, 0, 0.5);

    private _lineSprite: Laya.PixelLineSprite3D | null = null;
    private _blockRoot: Laya.Sprite3D | null = null;
    private _blockMesh: Laya.Mesh | null = null;
    private _blockMaterial: Laya.UnlitMaterial | null = null;
    private _blockRotation = new Laya.Vector3(-90, 0, 0);
    private _blockPool: Laya.MeshSprite3D[] = [];
    private _activeBlockCount = 0;
    private _needsRefresh = false;
    private _configSignature = "";
    private _boundSource: AstarChunkComponent | null = null;
    private _boundOnChunksChanged = this.onChunksChanged.bind(this);

    onAwake(): void {
        this.resolveSource();
        this.bindSource();
        this.ensureLineSprite();
        this.ensureBlockRoot();
        this.requestRefresh();
    }

    onEnable(): void {
        this.ensureLineSprite();
        this.ensureBlockRoot();
        if (this._lineSprite) {
            this._lineSprite.active = true;
        }
        if (this._blockRoot) {
            this._blockRoot.active = true;
        }
        this.requestRefresh();
    }

    onDisable(): void {
        if (this._lineSprite) {
            this._lineSprite.clear();
            this._lineSprite.active = false;
        }
        this.clearBlockedTiles();
        if (this._blockRoot) {
            this._blockRoot.active = false;
        }
    }

    onUpdate(): void {
        const source = this.resolveSource();
        this.bindSource();
        const signature = this.createConfigSignature(source);
        if (signature !== this._configSignature) {
            this._configSignature = signature;
            this.requestRefresh();
        }

        if (this._needsRefresh) {
            this.refresh();
        }
    }

    onDestroy(): void {
        this.unbindSource();
        if (this._lineSprite && !this._lineSprite.destroyed) {
            this._lineSprite.destroy();
        }
        if (this._blockRoot && !this._blockRoot.destroyed) {
            this._blockRoot.destroy(true);
        }
        if (this._blockMaterial && !this._blockMaterial.destroyed) {
            this._blockMaterial.destroy();
        }
        if (this._blockMesh && !this._blockMesh.destroyed) {
            this._blockMesh.destroy();
        }
        this._lineSprite = null;
        this._blockRoot = null;
        this._blockMaterial = null;
        this._blockMesh = null;
        this._blockPool.length = 0;
        this._activeBlockCount = 0;
    }

    refresh(): void {
        this._needsRefresh = false;
        const source = this.resolveSource();
        const lineSprite = this.ensureLineSprite();
        const blockRoot = this.ensureBlockRoot();
        if (!source || !lineSprite || !blockRoot || !this.enabled) return;

        lineSprite.clear();
        this.clearBlockedTiles();

        const chunks = source.getLoadedChunks();
        if (chunks.length === 0) return;

        const visibleChunks = this.limitVisibleChunks(chunks, source);
        const tileSize = source.tileSize;
        const chunkSize = source.chunkSize;
        if (tileSize <= 0 || chunkSize <= 0) return;

        if (this.showChunkGrid || this.showTileGrid) {
            lineSprite.maxLineCount = Math.max(1, this.estimateLineCount(visibleChunks.length, chunkSize));

            const seen = new Set<string>();
            const start = new Laya.Vector3();
            const end = new Laya.Vector3();

            for (const chunk of visibleChunks) {
                const minGridX = chunk.cx * chunkSize;
                const minGridY = chunk.cy * chunkSize;
                const maxGridX = minGridX + chunkSize;
                const maxGridY = minGridY + chunkSize;

                if (this.showChunkGrid) {
                    this.addGridLine(lineSprite, seen, minGridX, minGridY, maxGridX, minGridY, tileSize, this.chunkColor, start, end);
                    this.addGridLine(lineSprite, seen, minGridX, maxGridY, maxGridX, maxGridY, tileSize, this.chunkColor, start, end);
                    this.addGridLine(lineSprite, seen, minGridX, minGridY, minGridX, maxGridY, tileSize, this.chunkColor, start, end);
                    this.addGridLine(lineSprite, seen, maxGridX, minGridY, maxGridX, maxGridY, tileSize, this.chunkColor, start, end);
                }

                if (this.showTileGrid) {
                    for (let gridY = minGridY + 1; gridY < maxGridY; gridY++) {
                        this.addGridLine(lineSprite, seen, minGridX, gridY, maxGridX, gridY, tileSize, this.tileColor, start, end);
                    }

                    for (let gridX = minGridX + 1; gridX < maxGridX; gridX++) {
                        this.addGridLine(lineSprite, seen, gridX, minGridY, gridX, maxGridY, tileSize, this.tileColor, start, end);
                    }
                }
            }
        }

        if (this.showBlockedTiles) {
            this.drawBlockedTiles(visibleChunks, tileSize, chunkSize);
        }
    }

    private resolveSource(): AstarChunkComponent | null {
        if (this.source && !this.source.destroyed) return this.source;

        const local = this.owner.getComponent(AstarChunkComponent);
        if (local && !local.destroyed) {
            this.source = local;
            return local;
        }

        return null;
    }

    private bindSource(): void {
        const source = this.resolveSource();
        if (!source) return;
        if (this._boundSource === source) return;

        this.unbindSource();
        source.owner.on(ASTAR_CHUNKS_CHANGED, this, this._boundOnChunksChanged);
        this._boundSource = source;
    }

    private unbindSource(): void {
        if (!this._boundSource || this._boundSource.destroyed) {
            this._boundSource = null;
            return;
        }
        this._boundSource.owner.off(ASTAR_CHUNKS_CHANGED, this, this._boundOnChunksChanged);
        this._boundSource = null;
    }

    private onChunksChanged(): void {
        this.requestRefresh();
    }

    private ensureLineSprite(): Laya.PixelLineSprite3D | null {
        if (this._lineSprite && !this._lineSprite.destroyed) return this._lineSprite;
        if (!this.owner.scene) return null;

        this._lineSprite = new Laya.PixelLineSprite3D(1, "AstarRuntimeDebugView");
        this.owner.scene.addChild(this._lineSprite);
        return this._lineSprite;
    }

    private ensureBlockRoot(): Laya.Sprite3D | null {
        if (this._blockRoot && !this._blockRoot.destroyed) return this._blockRoot;
        if (!this.owner.scene) return null;

        this._blockRoot = new Laya.Sprite3D("AstarRuntimeDebugBlocks");
        this.owner.scene.addChild(this._blockRoot);
        return this._blockRoot;
    }

    private ensureBlockMesh(): Laya.Mesh {
        if (this._blockMesh && !this._blockMesh.destroyed) return this._blockMesh;
        this._blockMesh = Laya.PrimitiveMesh.createQuad(1, 1);
        return this._blockMesh;
    }

    private ensureBlockMaterial(): Laya.UnlitMaterial {
        if (this._blockMaterial && !this._blockMaterial.destroyed) {
            this._blockMaterial.albedoColor = this.blockColor;
            return this._blockMaterial;
        }

        this._blockMaterial = new Laya.UnlitMaterial();
        this._blockMaterial.renderMode = Laya.UnlitMaterial.RENDERMODE_TRANSPARENT;
        this._blockMaterial.albedoColor = this.blockColor;
        return this._blockMaterial;
    }

    private requestRefresh(): void {
        this._needsRefresh = true;
    }

    private drawBlockedTiles(chunks: Array<{
        cx: number;
        cy: number;
        staticWalkable: Uint8Array;
        dynamicBlockCount: Uint16Array;
    }>, tileSize: number, chunkSize: number): void {
        const material = this.ensureBlockMaterial();
        const mesh = this.ensureBlockMesh();

        for (const chunk of chunks) {
            for (let blockIndex = 0; blockIndex < chunk.staticWalkable.length; blockIndex++) {
                if (chunk.staticWalkable[blockIndex] === 1 && chunk.dynamicBlockCount[blockIndex] === 0) continue;

                const lx = blockIndex % chunkSize;
                const ly = Math.floor(blockIndex / chunkSize);
                const tileX = chunk.cx * chunkSize + lx;
                const tileY = chunk.cy * chunkSize + ly;
                const block = this.getOrCreateBlock(this._activeBlockCount++, mesh, material);
                block.active = true;
                block.transform.localPosition = new Laya.Vector3(
                    (tileX + 0.5) * tileSize,
                    this.blockHeightOffset,
                    (tileY + 0.5) * tileSize,
                );
                block.transform.localScale = new Laya.Vector3(tileSize, tileSize, tileSize);
                block.transform.localRotationEuler = this._blockRotation;
            }
        }

        for (let i = this._activeBlockCount; i < this._blockPool.length; i++) {
            this._blockPool[i].active = false;
        }
    }

    private getOrCreateBlock(index: number, mesh: Laya.Mesh, material: Laya.UnlitMaterial): Laya.MeshSprite3D {
        const cached = this._blockPool[index];
        if (cached && !cached.destroyed) {
            cached.meshRenderer.sharedMaterial = material;
            return cached;
        }

        const block = new Laya.MeshSprite3D(mesh, `astar_block_${index}`);
        block.meshRenderer.sharedMaterial = material;
        this.ensureBlockRoot()?.addChild(block);
        this._blockPool[index] = block;
        return block;
    }

    private clearBlockedTiles(): void {
        this._activeBlockCount = 0;
        for (const block of this._blockPool) {
            if (!block.destroyed) {
                block.active = false;
            }
        }
    }

    private limitVisibleChunks<T extends { cx: number; cy: number }>(chunks: T[], source: AstarChunkComponent): T[] {
        if (this.maxVisibleChunks <= 0 || chunks.length <= this.maxVisibleChunks) {
            return chunks;
        }

        const center = source.getCenterChunk();
        if (!center) {
            return chunks.slice(0, this.maxVisibleChunks);
        }

        return [...chunks]
            .sort((a, b) => {
                const da = Math.abs(a.cx - center.cx) + Math.abs(a.cy - center.cy);
                const db = Math.abs(b.cx - center.cx) + Math.abs(b.cy - center.cy);
                return da === db ? (a.cy - b.cy || a.cx - b.cx) : da - db;
            })
            .slice(0, this.maxVisibleChunks);
    }

    private addGridLine(
        lineSprite: Laya.PixelLineSprite3D,
        seen: Set<string>,
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        tileSize: number,
        color: Laya.Color,
        start: Laya.Vector3,
        end: Laya.Vector3,
    ): void {
        const key = this.getLineKey(x0, y0, x1, y1);
        if (seen.has(key)) return;
        seen.add(key);

        start.setValue(x0 * tileSize, this.heightOffset, y0 * tileSize);
        end.setValue(x1 * tileSize, this.heightOffset, y1 * tileSize);
        lineSprite.addLine(start, end, color, color);
    }

    private getLineKey(x0: number, y0: number, x1: number, y1: number): string {
        if (x0 < x1 || (x0 === x1 && y0 <= y1)) {
            return `${x0},${y0}:${x1},${y1}`;
        }
        return `${x1},${y1}:${x0},${y0}`;
    }

    private estimateLineCount(visibleChunkCount: number, chunkSize: number): number {
        let linesPerChunk = 0;
        if (this.showChunkGrid) {
            linesPerChunk += 4;
        }
        if (this.showTileGrid) {
            linesPerChunk += Math.max(0, chunkSize - 1) * 2;
        }
        return visibleChunkCount * Math.max(1, linesPerChunk);
    }

    private createConfigSignature(source: AstarChunkComponent | null): string {
        const chunkCount = source?.getChunkCount() ?? 0;
        const chunkSize = source?.chunkSize ?? 0;
        const tileSize = source?.tileSize ?? 0;
        return [
            this.enabled ? 1 : 0,
            this.showChunkGrid ? 1 : 0,
            this.showTileGrid ? 1 : 0,
            this.showBlockedTiles ? 1 : 0,
            this.maxVisibleChunks,
            this.heightOffset,
            this.blockHeightOffset,
            chunkCount,
            chunkSize,
            tileSize,
            this.chunkColor.r,
            this.chunkColor.g,
            this.chunkColor.b,
            this.chunkColor.a,
            this.tileColor.r,
            this.tileColor.g,
            this.tileColor.b,
            this.tileColor.a,
            this.blockColor.r,
            this.blockColor.g,
            this.blockColor.b,
            this.blockColor.a,
        ].join("|");
    }
}
