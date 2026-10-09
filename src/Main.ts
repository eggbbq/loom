import "./game/tables/schema";

const { regClass, property } = Laya;

@regClass()
export class Main extends Laya.Script {

    onAwake(): void {
        console.log("AAA")
    }

    onStart() {
        console.log("???")
        loom.tables.load().then(()=>{
            console.log(loom.tables.tbitem.arr[0].ico)
        });
    }
}