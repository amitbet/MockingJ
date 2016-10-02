import * as WebSocket from "ws";
import Uuid = require("node-uuid");
import _ = require("lodash");
import fs = require("fs");
import {MockStep} from "./mock-step";
import {ScenarioRepo} from "./scenario-repo";

interface MockServerSession {
    scenarioId?: string;
    scenarioPos?: number;
    id: string;
}

export interface MockServerConfiguration {
    proxyWsToUrl?: string;
    proxyWs: boolean;
}

export class MockServer {
    private wss: WebSocket.Server;
    private pendingMessages: Array<MockStep> = [];
    private client;
    private scenarios: ScenarioRepo = new ScenarioRepo(this._logger);
    private sessions: Array<MockServerSession> = [];
    private _logger;
    private configObj: any;

    constructor(port: number, scenarioFiles: Array<string>, private _configObj: MockServerConfiguration, logger: any) {
        this._logger = logger;

        // load all data files
        for (let sf in scenarioFiles) {
            this.scenarios.loadDataFile(scenarioFiles[sf]);
        }

        // create ws server
        let options: WebSocket.IServerOptions = {};
        options.port = port;
        this.wss = new WebSocket.Server(options);

        this.wss.on("connection", (ws) => {
            let session: MockServerSession = { id: Uuid.v4() };
            session.id = Uuid.v4();
            this.sessions.push(session);

            ws.on("message", this.onWebsocketMessage.bind(this, session, ws));
            ws.once("error", this.onWebsocketError.bind(this, session, ws));
            ws.once("close", this.onWebsocketClosed.bind(this, session, ws));
        });
    }

    /**
     * web socket error handler
     */
    private onWebsocketError(session: MockServerSession, ws, err) {
        this._logger.error("onWebsocketError ", "websocket errored:", err);
        _.remove(this.sessions, s => {
            return s.id === session.id;
        });

        ws.close(1006); // 1006 - CLOSE_ABNORMAL
    }
    /**
     * web socket close handler
     */
    private onWebsocketClosed(session: MockServerSession, ws) {
        _.remove(this.sessions, s => {
            return s.id === session.id;
        });
        this._logger.info("onWebsocketClosed ", "websocket closed:", session.id);
    }

    /**
     * gets the next step for this scenario & session (may be by step order or any fallback step as defined in the scenario)
     */
    private getStepFromScenario(session: MockServerSession, msgObj: any): MockStep {
        let mockScenario: any;
        let resMsg: any;

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

    /**
     * web socket message handler
     */
    private onWebsocketMessage(session: MockServerSession, ws, message) {
        this._logger.trace("received: %s", message);
        let msgObj;

        try {
            msgObj = JSON.parse(message);


            let resMsg: any;

            let step = this.getStepFromScenario(session, msgObj);
            if (step && step.actions) {
                _.forEach(step.actions, (action, key) => {
                    this._logger.trace("sending: %s", JSON.stringify(action.response));

                    //if no action type exists, inherit it
                    let aType = action.type || step.type;

                    // calculate delay
                    let delay: number = action.delay || 0;
                    let sDelay: number = step.delay || 0;
                    delay += sDelay;

                    if (!delay || delay < 0)
                        delay = 0;

                    // send the responses!
                    setTimeout(function () {
                        switch (aType) {
                            case "ws":
                                if (!action.response)
                                    this._logger.warn("ws action %s seems to have no payload.", action.name);
                                ws.send(JSON.stringify(action.response));
                                break;
                            case "queue":
                            case "rest":
                            default:
                                throw action.type + " actions are not implemented.";
                        }
                    }, delay);
                });
            }
            else {
                this._logger.error("A problem with the scenario, the message does'nt match expected input. message: ", message);
            }
        } catch (err) {
            this._logger.error("MockServer.onWebsocketMessage error: ", err);
            ws.send("MockServer.onWebsocketMessage error: " + err);
            return;
        }
    }
}