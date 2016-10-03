import * as WebSocket from "ws";
import Uuid = require("node-uuid");
import _ = require("lodash");
import {MockResponse} from "./mock-step";
import {EventEmitter} from "events";
import {MockServerSession, MockListener, MockResponder} from "./mock-service";

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
            let session: MockServerSession = { id: Uuid.v4() };
            session.id = Uuid.v4();
            this._socketMap[session.id] = ws;

            ws.on("message", this.onWebsocketMessage.bind(this, session, ws));
            ws.once("error", this.onWebsocketError.bind(this, session, ws));
            ws.once("close", this.onWebsocketClosed.bind(this, session, ws));
        });
    }

    private onWebsocketMessage(session: MockServerSession, ws: WebSocket, message: any) {
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
        action: MockResponse, // the response dictated be the chosen step
        session: MockServerSession) {
        let ws = this._socketMap[session.id];
        ws.send(JSON.stringify(action));
    }

    /**
     * web socket error handler
     */
    private onWebsocketError(session: MockServerSession, ws, err) {
        this._logger.error("onWebsocketError ", "websocket errored:", err);
        delete this._socketMap[session.id];
        ws.close(1006); // 1006 - CLOSE_ABNORMAL
    }
    /**
     * web socket close handler
     */
    private onWebsocketClosed(session: MockServerSession, ws) {
        this._logger.info("onWebsocketClosed ", "websocket closed:", session.id);
        delete this._socketMap[session.id];
    }
}