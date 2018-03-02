# MockingJ - Microservice Mocking made simple
MockingJ is a new JSON based mock service framework intended to help in conducting API tests on microservice architectures

Its main goal is to allow the mocking of any protocol carrying a JSON payload.
Out of the box it supports:

* WebSockets
* Http (REST)
* RabbitMQ

It is also very easy to extend and requires only two simple interfaces for a new protocol implementation. (just one if no listener is needed)

## The Main concept:
A JSON script file represents the Steps and the scenarios is used to configure the mock service you are creating
This mock service, when run will try to answer any requests with matching responses by following several rules:

* A scenario will be chosen at the begining of a session, when the first message is received for this session.
* Each step has a set of conditions which are just JSON values you require to see in the request
* An incoming message will only be answered by the current step in the scenario if it matches the conditions, if it doesn't any *matching* fallback step will be chosen, if no step is found an error will be sent to the client.
* The scenario will be incremented only if a **scenario** step was performed (not a fallback step).
* A step my have more then one response (aka action), all actions will be performed on a chosen step.
* An action can be of any protocol type, so for example: a queue message can be sent as an answer for a received REST request, (while another action is used to send the regular rest response).

## Step & Action structure:
Below is a step definition, which is constructed out of a conditions section and an action array
* an action is a response that can be sent via a different protocol type than the recieved request, the 'type' can be specified on the action, if it isn't the step 'type' property is used.
* mutliple actions are allowed for any single request
* an action can be sent in delay, a 'delay' property exists on both step and action levels, action delay will be the addition of both, since step delay is applied to all actions, all delays are in miliesecs.
* a 'repetitions' property exists on the action to allow repeating the same action, delay will be run before each time **including** the first time.

```javascript
        {
            "id": "step1",
            "requestConditions": {
                "stam": "11",
                "a": "s1"
            },
            "actions": [
                {
                    "body": {
                        "uid": "{{req.uid}}",
                        "a": "good1"
                    },
                    "repetitions": 2,
                    "delay": 500
                }
            ],
            "delay": 30,
            "type": "ws"
        }
```

## Steps and Scenarios: 
All **Steps** are saved in the StepLexicon which is part of the ScenarioRepo, that holds all steps.
The ScenarioRepo also holds scenarios that hold two lists of steps:

1. Scenario steps, which should be run in order
2. Fallback steps, which can be used when the current step doesn't match the current request. and don't change the session's position in the script

When a request is sent into the MockService, a scenario is chosen and *several* steps are tested against it, until a match is found
the step's response messages are then sent to the respective responders by type.


# General usage:

## MockingJ Components:

* The MockService class - the registrator for Responders and Listeners, also handles the step & scenario management.
* Protocol Listeners - classes that register as listeners and create a server (independently), they pass messages to the framework by implementing an event
* Protocol Responders - classes that respond to messages by running the steps chosen by the MockingJ engine.
* The Recorder - composed of two proxies (Http & WS), the recorder captures passing messages (in both directions), and creates Steps in a ScenarioRepository, that is saved to disk.
* The ScenarioRepository is a class that saves all step & scenario data, its JSON form represents the entirity of the specific mock service configuration. this JSON is what you edit and tweak to get the result you desire.

## Starting up the service:
When running a mock Service, you should create a MockService instance, register & run listeners & responders like so:

```javascript
// create listeners & responders:
var wsSrv = new MockWsServer(8044, logger);
var httpSrv = new MockHttpServer(8046, logger);

// this is only a responder (sends http requests as initial step or in response to something else)
var httpClnt = new MockHttpClient(logger);

// register all responders and listeners
var mockSvc = new MockService("./scenarios/httpScenario.json", [httpClnt, wsSrv, httpSrv], [wsSrv, httpSrv], logger);

// performs all initial steps, start all listeners.
mockSvc.start();
```
## Using The Recorder:
To use the recorder you need to create it, give it a target (your real service url)
you also need the configure the real client to use the proxy, and after running a single flow trough the system - you will have a starting point for your new mock service written in the file provided to the start method (scenarioRecording.json here).
you can then start twaking & running the recorded JSON via the MockService class until you get the right result.

```javascript
var mr = new MockRecorder({
    wsProxyPort: 9000,
    httpProxyPort: 8000,
    wsProxyTarget: "ws://localhost:8044",
    httpProxyTarget: "http://localhost:8045",
    recordHttpHeaders: false,
    listeners: "both"
});

mr.start("./scenarioRecording.json");
```

# The finer details:

## Session identification:
A session is an Id that is decided by the Listener accepting the requests, in WS it is typically the socket, while in http it is typically an Id found on the header
This SessionId is used by the main engine (the MockService class) to decide whether to choose a new scenario, or to continue stepping trough an existing scenario.
http listener has an optional session extraction header/funtion available in the constructor.

## request/response matching (recorder):
During recording, some protocols (WS / Queue) need help with identifing the which response belongs to which request,
this can be done by default by time based algs which assume that all returning message intercepted answer the latest message recieved, until another request message replaces it as latest.
another method is usign a correlation Id in the message body (if such a properties exists) - this can be provided to the recorder on initialization.

## Calculations & request values in responses
code inside double curly brackets "{{}}" undergoes eval, with a req variable in the context, so any calculation or env/request parameter can be used.
for env variables use: process.env["varName"]

## Extending for new protocols:
The protocol types written in the step properties (for matching the requests), and in each step action are just strings that identify the correct responder to handle the delivery. 
These "type" strings are configurable and depend on the string you pass to the registerListener / registerResponder functions and to the values you pass when you create a step in the Listener.
This structure allows to extend and implement new protocols when needed.

## Configujration Json examples:
In the following example you can see a JSON that configures a service mock that includes ws requests and responses, where req-res bond identification is done by a "uid" number 
the uid of the response message is taken from the request.
conditions put on the step are concrete values for now, and are matched as is to the values in the request
if a value is not stated, it will not be checked (so an empty condition list accepts any message).
Regex or wildcards may be implemented in the future, if we see a need for them.

## inline code / parameters:
In order to allow for dynamic messages, auto generated content and ids taken from requests,
any js code inside double curly brackets '{{}}' will be evaluated and replaced with the returned result.
to make regular operations easier a utils object is provided with the following abilities:
* utils.faker: fake mock data in various formats [see faker npm package](https://www.npmjs.com/package/faker)
* utils.getNext('sequence name'): will return the next value for the given sequence
* utils.getEnv: will return the value of the given env variable
* utils.readFile: will read a file, and return it's content in utf8 while caching the content for next time.
* utils.readFileAsBase64: the same as readFile, just that it will encode the content in base64 (for binaries)
* utils.writeFile: will write given data to file
* in addition to standard JS operators, Math library functions will work as well.
 **all paths given will be relative to the location of the script json file.**

### examples:
```javascript
"uid": "{{req.uid}}" //get id from request and plant it in the response
"fromFile": "{{utils.readFileAsBase64('./img.png')}}" // read 'img.png' (in the same dir as the script.json file), and plant the base64 string as the value of the 'fromFile' propery in the response
"env": "{{utils.getEnv('path')}}" // get $(path) from env variable
"uuid": "{{utils.faker.random.uuid()}}" // generate a random uuid (GUID)
"randEmail": "{{utils.faker.internet.email()}}" // generate a random email
"randNum": "Math.random()*160000+5" // generate a random number in the range [5-160005]
"randNum":"{{utils.faker.random.number({min:5, max:160005})}}" // generate a random number in the range [5-160005] by using faker

```

### JSON Script example:
```javascript
{
    "stepPool": [
        {
            "id": "step1",
            "requestConditions": {
                "stam": "11",
                "a": "s1"
            },
            "actions": [
                {
                    "response": {
                        "uid": "{{req.uid}}",
                        "a": "good1"
                    }
                }
            ],
            "delay": 30,
            "type": "ws"
        },
        {
            "id": "fb1",
            "requestConditions": {},
            "actions": [
                {
                    "response": {
                        "uid": "{{req.uid}}",
                         "fromFile": "{{utils.readFileAsBase64('./img.png')}}",
                        "a": "good33"
                    }
                }
            ],
            "type": "ws"
        },
        {
            "id": "step2",
            "requestConditions": {
                "a": "s2"
            },
            "actions": [
                {
                    "response": {
                        "uid": "{{req.uid}}",
                        "a": "good2"
                    }
                },
                {
                    "response": {
                        "uid": "{{req.uid}}",
                        "b": "good3"
                    }
                }
            ],
            "delay": 30,
            "type": "ws"
        }
    ],
    "scenarios": [
        {
            "steps": [
                "step1",
                "step2"
            ],
            "fallbackSteps": [
                "fb1"
            ],
            "weight": 10,
            "id": "test1"
        }
    ]
}
```



## License:
MIT