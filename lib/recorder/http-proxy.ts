import http = require("http");
import httpProxy = require("http-proxy");
import {EventEmitter} from "events";
import {HttpUtils} from "../http-utils";



export class HttpProxy extends EventEmitter {
    private _server: http.Server;
    constructor(private _target, sessionFieldOrFunction?: string | ((req) => string)) {
        super();

        var proxy = httpProxy.createProxyServer();
        proxy.on("proxyReq", (proxyReq, req, res, options) => {
            this.emit("incoming", req);
        });

        proxy.on("proxyRes", (proxyRes, req: http.IncomingMessage, res: http.ServerResponse) => {
            let sessionId = "httpSession";// shortid.generate();
            if (sessionFieldOrFunction) {
                if (typeof sessionFieldOrFunction === "string") {
                    sessionId = HttpUtils.getHttpSessionId(req, sessionFieldOrFunction);
                }
                else {
                    sessionId = (<((req) => string)>sessionFieldOrFunction)(req);
                }
            }
            this.emit("outgoing", proxyRes, req, sessionId);
        });

        this._server = http.createServer((req, res) => {
            proxy.web(req, res, {
                target: this._target
            });
        });
    }

    public start(port: number) {
        this._server.listen(port);
    }
    public stop() {
        this._server.close();
    }
}