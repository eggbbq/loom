import "./game/tables/schema";

const { regClass, property } = Laya;

@regClass()
export class Main extends Laya.Script {

    onStart() {
        console.log(loom.sdk.platform);
        loom.tables.load().then(()=>{
            console.log(loom.tables.tbitem.arr[0].ico)
        });
    }
}