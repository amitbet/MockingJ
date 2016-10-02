import {MockServer} from "./mock-server";
import {SimpleLogger} from "./simple-logger";
import fs = require("fs");
import http = require("http");
import {ScenarioRepo} from "./scenario-repo";



var logger = new SimpleLogger();


// -- tests scenario repo toJson routine --
var repo: ScenarioRepo = new ScenarioRepo(logger);
var repoData = fs.readFileSync("./scenarios/MockScenario1.json", "utf8");
repo.fromJson(repoData);

var repoJson = repo.toJson();
fs.writeFileSync("./scenarios/test.json", repoJson);


// -- ger config and run a MockServer instance
let configObj;
fs.readFile("./config/config.json", "utf8", (err, data) => {
    if (err) throw err;
    configObj = JSON.parse(data);
    new MockServer(8044, ["./scenarios/MockScenario1.json"], configObj, logger);
});



//------static http for testing against ------

//We need a function which handles requests and send response
function handleRequest(request, response) {
    response.end('It Works!! Path Hit: ' + request.url);
}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(8045, function () {
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", 8045);
});
