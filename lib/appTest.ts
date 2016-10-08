import {MockService} from "./mock-service";
import {MockWsServer} from "./mock-ws-server";
import {MockHttpServer, MockHttpClient} from "./mock-http-server";

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
// var mockSvc = new MockService(["./scenarios/wsScenario.json"], [], [], logger);
// var mockSvc = new MockService(["./scenarios/httpScenario.json"], logger);
// var mockSvc = new MockService(["./scenarios/remoteAgentScenario.json"], logger);

var wsSrv = new MockWsServer(8044, logger);
var httpSrv = new MockHttpServer(8046, logger);
var httpClnt = new MockHttpClient(logger);
// var mockSvc = new MockService("./scenarios/wsScenario.json", [httpClnt, wsSrv, httpSrv], [wsSrv, httpSrv], logger);
var mockSvc = new MockService("./scenarios/httpScenario.json", [httpClnt, wsSrv, httpSrv], [wsSrv, httpSrv], logger);

mockSvc.start();

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
