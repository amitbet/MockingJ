import fs = require("fs");
import _ = require("lodash");

class InlineSequence {
    private _counter: number = 0;
    public getNext(): number {
        let retval = this._counter;
        this._counter++;
        return retval;
    }
}
export class InlineUtils {
    private _sequences: _.Dictionary<InlineSequence> = {};

    public readFile(fileName: string): string {
        return fs.readFileSync(fileName, "utf8");
    }
    public writeFile(fileName: string, data: string): void {
        return fs.writeFileSync(fileName, data, { encoding: "utf8" });
    }

    public getNext(seqName: string): number {
        let seq = this._sequences[seqName];
        if (!seq) {
            seq = new InlineSequence();
            this._sequences[seqName] = seq;
        }
        return seq.getNext();
    }
}