import * as WebSocket from "ws";
var shortid = require("shortid");
import _ = require("lodash");
import { MockResponse } from "../mock-step";
import { EventEmitter } from "events";
import { MockServerIds, MockListener, MockResponder } from "../mock-service";
import { ILogger, SimpleLogger } from "../simple-logger";

export class MockWsServer extends EventEmitter implements MockListener, MockResponder {
    public listening: boolean;
    public type: string = "ws";
    public port: number;

    private wss: WebSocket.Server;
    private _socketMap: _.Dictionary<WebSocket> = {};

    constructor(port: number, private _logger: ILogger = new SimpleLogger()) {
        super();
        this.port = port;
    }

    public start(host?: string) {
        // create ws server
        let options: WebSocket.IServerOptions = {};
        options.port = this.port;
        try {
            this.wss = new WebSocket.Server(options);
            this.listening = true;
        } catch (err) {
            this._logger.error("MockWsServer.start, error while starting server: ", err);
        }

        this.wss.on("connection", (ws: WebSocket) => {
            this._logger.debug("MockWsServer.start, got a connection!");
            let ids: MockServerIds = { sessionId: shortid.generate(), socketId: "" };

            // since this is a websocket, we assume (for now) that the socket will last the whole session
            ids.socketId = ids.sessionId;
            this._socketMap[ids.socketId] = ws;

            ws.on("message", this.onWebsocketMessage.bind(this, ids, ws));
            ws.once("error", this.onWebsocketError.bind(this, ids, ws));
            ws.once("close", this.onWebsocketClosed.bind(this, ids, ws));
        });
    }



    public stop() {
        try {
            this.wss.close();
            this.listening = true;
        } catch (err) {
            this._logger.error("MockWsServer.stop, error while closing server: ", err);
        }
    }
    public sendMockResponse(
        originalMessage: any, // the request information
        action: MockResponse,// the response dictated by the chosen step 
        session: MockServerIds) {
        let ws = this._socketMap[session.socketId];
        if (!ws) {
            this._logger.error("can't find a socket for session: %s, check scenario validity / disconnections.", session.socketId);
        }
        else {
            ws.send(JSON.stringify(action.body));
        }
    }

    private onWebsocketMessage(session: MockServerIds, ws: WebSocket, message: any) {
        this.emit("incoming", session, JSON.parse(message));
    }
    /**
     * web socket error handler
     */
    private onWebsocketError(session: MockServerIds, ws, err) {
        this._logger.error("onWebsocketError ", "websocket errored:", err);
        delete this._socketMap[session.socketId];
        ws.close(1006); // 1006 - CLOSE_ABNORMAL
    }

    /**
     * web socket close handler
     */
    private onWebsocketClosed(session: MockServerIds, ws) {
        this._logger.info("onWebsocketClosed ", "websocket closed:", session.socketId);
        delete this._socketMap[session.socketId];
    }
}