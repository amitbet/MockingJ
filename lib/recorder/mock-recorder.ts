import {WsProxy} from './ws-proxy';
import {HttpProxy} from './http-proxy';
import qs = require('querystring');
import {ScenarioRepo} from '../scenario-repo';
import {SimpleLogger} from "../simple-logger";

export interface MockRecorderConfiguration {
    wsProxyPort?: number;
    httpProxyPort?: number;
    wsProxyTarget?: string;
    httpProxyTarget?: string;
    listeners: "ws" | "http" | "both";
}

// interface httpMessageDesc {
//     method: string,
//     url: string,
//     headers: Array<Object>,
//     body?: string
// }

export class MockRecorder {
    private _wsProxy: WsProxy;
    private _httpProxy: HttpProxy;
    private _scenarioRepo;

    constructor(private _configObj: MockRecorderConfiguration, private _logger) {
    }


    public start() {
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
        }
    }

    private processHttpResponse(res: any, callback: (res: any) => void): any {
        var descObj: any = {
            status: res.statusCode,
            headers: res.headers,
            reqUrl: res.req.path,
            time: new Date()
        };
        var body = '';

        // console.log('STATUS: ' + res.statusCode);
        // console.log('HEADERS: ' + JSON.stringify(res.headers));
        //res.setEncoding('utf8');
        res.on('data', (chunk) => {
            body += chunk;
        });

        res.on('end', function () {
            descObj.body = body;
            callback(descObj);
        });
    }

    private processHttpRequest(httpMessage: any, callback: (res: any) => void) {
        var descObj: any = {
            method: httpMessage.method,
            url: httpMessage.url,
            headers: httpMessage.headers,
            time: new Date()
        };
        var bodyObj;
        if (httpMessage.method == 'POST' || httpMessage.method == 'PUT') {
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
                bodyObj = qs.parse(body);
                callback(descObj);
                // console.log(JSON.stringify(descObj));
                // use POST
            });
            descObj.body = bodyObj;
        }
        else {
            callback(descObj);
            // console.log(JSON.stringify(descObj));
        }
    }
    private handleIncomingHttp(req) {
        this.processHttpRequest(req, (info) => {
            console.log("in: ", JSON.stringify(info));
        });
    }
    private handleOutgoingHttp(res) {
        this.processHttpResponse(res, (info) => {
            console.log("out: ", JSON.stringify(info));
        });
    }
    private handleIncomingWs(req) {
        console.log(req);
    }
    private handleOutgoingWs(res) {
        console.log(res);
    }

    private createHttpListener() {
        this._httpProxy = new HttpProxy(this._configObj.httpProxyTarget);
        this._httpProxy.start(this._configObj.httpProxyPort);
        this._httpProxy.on('incoming', this.handleIncomingHttp.bind(this));
        this._httpProxy.on('outgoing', this.handleOutgoingHttp.bind(this));
    };
    private createWsListener() {
        this._wsProxy = new WsProxy(this._configObj.wsProxyTarget);
        this._wsProxy.start(this._configObj.wsProxyPort);
        this._wsProxy.on('incoming', this.handleIncomingWs.bind(this));
        this._wsProxy.on('outgoing', this.handleOutgoingWs.bind(this));
    };
    private removeHttpListener() {
        this._httpProxy.removeListener('incoming', this.handleIncomingHttp);
        this._httpProxy.removeListener('outgoing', this.handleOutgoingHttp);
        this._httpProxy.stop();
        this._httpProxy = null;
    }
    private removeWsListener() {
        this._wsProxy.removeListener('incoming', this.handleIncomingWs);
        this._wsProxy.removeListener('outgoing', this.handleOutgoingWs);
        this._wsProxy.stop();
        this._wsProxy = null;
    }
}

// --test main--
var logger = new SimpleLogger();
var mr = new MockRecorder({
    wsProxyPort: 9000,
    httpProxyPort: 8000,
    wsProxyTarget: "ws://localhost:8044",
    httpProxyTarget: "http://localhost:8045",
    listeners: "both"
}, logger);