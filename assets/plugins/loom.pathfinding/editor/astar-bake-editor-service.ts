// @ts-nocheck

@IEditor.regClass()
export class AstarBakeEditorService {
    static async writeFile(filePath: string, content: string) {
        if (!filePath) throw new Error("filePath is required");
        const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
        const asset = await Editor.assetDb.writeFile(normalized, content, false, true);
        return {
            id: asset.id,
            file: asset.file,
            fullPath: Editor.assetDb.getFullPath(asset),
        };
    }

}
