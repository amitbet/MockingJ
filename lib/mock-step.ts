import { InlineUtils } from "./inline-utils";
import { ILogger } from "./simple-logger";
import _ = require("lodash");
import { MockResponder } from "./mock-responder";
import { MockServerIds } from "./mock-service";

export class MockStep {
    public id: string;
    public type: string; // "amqp" | "ws" | "http";// a protocol type so we know how to treat condition checking

    private actions: Array<MockResponse> = []; // actions are steps without conditions that should be performed when step is done (notice that a delay may be also included in each)
    private requestConditions?: any; // the conditions section is a json which should match the request exactly, missing lines will not be checked (so only lines that exist are required in the request) 
    private delay?: number = 0; // time to wait in millisecs before performing any actions

    /**
     * used for copyingconverting desirialized step data into MockStep objects.
     */
    public static makeStep(origStepFromJson: any, logger: ILogger, utils: InlineUtils): MockStep {
        let step = new MockStep(origStepFromJson.id, origStepFromJson.type, logger, utils);
        let retStep: MockStep = <MockStep>_.extend(step, origStepFromJson);
        return retStep;
    }

    constructor(id: string, type: string, private _logger: ILogger, private _utils: InlineUtils, requestConditions?: any, delay: number = 0) {
        this.delay = delay;
        this.type = type;
        this.requestConditions = requestConditions;
        this.id = id;
    }


    /**
     * validates a given MockStep, issues warnings in log about problems
     */
    public validate() {
        if (!this.id)
            this._logger.warn("StepValidation: detected a step without id - it is unusable");

        if (!this.type)
            this._logger.warn("StepValidation: step: " + this.id + " has no type");

        if (!this.actions || this.actions.length === 0)
            this._logger.warn("StepValidation: step: " + this.id + " contains no actions");


        _.each(this.actions, action => {
            if (!action.type)
                this._logger.info("StepValidation: action: '" + action.name + "' has no type in step: " + this.id + " it will be inherited from step.type (= " + this.type + ")");
        });
    }

    /**
     * adds the actions from another step into this one.
     * used in the recorder when several responses are given for one request (WS / Queue)
     */
    public Merge(step: MockStep) {
        let idx = this.actions.length;
        _.forEach(step.actions, (act) => {
            if (!act.name) {
                act.name = "resp" + idx;
                ++idx;
            }
        });
        this.actions = this.actions.concat(step.actions);
    }

    public addAction(action: MockResponse) {
        this.actions.push(action);
    }

    /**
     * runs this step, using the given responder dictionary
     */
    public execute(respondersByType: _.Dictionary<MockResponder>, message: any, session: MockServerIds) {
        if (this.actions) {

            _.forEach(this.actions, (action, key) => {
                // if no action type exists, inherit it
                let aType = action.type || this.type;
                let responder = respondersByType[aType];

                if (!responder) {
                    this._logger.error("no responder registered for type: ", aType);
                    return;
                }

                this.executeAction(action, session, message, responder);
            });
        }
    }

    public matchRequest(actualReq: any): boolean {
        return this.matchRequestInner(this.requestConditions, actualReq);
    }

    /**
      * executes the action (also deals with its repetitions and delays)
      */
    private executeAction(rawAction: MockResponse, session: MockServerIds, message: any, responder: MockResponder) {
        let stepDelay: number = this.delay;



        var functionName: string = "MockService.executeAction";
        this._logger.trace(functionName + "<-- sending:", rawAction.body);

        // calculate delay
        let delay: number = rawAction.delay || 0;
        let sDelay: number = stepDelay || 0;
        delay += sDelay;

        if (!delay || delay < 0)
            delay = 0;

        if (!rawAction.body)
            this._logger.warn(functionName + "action seems to have no payload: ", rawAction);


        let reps: number = rawAction.repetitions || 1;

        if (rawAction.repetitions === 0)
            reps = -1;

        if (reps === 1) {
            // send the response once!
            setTimeout(() => {
                let action = this.materializeParams(rawAction, message);
                responder.sendMockResponse(message, action, session);
            }, delay);
        }
        else {
            let counter: number = 0;
            let timer: NodeJS.Timer = setInterval(() => {
                counter++;
                let action = this.materializeParams(rawAction, message);
                responder.sendMockResponse(message, action, session);
                if (reps > 1 && counter === reps && timer) {
                    clearInterval(timer);
                }
            }, delay);
        }
    }

    /**
     * tests the request conditions against the request, returns true if request matches
     */
    private matchRequestInner(requestConds: any, actualReq: any): boolean {
        var k;

        if (requestConds instanceof Object) {
            for (k in requestConds) {
                if (requestConds.hasOwnProperty(k)) {
                    // recursive call to scan property
                    let isMatch = this.matchRequestInner(requestConds[k], actualReq[k]);
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
        // here for the code undergoing eval (not un-used!!)
        var req = context.req;
        var utils = this._utils;
        var retval = evalInContext.call(context);
        return retval;
    }

}

export interface MockResponse {
    body: any; // the response to send
    delay?: number; // time to wait in millisecs before sending response
    type: string; // "amqp" | "ws" | "httpRes", "httpReq"; // response type indicates which protocol will be used to send this response if missing will be set by step (as its direct response).
    name?: string; // an optional name, for logging & debugging
    repetitions?: number; // -1,0 for inifite, default is 1, first response is delayed by 'delay' as are all the rest (so: wait, res, wait, res2, wait, res3)
}