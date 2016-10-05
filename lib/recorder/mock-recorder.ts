import {WsProxy} from "./ws-proxy";
import {HttpProxy} from "./http-proxy";
import qs = require("querystring");
import {ScenarioRepo} from "../scenario-repo";
import {MockStep, MockResponse} from "../mock-step";
import {SimpleLogger} from "../simple-logger";
import http = require("http");
import _ = require("lodash");
import {HttpMessageData} from "../http-message-data";
import fs = require("fs");
var shortid = require("shortid");

export interface MockRecorderConfiguration {
    wsProxyPort?: number;
    httpProxyPort?: number;
    wsProxyTarget?: string;
    httpProxyTarget?: string;
    listeners: "ws" | "http" | "both";

    matchWsField?: string; // default is uid
}

export class MockRecorder {
    private _wsProxy: WsProxy;
    private _httpProxy: HttpProxy;
    private _scenarioRepo: ScenarioRepo;
    private _pendingRequests: _.Dictionary<any> = {};
    private _latestRequests: _.Dictionary<any> = {};
    constructor(private _configObj: MockRecorderConfiguration, private _logger) {
        this._configObj.matchWsField = this._configObj.matchWsField || "uid";
    }


    public start(saveFilePath: string, saveInterval: number = 5000) {
        this._scenarioRepo = new ScenarioRepo(this._logger);
        switch (this._configObj.listeners) {
            case "ws":
                this.createWsListener();
                break;
            case "http":
                this.createHttpListener();
                break;
            case "both":
                this.createWsListener();
                this.createHttpListener();
                break;
            default:
                this._logger.debug("MockRecorder.start: unsupported listener type");
                break;
        }
        setInterval(() => {
            var repoJson = this._scenarioRepo.toJson();
            fs.writeFile(saveFilePath, repoJson);
        }, saveInterval);
    }

    public stop() {
        if (this._httpProxy) {
            this.removeHttpListener();
        }
        if (this._wsProxy) {
            this.removeWsListener();
        }
    }

    private processHttpResponse(res: any, callback: (result: HttpMessageData) => void): any {
        var descObj: HttpMessageData = {
            status: res.statusCode,
            headers: res.headers,
            url: res.req.path,
            body: null,
        };
        var body = "";

        // console.log('STATUS: ' + res.statusCode);
        // console.log('HEADERS: ' + JSON.stringify(res.headers));
        // res.setEncoding('utf8');
        res.on("data", (chunk) => {
            body += chunk;
        });

        res.on("end", function () {
            descObj.body = body;
            callback(descObj);
        });
    }

    private processHttpRequest(httpMessage: any, callback: (result: HttpMessageData) => void) {
        var descObj: HttpMessageData = {
            method: httpMessage.method,
            url: httpMessage.url,
            headers: [],
            body: null,
        };
        var bodyObj;
        if (httpMessage.method === "POST" || httpMessage.method === "PUT") {
            httpMessage.setEncoding("utf8");
            var body = "";
            httpMessage.on("data", function (data) {
                body += data;
                // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
                // if (body.length > 1e6) {
                //     // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQUEST
                //     req.connection.destroy();
                // }
            });
            httpMessage.on("end", function () {
                bodyObj = qs.parse(body);
                callback(descObj);
                // console.log(JSON.stringify(descObj));
                // use POST
            });
            descObj.body = bodyObj;
        }
        else {
            callback(descObj);
            // console.log(JSON.stringify(descObj));
        }
    }
    private handleIncomingHttp(req) {
        // this.processHttpRequest(req, (info) => {
        //     console.log("in: ", JSON.stringify(info));
        // });
    }
    private handleOutgoingHttp(res: any, req: http.IncomingMessage, sessionId: string) {
        this.processHttpRequest(req, (reqInfo) => {
            this._logger.debug("in: ", JSON.stringify(reqInfo));
            this.processHttpResponse(res, (resInfo) => {
                this._logger.debug("out: ", JSON.stringify(resInfo));

                let matchId = shortid.generate();
                let reqId = sessionId + "**" + matchId;
                let matchingReq = req;

                if (!matchingReq) {
                    this._logger.error("MockRecorder handleOutgoingHttp: response without matching request: ", res);
                    return;
                }

                let step: MockStep = {
                    requestConditions: reqInfo, // the conditions section is a json which should match the request exactly, missing lines will not be checked (so only lines that exist are required in the request) 
                    // delay - time to wait in millisecs before performing any actions
                    type: "http", // "amqp" | "ws" | "http";// a protocol type so we know how to treat condition checking
                    actions: [], // actions are steps without conditions that should be performed when step is done (notice that a delay may be also included in each)
                    id: reqId,
                    //    isFallback: false
                };

                let mRes: MockResponse = {
                    response: resInfo, // the response to send
                    // delay - time to wait in millisecs before sending response
                    type: "http" // "amqp" | "ws" | "httpRes", "httpReq"; // response type indicates which protocol will be used to send this response if missing will be set by step (as its direct response).
                    // name - an optional name, for logging & debugging
                };
                step.actions.push(mRes);

                this._scenarioRepo.addStep(sessionId, step);

                this._logger.debug("<---session: %s, http res: %s", sessionId, res);
            });
        });
    }

    private handleIncomingWs(req: any, sessionId: string) {
        let matchId = req[this._configObj.matchWsField];
        this._pendingRequests[sessionId + "**" + matchId] = req;
        this._latestRequests[sessionId] = req;
        this._logger.debug("--->session: %s, ws req: ", sessionId, req);
    }
    private handleOutgoingWs(res: any, sessionId: string) {

        let matchId = res[this._configObj.matchWsField];
        let reqId = sessionId + "**" + matchId;
        let matchingReq = this._pendingRequests[reqId];
        if (!matchingReq) {
            matchingReq = this._latestRequests[sessionId];
            reqId = sessionId;
        }

        if (!matchingReq) {
            this._logger.error("MockRecorder handleOutgoingWs: response without matching request: ", res);
            return;
        }

        let step: MockStep = {
            requestConditions: matchingReq, // the conditions section is a json which should match the request exactly, missing lines will not be checked (so only lines that exist are required in the request) 
            // delay - time to wait in millisecs before performing any actions
            type: "ws", // "amqp" | "ws" | "http";// a protocol type so we know how to treat condition checking
            actions: [], // actions are steps without conditions that should be performed when step is done (notice that a delay may be also included in each)
            id: reqId,
            //  isFallback: false
        };

        let mRes: MockResponse = {
            response: res, // the response to send
            // delay - time to wait in millisecs before sending response
            type: "ws" // "amqp" | "ws" | "httpRes", "httpReq"; // response type indicates which protocol will be used to send this response if missing will be set by step (as its direct response).
            // name - an optional name, for logging & debugging
        };
        step.actions.push(mRes);

        this._scenarioRepo.addStep(sessionId, step);

        this._logger.debug("<---session: %s, ws res: %s", sessionId, res);
    }

    private createHttpListener() {
        this._httpProxy = new HttpProxy(this._configObj.httpProxyTarget);
        this._httpProxy.start(this._configObj.httpProxyPort);
        this._httpProxy.on("incoming", this.handleIncomingHttp.bind(this));
        this._httpProxy.on("outgoing", this.handleOutgoingHttp.bind(this));
    };
    private createWsListener() {
        this._wsProxy = new WsProxy(this._configObj.wsProxyTarget);
        this._wsProxy.start(this._configObj.wsProxyPort);
        this._wsProxy.on("incoming", this.handleIncomingWs.bind(this));
        this._wsProxy.on("outgoing", this.handleOutgoingWs.bind(this));
    };

    private removeHttpListener() {
        this._httpProxy.removeListener("incoming", this.handleIncomingHttp);
        this._httpProxy.removeListener("outgoing", this.handleOutgoingHttp);
        this._httpProxy.stop();
        this._httpProxy = null;
    }
    private removeWsListener() {
        this._wsProxy.removeListener("incoming", this.handleIncomingWs);
        this._wsProxy.removeListener("outgoing", this.handleOutgoingWs);
        this._wsProxy.stop();
        this._wsProxy = null;
    }
}

// --test main--
var logger = new SimpleLogger();
var mr = new MockRecorder({
    wsProxyPort: 9000,
    httpProxyPort: 8000,
    wsProxyTarget: "ws://localhost:8044",
    httpProxyTarget: "http://localhost:8045",
    listeners: "both"
}, logger);

mr.start("./scenarioRecording.json");