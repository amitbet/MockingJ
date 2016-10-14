import * as http from "http";
var shortid = require("shortid");
import _ = require("lodash");
import { MockResponse } from "../mock-step";
import { EventEmitter } from "events";
import { MockServerIds, MockListener, MockResponder } from "../mock-service";
import { HttpMessageData } from "./http-message-data";
import { HttpUtils } from "./http-utils";
import { ILogger, SimpleLogger } from "../simple-logger";

// for http client
import request = require("request");

export class MockHttpClient extends EventEmitter implements MockResponder {
    public type: string = "httpClient";

    constructor(private _logger: ILogger = new SimpleLogger()) {
        super();
    }


    public sendMockResponse(
        originalMessage: any, // the request information
        action: MockResponse, // the response dictated by the chosen step
        session: MockServerIds) {
        let resData = <HttpMessageData>action;
        var method = resData.method.toUpperCase();

        var reqOptions: request.UrlOptions & request.CoreOptions = { url: resData.url };

        reqOptions.url = resData.url;

        if (typeof resData.body !== "string") {
            reqOptions.json = resData.body;
        }
        else {
            reqOptions.body = resData.body;
        }
        reqOptions.method = method;
        request(reqOptions, (error, response, body) => {
            this._logger.debug("got response: " + body);
        });
    }
}


export class MockHttpServer extends EventEmitter implements MockListener, MockResponder {
    public listening: boolean;
    public type: string = "http";
    public port: number;
    private _server: http.Server;

    private _socketMap: _.Dictionary<http.ServerResponse> = {};

    constructor(port: number, private _logger, private sessionFieldOrFunction?: string | ((req) => string)) {
        super();
        this.port = port;
    }


    public stop() {
        try {
            this._server.close();
            this.listening = true;
        } catch (err) {
            this._logger.error("MockWsServer.stop, error while closing server: ", err);
        }
    }
    public sendMockResponse(
        originalMessage: any, // the request information
        action: MockResponse, // the response dictated by the chosen step
        session: MockServerIds) {
        let res = this._socketMap[session.socketId];
        delete this._socketMap[session.socketId];

        let resInfo: HttpMessageData = action.body;
        if (resInfo && resInfo.body)
            res.end(JSON.stringify(resInfo.body));
        else
            res.end();
    }

    public start(host?: string) {
        try {

            // Create a server
            this._server = http.createServer((request, response) => {
                let session: MockServerIds = { sessionId: "httpSession", socketId: shortid.generate() };
                HttpUtils.processHttpRequest(request, this.type, (httpMessageData) => {
                    session.socketId = session.sessionId;
                    let sessionId = "httpSession";// shortid.generate();
                    if (this.sessionFieldOrFunction) {
                        if (typeof this.sessionFieldOrFunction === "string") {
                            sessionId = HttpUtils.getHttpSessionId(request, <string>this.sessionFieldOrFunction);
                        }
                        else {
                            sessionId = (<((req) => string)>this.sessionFieldOrFunction)(request);
                        }
                    }
                    session.sessionId = sessionId;

                    this._socketMap[session.socketId] = response;
                    this.emit("incoming", session, httpMessageData);
                });
            });

            // Lets start our server
            this._server.listen(this.port, () => {
                // Callback triggered when server is successfully listening. Hurray!
                this._logger.debug("Server listening on: http://localhost:%s", 8045);
                this.listening = true;
            });
            // this._server = new http.Server(options);

        } catch (err) {
            this._logger.error("MockWsServer.start, error while starting server: ", err);
        }
    }

}