import { WsProxy } from "./ws-proxy";
import { HttpProxy } from "./http-proxy";
import { ScenarioRepo } from "../scenario-repo";
import { MockStep, MockResponse } from "../mock-step";
import { SimpleLogger, ILogger } from "../simple-logger";
import http = require("http");
import _ = require("lodash");
import fs = require("fs");
import path = require("path");
var shortid = require("shortid");
import { HttpUtils } from "../protocols/http-utils";
import faker = require("faker");
import * as Q from "q";
export interface MockRecorderConfiguration {
    wsProxyPort?: number;
    httpProxyPort?: number;
    wsProxyTarget?: string;
    httpProxyTarget?: string;
    listeners: "ws" | "http" | "both";
    recordHttpHeaders?: boolean;
    matchWsField?: string; // default is uid
    mirrorFields?: Array<string>; // fields that should be copied from req to response, and not included in conditions
    largeFields?: Array<string>; // fields that should be saved to a sperate file
}

export class MockRecorder {
    private _wsProxy: WsProxy;
    private _httpProxy: HttpProxy;
    private _scenarioRepo: ScenarioRepo;
    private _pendingRequests: _.Dictionary<any> = {};
    private _latestRequests: _.Dictionary<any> = {};
    private _filesWritePath: string;
    constructor(private _configObj: MockRecorderConfiguration, private _logger: ILogger = new SimpleLogger()) {
        // this._configObj.matchWsField = this._configObj.matchWsField || "uid";

        // set default explicitly to false
        this._configObj.recordHttpHeaders = this._configObj.recordHttpHeaders || false;
    }


    public start(saveFilePath: string, saveInterval: number = 5000) {
        this._filesWritePath = path.dirname(saveFilePath);
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

    // private handleIncomingHttp(req) {
    //      this.processHttpRequest(req, (info) => {
    //          console.log("in: ", JSON.stringify(info));
    //      });
    // }
    private handleOutgoingHttp(res: any, req: http.IncomingMessage, sessionId: string) {
        HttpUtils.processHttpRequest(req, "http", (reqInfo) => {
            this._logger.debug("--> in: ", reqInfo);
            HttpUtils.processHttpResponse(res, "http", (resInfo) => {
                this._logger.debug("<-- out: ", resInfo);

                let matchId = shortid.generate();
                let reqId = sessionId + "**" + matchId;
                let matchingReq = req;

                if (!matchingReq) {
                    this._logger.error("MockRecorder handleOutgoingHttp: response without matching request: ", res);
                    return;
                }

                let requestClone = _.cloneDeep(reqInfo);
                this.treatMirrorFields(requestClone, true);
                this.treatLargeFields(requestClone);

                let step: MockStep = {
                    requestConditions: requestClone, // the conditions section is a json which should match the request exactly, missing lines will not be checked (so only lines that exist are required in the request) 
                    // delay - time to wait in millisecs before performing any actions
                    type: "http", // "amqp" | "ws" | "http";// a protocol type so we know how to treat condition checking
                    actions: [], // actions are steps without conditions that should be performed when step is done (notice that a delay may be also included in each)
                    id: reqId,
                    //    isFallback: false
                };

                let responseClone = _.cloneDeep(resInfo);

                this.treatMirrorFields(responseClone, false);
                this.treatLargeFields(responseClone);

                let mRes: MockResponse = {
                    body: responseClone, // the response to send
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

    private deepGetValue(obj, path) {
        var paths = path.split(".");
        var current = obj;

        var i;

        for (i = 0; i < paths.length; ++i) {
            if (current[paths[i]] === undefined) {
                return undefined;
            } else {
                current = current[paths[i]];
            }
        }
        return current;
    }

    private deepApply(obj, path, func) {
        var paths = path.split(".");
        var current = obj;
        var key;
        var parent;
        var i;

        for (i = 0; i < paths.length; ++i) {
            if (current[paths[i]] === undefined) {
                return undefined;
            } else {
                parent = current;
                key = paths[i];
                current = current[key];
            }
        }
        func(parent, key, path);
    }

    private treatLargeFields(obj: any): Q.Promise<any> {
        let treatment;
        let filename = faker.random.uuid() + ".txt";
        filename = "./" + path.join(this._filesWritePath, filename);
        var promises = [];
        treatment =
            (parent, key, path) => {
                let promise = Q.nfcall(fs.writeFile, filename, parent[key]).then(() => {
                    parent[key] = "{{utils.readFile('" + filename + "')}}";
                });
                promises.push(promise);
            };
        if (this._configObj.largeFields) {
            _.each(this._configObj.largeFields, (path) => {
                this.deepApply(obj, path, treatment);
            });
        }
        return Q.all(promises);
    }

    private treatMirrorFields(obj: any, del = false) {
        let treatment;

        if (del) {
            treatment =
                (parent, key, path) => {
                    delete parent[key];
                };
        }
        else {
            treatment =
                (parent, key, path) => {
                    parent[key] = "{{req." + path + "}}";
                };
        }
        if (this._configObj.mirrorFields)
            _.each(this._configObj.mirrorFields, (path) => {
                this.deepApply(obj, path, treatment);
            });
    }

    private handleIncomingWs(req: any, sessionId: string) {
        let matchId = this.deepGetValue(req, this._configObj.matchWsField);
        this._pendingRequests[sessionId + "**" + matchId] = req;
        this._latestRequests[sessionId] = req;
        this._logger.debug("--->session: ", sessionId, " ws req: ", req);

    }
    private handleOutgoingWs(res: any, sessionId: string) {

        let matchId = this.deepGetValue(res, this._configObj.matchWsField);
        let reqId = sessionId + "**" + matchId;
        let matchingReq = this._pendingRequests[reqId];
        if (!matchingReq) {
            matchingReq = this._latestRequests[sessionId];
            if (matchingReq) {
                let reqMatchId = this.deepGetValue(matchingReq, this._configObj.matchWsField);
                if (reqMatchId)
                    reqId = sessionId + "**" + reqMatchId;
                else
                    reqId = sessionId;
            }
        }

        if (!matchingReq) {
            this._logger.error("MockRecorder handleOutgoingWs: response without matching request: ", res);
            return;
        }

        let requestClone = _.cloneDeep(matchingReq);
        this.treatMirrorFields(requestClone, true);
        this.treatLargeFields(requestClone);
        let step: MockStep = {
            requestConditions: requestClone, // the conditions section is a json which should match the request exactly, missing lines will not be checked (so only lines that exist are required in the request) 
            // delay - time to wait in millisecs before performing any actions
            type: "ws", // "amqp" | "ws" | "http";// a protocol type so we know how to treat condition checking
            actions: [], // actions are steps without conditions that should be performed when step is done (notice that a delay may be also included in each)
            id: reqId,
            //  isFallback: false
        };

        let responseClone = _.cloneDeep(res);
        this.treatMirrorFields(responseClone, false);
        this.treatLargeFields(responseClone);
        let mRes: MockResponse = {
            body: responseClone, // the response to send
            // delay - time to wait in millisecs before sending response
            type: "ws" // "amqp" | "ws" | "httpRes", "httpReq"; // response type indicates which protocol will be used to send this response if missing will be set by step (as its direct response).
            // name - an optional name, for logging & debugging
        };
        step.actions.push(mRes);

        this._scenarioRepo.addStep(sessionId, step);

        this._logger.debug("<---session: ", sessionId, " ws res:", res);
    }

    private createHttpListener() {
        this._httpProxy = new HttpProxy(this._configObj.httpProxyTarget);
        this._httpProxy.start(this._configObj.httpProxyPort);
        // this._httpProxy.on("incoming", this.handleIncomingHttp.bind(this));
        this._httpProxy.on("outgoing", this.handleOutgoingHttp.bind(this));
    };
    private createWsListener() {
        this._wsProxy = new WsProxy(this._configObj.wsProxyTarget);
        this._wsProxy.start(this._configObj.wsProxyPort);
        this._wsProxy.on("incoming", this.handleIncomingWs.bind(this));
        this._wsProxy.on("outgoing", this.handleOutgoingWs.bind(this));
    };

    private removeHttpListener() {
        // this._httpProxy.removeListener("incoming", this.handleIncomingHttp);
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

