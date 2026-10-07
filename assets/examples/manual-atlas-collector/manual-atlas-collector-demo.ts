/** 开发工程示例：用两个虚拟子图验证预览和发布加载。此脚本不进入插件包。 */
@Laya.regClass()
export class ManualAtlasCollectorDemo extends Laya.Script {
    onStart(): void {
        void this.showDemo().catch(error => console.error("[ManualAtlasCollectorDemo]", error));
    }

    private async showDemo(): Promise<void> {
        const title = new Laya.Text();
        title.text = "Manual Atlas Collector";
        title.fontSize = 28;
        title.color = "#e5e7eb";
        title.pos(40, 40);
        Laya.stage.addChild(title);
        const urls = ["red.png", "blue.png"].map(name => `examples/manual-atlas-collector/demo/${name}`);
        const textures = await Promise.all(urls.map(url => Laya.loader.load(url))) as Laya.Texture[];
        textures.forEach((texture, index) => {
            if (!texture) throw new Error(`Could not load atlas frame: ${urls[index]}`);
            const sprite = new Laya.Sprite();
            sprite.graphics.drawTexture(texture, 0, 0, 128, 128);
            sprite.pos(40 + index * 160, 100);
            Laya.stage.addChild(sprite);
        });
        console.log("[ManualAtlasCollectorDemo] Two atlas frames loaded successfully.");
    }
}
