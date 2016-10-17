import fs = require("fs");
import path = require("path");
import _ = require("lodash");
import fakerNs = require("faker");
import { ILogger } from "./simple-logger";

class InlineSequence {
    private _counter: number = 0;
    public getNext(): number {
        let retval = this._counter;
        this._counter++;
        return retval;
    }
}
export class InlineUtils {

    public faker: Faker.FakerStatic = fakerNs;
    private _sequences: _.Dictionary<InlineSequence> = {};
    private _localPath: string = "";
    private _fileCache: _.Dictionary<string> = {};

    constructor(private _logger: ILogger) {
    }

    public setLocalPath(localPath: string) {
        this._localPath = localPath;
    }

    /**
     * reads a file and returns a utf8 encoded string
     * file content is cached since eval is not async
     */
    public readFile(fileName: string): string {

        let localFileName = path.join(this._localPath, fileName);
        if (!this._fileCache[localFileName])
            this._fileCache[localFileName] = fs.readFileSync(localFileName, "utf8");
        return this._fileCache[localFileName];
    }

    /**
     * reads a file and encodes content in base64
     * file content is cached since eval is not async
     */
    public readFileAsBase64(fileName: string): string {
        let localFileName = path.join(this._localPath, fileName);
        if (!this._fileCache[localFileName]) {
            var bitmap = fs.readFileSync(localFileName);
            this._fileCache[localFileName] = new Buffer(bitmap).toString("base64");
        }
        return this._fileCache[localFileName];
    }

    /**
     * writes the given data to file
     */
    public writeFile(fileName: string, data: string): void {
        let localFileName = path.join(this._localPath, fileName);
        return fs.writeFileSync(localFileName, data, { encoding: "utf8" });
    }

    /**
     * returns the value of the given environment variable
     */
    public getEnv(envVarName: string): string {
        let retVal: string = process.env[envVarName];
        if (!retVal) {
            this._logger.warn("utils.getEnv: no value was returned for env var: " + envVarName);
        }
        return retVal;
    }
    /**
     * returns the next value in the given sequence, if it doesn't exist one is created
     * first seq value in a new seq is 0
     */
    public getNext(seqName: string): number {
        let seq = this._sequences[seqName];
        if (!seq) {
            seq = new InlineSequence();
            this._sequences[seqName] = seq;
        }
        return seq.getNext();
    }
}