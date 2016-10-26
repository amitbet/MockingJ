import { MockStep } from "./mock-step";
import _ = require("lodash");
import { InlineUtils } from "./inline-utils";
import { ILogger } from "./simple-logger";

export class StepLexicon {
    private _stepPool: Array<MockStep> = [];
    private nameMap: _.Dictionary<MockStep> = {};
    private _utils: InlineUtils;

    constructor(private _logger: ILogger) {
        this._utils = new InlineUtils(this._logger);
    }

    public toJson(): string {
        return JSON.stringify(this._stepPool, null, 2);
    }

    /**
     * validates lexicon data and issues warnings for missing mandatory fields etc.
     */
    public validateDataStructure() {
        _.each(this._stepPool, step => step.validate());
    }

    /**
     * adds multiple steps
     */
    public addSteps(steps: Array<MockStep>) {
        for (var i = 0; i < steps.length; i++) {
            let step = steps[i];
            this.addOrUpdateStep(step);
        }
        this.validateDataStructure();
    }

    /**
     * adds a single step
     */
    public addOrUpdateStep(step: MockStep) {
        let existingStep = this.nameMap[step.id];
        // if step already exists, add responses to its response array
        if (existingStep) {
            existingStep.Merge(step);
        }
        else {
            let myStep = MockStep.makeStep(step, this._logger, this._utils);
            this._stepPool.push(myStep);
            this.nameMap[step.id] = myStep;
        }
    }

    /**
     * gets a step by the given step name
     */
    public getStepByName(stepName: string, request?: any, treatParams = true): MockStep {
        var step: MockStep = this.nameMap[stepName];

        if (!step)
            return null;

        if (!treatParams)
            return step;

        if (step.matchRequest(request)) {
            return step;
        }
        return null;
    }

    public isMatch(step: MockStep, request: any, type?: string): boolean {
        let condsOk = step.matchRequest(request);
        if (type)
            return (step.type === type && condsOk);
        else
            return condsOk;
    }

    /**
     *   sets the working dir for utils.readFile operations
     */
    public setScriptWorkingDir(localPath: string) {
        this._utils.setLocalPath(localPath);
    }

}
