const { regClass } = Laya;

/** Attach to a GButton to mute it, including its own Sound and the global default. */
@regClass()
@Laya.classInfo({ menu: "loom/ui" })
export class UISoundIgnore extends Laya.Script {}
