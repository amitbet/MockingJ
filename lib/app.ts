import {MockService} from "./mock-service";
import {MockWsServer} from "./mock-ws-server";
import {MockHttpServer} from "./mock-http-server";

import {SimpleLogger} from "./simple-logger";
import fs = require("fs");
import http = require("http");
import {ScenarioRepo} from "./scenario-repo";

var logger = new SimpleLogger();


// -- tests scenario repo toJson routine --
var repo: ScenarioRepo = new ScenarioRepo(logger);
var repoData = fs.readFileSync("./scenarios/wsScenario.json", "utf8");
repo.fromJson(repoData);

var repoJson = repo.toJson();
fs.writeFileSync("./scenarios/test.json", repoJson);


// -- run a MockService instance
var mockSvc = new MockService(["./scenarios/wsScenario.json"], logger);
// var mockSvc = new MockService(["./scenarios/httpScenario.json"], logger);

var wsSrv = new MockWsServer(logger);
mockSvc.registerListener(wsSrv, "ws");
mockSvc.registerResponder(wsSrv, "ws");
wsSrv.start(8044);
var httpSrv = new MockHttpServer(logger);
mockSvc.registerListener(httpSrv, "http");
mockSvc.registerResponder(httpSrv, "http");
httpSrv.start(8046);

// ------static http for testing against ------

// We need a function which handles requests and send response

// Create and start the http server
var server = http.createServer((request, response) => {
    response.end("It Works!! Path Hit: " + request.url);
});
server.listen(8045, function () {
    // Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", 8045);
});
