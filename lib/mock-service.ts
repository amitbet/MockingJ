
import _ = require("lodash");
import { MockStep, MockResponse } from "./mock-step";
import { ScenarioRepo } from "./scenario-repo";
import { EventEmitter } from "events";
import { SimpleLogger, ILogger } from "./simple-logger";

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
    port: number;
    start(host?: string): void;
    stop();
    // should also provide an event for 'incoming' with the appropriate message & session.
}

/**
 * Any protocol "client" that can handle sending responses in a given protocol (can be either server or client, just that it handles outgoing traffic)
 * http server, http client (for new outgoing requests) & ws server should all implement this + register as responder for httpRes / HttpReq / ws actions (respectively).
 */
export interface MockResponder {
    type: string;
    sendMockResponse(originalMessage: any, // the request information
        action: MockResponse, // the response dictated by the chosen step
        session: MockServerIds); // the session created by the listener, holding scenario & step info updated by the MockFramework
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
            _.each(step.actions, act => {
                this.handleResponse(act, step.type, null, ids);
            });
        });
    }

    private handleResponse(response: MockResponse, type: string, origMessage: any, session: MockServerIds) {
        let responder = this._responders[type];
        if (!responder) {
            this._logger.error("no responder registered for type: ", type);
            return;
        }

        responder.sendMockResponse(origMessage, response, session);
    }

    /**
     * incoming message handler
     */
    private handleIncomingMessage(type: string, session: MockServerIds, message: any) {
        let functionName = "MockService.handleIncomingMessage ";
        this._logger.trace("received: %s", JSON.stringify(message));
        let msgObj = message;

        try {

            let step = this.getStepFromScenario(type, session, msgObj);
            if (step && step.actions) {
                _.forEach(step.actions, (action, key) => {
                    this._logger.trace(functionName + "sending: %s", JSON.stringify(action.body));

                    // if no action type exists, inherit it
                    let aType = action.type || step.type;

                    // calculate delay
                    let delay: number = action.delay || 0;
                    let sDelay: number = step.delay || 0;
                    delay += sDelay;

                    if (!delay || delay < 0)
                        delay = 0;

                    if (!action.body)
                        this._logger.warn(functionName + "action %s seems to have no payload: ", action);

                    // send the responses!
                    setTimeout(() => {
                        this.handleResponse(action, aType, message, session);
                    }, delay);
                });
            }
            else {
                this._logger.error(functionName + "A problem with the scenario, the message does'nt match expected input. message: ", message);
            }
        } catch (err) {
            this._logger.error(functionName + "error: ", err);
            // ws.send("MockServer.onWebsocketMessage error: " + err);
            return;
        }
    }
}
