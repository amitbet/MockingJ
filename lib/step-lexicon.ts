import { MockStep, MockResponse } from "./mock-step";
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

    public fromJson(json: string) {
        this._stepPool = JSON.parse(json);

        this.validateDataStructure();
    }

    /**
     * validates lexicon data and issues warnings for missing mandatory fields etc.
     */
    public validateDataStructure() {
        _.each(this._stepPool, step => this.validateStep(step));
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
            let idx = existingStep.actions.length;
            _.forEach(step.actions, (act) => {
                if (!act.name) {
                    act.name = "resp" + idx;
                    ++idx;
                }
            });
            existingStep.actions = existingStep.actions.concat(step.actions);
        }
        else {
            this._stepPool.push(step);
            this.nameMap[step.id] = step;
        }
    }

    /**
     * finds the first step that matches (so it's requirements match the given request)
     */
    public findFirstMatchingStep(request: any) {
        for (var i = 0; i < this._stepPool.length; i++) {
            let step = this._stepPool[i];
            if (this.matchRequest(step.requestConditions, request)) {
                return this.materializeParams(step, request);
            }
        }
    }

    /**
     * finds all matching steps (checks requirements on all steps agains given request)
     */
    public findAllMatchingSteps(request: any) {
        var retval = [];
        for (var i = 0; i < this._stepPool.length; i++) {
            let step = this._stepPool[i];
            if (this.matchRequest(step.requestConditions, request)) {
                retval.push(step);
            }
        }
        return retval;
    }

    /**
     * gets a step by the given step name
     */
    public getStepByName(stepName: string, request?: any, treatParams = true): MockStep {
        var step: MockStep = this.nameMap[stepName];
        var newStep: MockStep;

        if (!step)
            return null;

        if (!treatParams)
            return step;

        // if (!request) {
        //     request = {};
        //     newStep = this.cloneAndParametrize(step, request);
        //     return newStep;
        // }

        if (this.matchRequest(step.requestConditions, request)) {
            newStep = this.cloneAndParametrize(step, request);
        }
        return newStep;
    }

    public isMatch(step: MockStep, request: any, type?: string): boolean {
        let condsOk = this.matchRequest(step.requestConditions, request);
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

    /**
     * validates a given MockStep, issues warnings in log about problems
     */
    private validateStep(step: MockStep) {
        if (!step.id)
            this._logger.warn("StepValidation: detected a step without id - it is unusable");

        if (!step.type)
            this._logger.warn("StepValidation: step: " + step.id + " has no type");

        if (!step.actions || step.actions.length === 0)
            this._logger.warn("StepValidation: step: " + step.id + " contains no actions");


        _.each(step.actions, action => {
            if (!action.type)
                this._logger.info("StepValidation: action: '" + action.name + "' has no type in step: " + step.id + " it will be inherited from step.type (= " + step.type + ")");
        });
    }


    /**
     * clones the step, and materializes response and all inner actions
     */
    private cloneAndParametrize(step: MockStep, request: any): MockStep {
        var newStep: MockStep;
        var newAactions: Array<MockResponse> = [];
        _.forEach(step.actions, (action, key) => {
            newAactions.push(this.materializeParams(action, request));
        });
        newStep = {
            requestConditions: step.requestConditions,
            delay: step.delay,
            type: step.type,
            actions: newAactions,
            id: step.id
        };
        return newStep;
    }



    /**
     * tests the request conditions against the request, returns true if request matches
     */
    private matchRequest(requestConds: any, actualReq: any): boolean {
        var k;

        if (requestConds instanceof Object) {
            for (k in requestConds) {
                if (requestConds.hasOwnProperty(k)) {
                    // recursive call to scan property
                    let isMatch = this.matchRequest(requestConds[k], actualReq[k]);
                    if (!isMatch)
                        return false;
                }
            }
            return true;
        } else {
            // not an Object so obj[k] here is a value
            return (requestConds === actualReq) ? true : false;
        }
    }

    /**
     * takes a message and runs eval on any strings like: {{var}}, with the request in the context.
     * returns a clone of the original object with the new values
     */
    private materializeParams(jsonObj: any, request: any): any {

        function customizer(value) {
            if (typeof value === "string") {
                if (_.startsWith(value, "{{") && _.endsWith(value, "}}")) {
                    value = _.trim(value, "{}");

                    var valFromEval = this.evalWithContext({ "req": request }, value);

                    if (valFromEval) {
                        return valFromEval;
                    } else {
                        return (jsonObj + " --not found in env!!--");
                    }
                }
            }
            return undefined;
        }

        return _.cloneDeepWith(jsonObj, customizer.bind(this));
    }

    /**
     * evaluates a js string with the gievn context, is used to resolve parameters inside step responses
     */
    private evalWithContext(context: any, code: string) {
        function evalInContext() {
            return eval(code);
        }
        // here for the code undergoing eval (not unused..)
        var req = context.req;
        var utils = this._utils;
        var retval = evalInContext.call(context);
        return retval;
    }

}
