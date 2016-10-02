import {MockStep, MockResponse} from "./mock-step";
import _ = require("lodash");

export class StepLexicon {
    private _stepPool: Array<MockStep> = [];
    private nameMap: _.Dictionary<MockStep> = {};

    public toJson(): string {
        return JSON.stringify(this._stepPool, null, 2);
    }

    public fromJson(json: string) {
        this._stepPool = JSON.parse(json);
    }

    /**
     * adds multiple steps
     */
    public addSteps(steps: Array<MockStep>) {
        for (var i = 0; i < steps.length; i++) {
            let step = steps[i];
            this.addStep(step);
        }
    }

    /**
     * adds a single step
     */
    public addStep(step: MockStep) {
        this._stepPool.push(step);
        this.nameMap[step.id] = step;
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
        var retval = []
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
    public getStepByName(stepName: string, request: any): MockStep {
        var step: MockStep = this.nameMap[stepName];
        var newStep: MockStep;

        if (!step)
            return null;

        if (this.matchRequest(step.requestConditions, request)) {
            newStep = this.cloneAndParametrize(step, request);
        }
        return newStep;
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
        }
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
        var k;
        var newJsonObj = jsonObj;
        if (jsonObj instanceof Object) {
            newJsonObj = {};
            for (k in jsonObj) {
                if (jsonObj.hasOwnProperty(k)) {
                    // recursive call to scan property
                    newJsonObj[k] = this.materializeParams(jsonObj[k], request);
                }
            }
        } else {
            // not an Object so obj[k] here is a value
            if (typeof jsonObj === "string") {
                var str: string;
                str = jsonObj.trim();
                if (_.startsWith(str, "{{") && _.endsWith(str, "}}")) {
                    str = _.trim(str, "{}");

                    var valFromEval = this.evalWithContext({ "req": request }, str);

                    if (valFromEval) {
                        newJsonObj = valFromEval;
                    } else {
                        newJsonObj = jsonObj + " --not found in env!!--";
                    }
                }
            }
        }
        return newJsonObj;
    }

    /**
     * evaluates a js string with the gievn context, is used to resolve parameters inside step responses
     */
    private evalWithContext(context: any, code: string) {
        function evalInContext() {
            return eval(code);
        }
        var req = context.req;
        return evalInContext.call(context);
    }
}