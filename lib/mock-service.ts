
import _ = require("lodash");
import { MockStep } from "./mock-step";
import { ScenarioRepo } from "./scenario-repo";
import { EventEmitter } from "events";
import { SimpleLogger, ILogger } from "./simple-logger";
import { MockResponder } from "./mock-responder";

export interface MockServerIds {
    sessionId: string; // id of the session with current client (can span multiple requests & multiple socket connections)
    socketId: string; // id of the client socket (or http response)
}

export interface MockSessionInfo {
    scenarioId: string; // scenario id in the repo
    scenarioPos: number; // position for serial steps in the scenario (not counting fallback steps)
}

/**
 * the server for a certain protocol, is typically also be a responder (for request -> response).
 */
export interface MockListener extends EventEmitter {
    type: string;
    start(): void;
    stop();
    // should also provide an event for 'incoming' with the appropriate message & session.
}



export class MockService {
    private scenarios: ScenarioRepo = new ScenarioRepo(this._logger);
    private _sessionMap: _.Dictionary<MockSessionInfo> = {};
    private _responders: _.Dictionary<MockResponder> = {};
    private _listeners: _.Dictionary<MockListener> = {};

    constructor(private scenarioFile: string, responders?: Array<MockResponder>, listeners?: Array<MockListener>, private _logger: ILogger = new SimpleLogger()) {
        // load all data files

        if (listeners) {
            _.each(listeners, (listener) => {
                this.registerListener(listener, listener.type);
            });
        }
        if (responders) {
            _.each(responders, (responder) => {
                this.registerResponder(responder, responder.type);
            });
        }
    }


    public start() {
        this.scenarios.loadDataFile(this.scenarioFile, () => {
            this.performInitialSteps();
            _.each(this._listeners, (listener) => {
                listener.start();
            });
        });

    }

    public registerResponder(responder: MockResponder, type: string) {
        if (this._responders[type]) {
            this._logger.error("a responder is already registered for type: ", type);
        }
        this._responders[type] = responder;
    }

    public registerListener(listener: MockListener, type: string) {
        if (this._listeners[type]) {
            this._logger.error("a listener is already registered for type: ", type);
        }

        this._listeners[type] = listener;
        listener.on("incoming", this.handleIncomingMessage.bind(this, type));
    }

    /**
      * gets the next step for this scenario & session (may be by step order or any fallback step as defined in the scenario)
      */
    private getStepFromScenario(type: string, ids: MockServerIds, request: any): MockStep {
        let session = this._sessionMap[ids.sessionId];

        // session has not been assigned a scenario yet - randomly assign one (choice is weighted as defined in the scenario file)
        if (!session) {
            let sc = this.scenarios.getRandomScenarioForRequest(request, type);
            if (sc == null) {
                this._logger.error("MockService.getStepFromScenario - no scenario found for type: " + type);
            }
            this._logger.debug("MockService.getStepFromScenario - chose scenario: ", sc.id);

            session = {
                scenarioId: sc.id,
                scenarioPos: 0
            };
            this._sessionMap[ids.sessionId] = session;
        }

        // get the step from the scenario
        var scStep = this.scenarios.getStepByNumber(session.scenarioId, session.scenarioPos, request);
        if (!scStep.isFallback)
            ++session.scenarioPos;

        return scStep.step;
    }

    /**
     * run all the initial steps, should be invoked on service start
     */
    private performInitialSteps() {
        let initSteps: Array<MockStep> = this.scenarios.getAllInitialSteps();

        _.each(initSteps, (step) => {
            let ids: MockServerIds = { sessionId: "init", socketId: null };
            step.execute(this._responders, null, ids);
        });
    }

    /**
    * incoming message handler
    */
    private handleIncomingMessage(type: string, session: MockServerIds, message: any) {
        let functionName = "MockService.handleIncomingMessage ";
        this._logger.trace(functionName + "--> received:", message);
        let msgObj = message;

        try {

            let step = this.getStepFromScenario(type, session, msgObj);
            if (step) {
                step.execute(this._responders, msgObj, session);
            }
            else {
                this._logger.error(functionName + "A problem with the scenario, the message doesn't match expected input. message: ", message);
            }
        } catch (err) {
            this._logger.error(functionName + "error: ", err);
            return;
        }
    }
}
