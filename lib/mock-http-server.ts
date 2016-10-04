import * as http from "http";
import Uuid = require("node-uuid");
import _ = require("lodash");
import {MockResponse} from "./mock-step";
import {EventEmitter} from "events";
import {MockServerIds, MockListener, MockResponder} from "./mock-service";
import {HttpMessageData} from "./http-message-data";

//for http client
import * as request from "request";

export class MockHttpClient extends EventEmitter implements MockResponder {

    constructor(private _logger) {
        super();
    }

    public sendMockResponse(originalMessage: any, // the request information
        action: MockResponse, // the response dictated by the chosen step
        session: MockServerIds) {
        let resData = <HttpMessageData>action.response;
        var method = resData.method.toLowerCase();
        if (method == "delete")
            method = "del";

        var reqOptions: request.CoreOptions = {};
        reqOptions.body = resData.body;
        request[method](resData.url, reqOptions, (error, response, body) => {
            this._logger.debug("got response: " + body);
        });
    }
}


export class MockHttpServer extends EventEmitter implements MockListener, MockResponder {
    private _server: http.Server;

    public listening: boolean;

    private _socketMap: _.Dictionary<http.ServerResponse> = {};

    private configObj: any;

    constructor(private _logger) {
        super();
    }
    private processHttpRequest(httpMessage: any, callback: (res: HttpMessageData) => void) {
        var descObj: HttpMessageData = {
            method: httpMessage.method,
            url: httpMessage.url,
            headers: httpMessage.headers,
           // time: new Date(),
            body: null
        };
        var bodyObj;
        if (httpMessage.method == 'POST' || httpMessage.method == 'PUT' || httpMessage.method == 'DEL') {
            httpMessage.setEncoding('utf8');
            var body = '';
            httpMessage.on('data', function (data) {
                body += data;
                // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
                // if (body.length > 1e6) {
                //     // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQUEST
                //     req.connection.destroy();
                // }
            });
            httpMessage.on('end', function () {
                bodyObj = JSON.parse(body);
                callback(descObj);
            });
            descObj.body = bodyObj;
        }
        else {
            callback(descObj);
            // console.log(JSON.stringify(descObj));
        }
    }

    public start(port: number, host?: string) {
        try {

            //Create a server
            this._server = http.createServer((request, response) => {
                let session: MockServerIds = { sessionId: Uuid.v4(), socketId: "" };
                this.processHttpRequest(request, (httpMessageData) => {
                    // TODO: setting the sessionId to be the socketId is bad - since it limits the scenario length to one (req->response).
                    // we should have some extrction routine to find the session in Http headers / url / cookie
                    session.socketId = session.sessionId;
                    this._socketMap[session.socketId] = response;
                    this.emit('incoming', session, httpMessageData);
                });
            });

            //Lets start our server
            this._server.listen(port, function () {
                //Callback triggered when server is successfully listening. Hurray!
                console.log("Server listening on: http://localhost:%s", 8045);
                this.listening = true;
            });
            //  this._server = new http.Server(options);

        } catch (err) {
            this._logger.error("MockWsServer.start, error while starting server: ", err);
        }
    }

    private onWebsocketMessage(session: MockServerIds, ws: WebSocket, message: any) {
        this.emit('incoming', session, JSON.parse(message));
    }

    public stop() {
        try {
            this._server.close();
            this.listening = true;
        } catch (err) {
            this._logger.error("MockWsServer.stop, error while closing server: ", err);
        }
    }
    public sendMockResponse(originalMessage: any, // the request information
        action: MockResponse, // the response dictated by the chosen step
        session: MockServerIds) {
        let res = this._socketMap[session.socketId];
        delete this._socketMap[session.socketId];

        let resInfo:HttpMessageData = action.response;
        res.end(JSON.stringify(resInfo.body));
    }
}