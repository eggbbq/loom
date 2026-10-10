import "./game/tables/schema";

const { regClass, property } = Laya;

@regClass()
export class Main extends Laya.Script {

    onAwake(): void {
        loom.i18n
    }

    onStart() {
        loom.tables.load().then(()=>{
            console.log(loom.tables.tbitem.arr[0].ico)
        });
    }
}