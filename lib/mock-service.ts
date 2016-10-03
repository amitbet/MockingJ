
import _ = require("lodash");
import {MockStep, MockResponse} from "./mock-step";
import {ScenarioRepo} from "./scenario-repo";
import {EventEmitter} from "events";

export interface MockServerIds {
    sessionId: string;
    socketId: string;
}

export interface MockSessionInfo {
    scenarioId: string;
    scenarioPos: number;
    sessionId: string;
}

/**
 * the server for a certain protocol, is typically also be a responder (for request -> response).
 */
export interface MockListener extends EventEmitter {
    start(port: number, host?: string): void;
    stop();
    listening: boolean;
    //should also provide an event for 'incoming' with the appropriate message & session.
}

/**
 * Any protocol "client" that can handle sending responses in a given protocol (can be either server or client, just that it handles outgoing traffic)
 * http server, http client (for new outgoing requests) & ws server should all implement this + register as responder for httpRes / HttpReq / ws actions (respectively).
 */
export interface MockResponder {
    sendMockResponse(originalMessage: any, // the request information
        action: MockResponse, // the response dictated by the chosen step
        session: MockServerIds); // the session created by the listener, holding scenario & step info updated by the MockFramework
}

export class MockService {
    private scenarios: ScenarioRepo = new ScenarioRepo(this._logger);
    private _sessionMap: _.Dictionary<MockSessionInfo> = {};
    constructor(scenarioFiles: Array<string>, private _logger: any) {
        // load all data files
        for (let sf in scenarioFiles) {
            this.scenarios.loadDataFile(scenarioFiles[sf]);
        }
    }

    /**
  * gets the next step for this scenario & session (may be by step order or any fallback step as defined in the scenario)
  */
    private getStepFromScenario(ids: MockServerIds, msgObj: any): MockStep {
        let mockScenario: any;
        let resMsg: any;
        let session = this._sessionMap[ids.sessionId];

        //session has not been assigned a scenario yet - randomly assign one (choice is weighted as defined in the scenario file)
        if (!session.scenarioId) {
            session.scenarioId = this.scenarios.getRandomScenarioByWeight().name;
            session.scenarioPos = 0;
        }
        //get the step from the scenario
        var step = this.scenarios.getStepByNumber(session.scenarioId, session.scenarioPos, msgObj);
        if (!step.isFallback)
            ++session.scenarioPos;

        return step;
    }

    private _responders: _.Dictionary<MockResponder> = {};
    private _listeners: _.Dictionary<MockListener> = {};

    private handleResponse(response: MockResponse, type: string, message: any, session: MockServerIds) {
        let responder = this._responders[type];
        if (!responder) {
            this._logger.error("no responder registered for type: ", type);
            return;
        }

        responder.sendMockResponse(message, response, session);
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
        listener.on('incoming', this.handleIncomingMessage.bind(this))
    }

    /**
     * web socket message handler
     */
    private handleIncomingMessage(session: MockServerIds, message: any) {
        let functionName = "MockService.handleIncomingMessage ";
        this._logger.trace("received: %s", message);
        let msgObj = message;

        try {
            // msgObj = JSON.parse(message);


            let resMsg: any;

            let step = this.getStepFromScenario(session, msgObj);
            if (step && step.actions) {
                _.forEach(step.actions, (action, key) => {
                    this._logger.trace(functionName + "sending: %s", JSON.stringify(action.response));

                    //if no action type exists, inherit it
                    let aType = action.type || step.type;

                    // calculate delay
                    let delay: number = action.delay || 0;
                    let sDelay: number = step.delay || 0;
                    delay += sDelay;

                    if (!delay || delay < 0)
                        delay = 0;

                    if (!action.response)
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
