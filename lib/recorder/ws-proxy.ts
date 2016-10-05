import ws = require("ws");
import {EventEmitter} from "events";
var WebSocketServer = ws.Server;
var shortid = require("shortid");

export class WsProxy extends EventEmitter {
    private server;

    constructor(private _target) {
        super();

        if (!this._target) {
            throw new TypeError("No target given");
        }

        this.server = null;
    }

    public start(port: number, host?: string) {

        function listening() {
            this.emit("listening");
        }

        if (typeof arguments[arguments.length - 1] === "function") {
            this.on("listening", arguments[arguments.length - 1]);
        }

        if (this.server) {
            throw new Error("Already running");
        }

        var serverConfig: ws.IServerOptions = {};
        serverConfig.port = port;
        if (host)
            serverConfig.host = host;

        this.server = new WebSocketServer(serverConfig, listening);

        this.server.on("connection", (incoming) => {
            let sessionId = shortid.generate();
            let outgoing = new ws(this._target),
                open = false,
                queue = [];

            outgoing.on("open", () => {
                open = true;
                let item;
                while (item = queue.shift()) {
                    outgoing.send(item);
                }
            });

            incoming.on("message", (msg) => {
                this.emit("incoming", JSON.parse(msg), sessionId);
                open ? outgoing.send(msg) : queue.push(msg);
            });

            outgoing.on("message", (msg) => {
                this.emit("outgoing", JSON.parse(msg), sessionId);
                incoming.send(msg);
            });
        });
    }

    public stop() {
        if (!this.server) {
            throw new Error("Not running");
        }
        this.emit("closing");
        this.server.close();
        this.server = null;
    };
}