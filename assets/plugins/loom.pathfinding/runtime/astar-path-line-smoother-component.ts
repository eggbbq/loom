import type { Point } from "./astar";
import { AstarPathSmootherComponent } from "./astar-path-smoother-component";

const { regClass } = Laya;

@regClass()
export class AstarPathLineSmootherComponent extends AstarPathSmootherComponent {

    protected applySmoothingAlgorithm(path: Point[]): Point[] {
        return this.applyLineOfSightSmoothing(path);
    }

    private applyLineOfSightSmoothing(path: Point[]): Point[] {
        if (path.length <= 2) return path;

        const smoothed: Point[] = [path[0]];
        let currentIndex = 0;

        while (currentIndex < path.length - 1) {
            let furthestIndex = currentIndex + 1;

            for (let i = currentIndex + 2; i < path.length; i++) {
                if (this.isGridSegmentWalkable(path[currentIndex], path[i])) {
                    furthestIndex = i;
                } else {
                    break;
                }
            }

            smoothed.push(path[furthestIndex]);
            currentIndex = furthestIndex;
        }

        return smoothed;
    }
}
