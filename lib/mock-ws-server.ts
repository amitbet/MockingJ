import * as WebSocket from "ws";
import Uuid = require("node-uuid");
import _ = require("lodash");
import {MockResponse} from "./mock-step";
import {EventEmitter} from "events";
import {MockServerIds, MockListener, MockResponder} from "./mock-service";

export class MockWsServer extends EventEmitter implements MockListener, MockResponder {
    private wss: WebSocket.Server;

    public listening: boolean;

    private _socketMap: _.Dictionary<WebSocket> = {};

    private configObj: any;

    constructor(private _logger) {
        super();
    }

    public start(port: number, host?: string) {
        // create ws server
        let options: WebSocket.IServerOptions = {};
        options.port = port;
        try {
            this.wss = new WebSocket.Server(options);
            this.listening = true;
        } catch (err) {
            this._logger.error("MockWsServer.start, error while starting server: ", err);
        }

        this.wss.on("connection", (ws: WebSocket) => {
            let ids: MockServerIds = { sessionId: Uuid.v4(), socketId: "" };

            // since this is a websocket, we assume (for now) that the socket will last the whole session
            ids.socketId = ids.sessionId;
            this._socketMap[ids.socketId] = ws;

            ws.on("message", this.onWebsocketMessage.bind(this, ids, ws));
            ws.once("error", this.onWebsocketError.bind(this, ids, ws));
            ws.once("close", this.onWebsocketClosed.bind(this, ids, ws));
        });
    }

    private onWebsocketMessage(session: MockServerIds, ws: WebSocket, message: any) {
        this.emit('incoming', session, JSON.parse(message));
    }

    public stop() {
        try {
            this.wss.close();
            this.listening = true;
        } catch (err) {
            this._logger.error("MockWsServer.stop, error while closing server: ", err);
        }
    }
    public sendMockResponse(originalMessage: any, // the request information
        action: MockResponse, // the response dictated by the chosen step
        session: MockServerIds) {
        let ws = this._socketMap[session.socketId];
        ws.send(JSON.stringify(action));
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