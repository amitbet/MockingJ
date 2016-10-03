import http = require('http');
import httpProxy = require('http-proxy');
import {EventEmitter} from 'events';
var shortid = require("shortid");

export class HttpProxy extends EventEmitter {
    private _server: http.Server;
    constructor(private _target) {
        super();

        var proxy = httpProxy.createProxyServer();
        proxy.on('proxyReq', (proxyReq, req, res, options) => {
            this.emit('incoming', req);
        });

        proxy.on('proxyRes', (proxyRes, req: http.IncomingMessage, res: http.ServerResponse) => {
            //TODO: session extraction (find a real session)
            let sessionId = shortid.generate();
            this.emit('outgoing', proxyRes, req, sessionId);
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