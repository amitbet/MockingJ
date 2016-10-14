
import {HttpMessageData} from "../http-message-data";

export class HttpUtils {
    public static isJsonStr(value: string, throwException: boolean = false): boolean {
        if (!value || (typeof value !== "string")) {
            return false;
        }
        if ((value.indexOf("{") === -1) && (value.indexOf("[") === -1)) {
            return false;
        }
        try {
            JSON.parse(value);
        } catch (e) {
            if (throwException) {
                throw e;
            }
            return false;
        }
        return true;
    }

    public static processHttpRequest(httpMessage: any, type: string, callback: (result: HttpMessageData) => void, recordHttpHeaders: boolean = false) {
        var descObj: HttpMessageData = {
            method: httpMessage.method,
            url: httpMessage.url,
            headers: [],
            body: null,
            type: type || "http"
        };

        if (recordHttpHeaders)
            descObj.headers = httpMessage.headers;

        var bodyObj;
        if (httpMessage.method === "POST" || httpMessage.method === "PUT" || httpMessage.method === "DEL") {
            httpMessage.setEncoding("utf8");
            var body = "";
            httpMessage.on("data", function (data) {
                body += data;
                // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
                // if (body.length > 1e6) {
                //     // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQUEST
                //     req.connection.destroy();
                // }
            });
            httpMessage.on("end", function () {
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


    public static processHttpResponse(res: any, type: string, callback: (result: HttpMessageData) => void) {
        var descObj: HttpMessageData = {
            status: res.statusCode,
            headers: res.headers,
            url: res.req.path,
            body: null,
            type: type || "http"
        };
        var body = "";

        // console.log('STATUS: ' + res.statusCode);
        // console.log('HEADERS: ' + JSON.stringify(res.headers));
        // res.setEncoding('utf8');
        res.on("data", (chunk) => {
            body += chunk;
        });

        res.on("end", function () {
            descObj.body = body;
            callback(descObj);
        });
    }

    public static getHttpSessionId(request: any, sessionIdfieldName: string): string {
        let sessionId = request.headers[sessionIdfieldName];

        if (!sessionId)
            throw new Error("HttpUtils.getHttpSessionId: no session id found in header: " + sessionIdfieldName);

        return sessionId;
    }
}