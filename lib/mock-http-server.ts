import * as http from "http";
var shortid = require("shortid");
import _ = require("lodash");
import {MockResponse} from "./mock-step";
import {EventEmitter} from "events";
import {MockServerIds, MockListener, MockResponder} from "./mock-service";
import {HttpMessageData} from "./http-message-data";
import {HttpUtils} from "./http-utils";
import {ILogger, SimpleLogger} from "./simple-logger";

// for http client
import * as request from "request";

export class MockHttpClient extends EventEmitter implements MockResponder {

    constructor(private _logger: ILogger = new SimpleLogger()) {
        super();
    }

    public sendMockResponse(
        originalMessage: any, // the request information
        action: MockResponse, // the response dictated by the chosen step
        session: MockServerIds) {
        let resData = <HttpMessageData>action.response;
        var method = resData.method.toLowerCase();
        if (method === "delete")
            method = "del";

        var reqOptions: request.CoreOptions = {};
        reqOptions.body = resData.body;
        request[method](resData.url, reqOptions, (error, response, body) => {
            this._logger.debug("got response: " + body);
        });
    }
}


export class MockHttpServer extends EventEmitter implements MockListener, MockResponder {
    public listening: boolean;

    private _server: http.Server;

    private _socketMap: _.Dictionary<http.ServerResponse> = {};

    constructor(private _logger) {
        super();
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

        let resInfo: HttpMessageData = action.response;
        res.end(JSON.stringify(resInfo.body));
    }

    public start(port: number, host?: string, sessionFieldOrFunction?: string | ((req) => string)) {
        try {

            // Create a server
            this._server = http.createServer((request, response) => {
                let session: MockServerIds = { sessionId: "httpSession", socketId: shortid.generate() };
                HttpUtils.processHttpRequest(request, (httpMessageData) => {
                    session.socketId = session.sessionId;
                    let sessionId = "httpSession";// shortid.generate();
                    if (sessionFieldOrFunction) {
                        if (typeof sessionFieldOrFunction === "string") {
                            sessionId = HttpUtils.getHttpSessionId(request, sessionFieldOrFunction);
                        }
                        else {
                            sessionId = (<((req) => string)>sessionFieldOrFunction)(request);
                        }
                    }
                    session.sessionId = sessionId;

                    this._socketMap[session.socketId] = response;
                    this.emit("incoming", session, httpMessageData);
                });
            });

            // Lets start our server
            this._server.listen(port, () => {
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