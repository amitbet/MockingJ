import _ = require("lodash");
import {StepLexicon} from "./step-lexicon";
import fs = require("fs");
import {MockStep} from "./mock-step";

export interface Scenario {
    steps: Array<string>;//array of step names
    fallbackSteps: Array<string>;
    weight: number;
    id: string;
}

export class ScenarioRepo {
    //private stepPool: {};
    private _scenarios: Array<Scenario> = [];
    private _nameMap: _.Dictionary<Scenario> = {};
    private _lottery: _.Dictionary<Scenario> = {};
    private _maxLotteryTicket = 0;
    private _stepLex: StepLexicon = new StepLexicon();

    constructor(private _logger) {
    }

    public toJson(): string {
        var poolStr = this._stepLex.toJson();
        var retVal = {
            "stepPool": JSON.parse(poolStr),
            "scenarios": this._scenarios
        }
        return JSON.stringify(retVal, null, 2);
    }

    public fromJson(json: string) {
        var obj = JSON.parse(json);
        this._stepLex.fromJson(JSON.stringify(obj.stepPool));
        this._scenarios = obj.scenarios;
    }

    public addScenarios(scArr: Array<Scenario>) {
        for (var i = 0; i < scArr.length; i++) {
            this.addScenario(scArr[i]);
        }
    }

    public loadDataFile(mockDataFile: string) {
        fs.readFile(mockDataFile, "utf8", (err, data) => {
            if (err) throw err;
            var obj = JSON.parse(data);
            this._stepLex.addSteps(obj.stepPool);
            this.addScenarios(obj.scenarios);
        });
    }

    public addScenario(sc: Scenario) {
        sc.weight = sc.weight || 0;
        // sc.type = sc.type || "serial";
        this._scenarios.push(sc);
        this._nameMap[sc.id] = sc;
        this._maxLotteryTicket += sc.weight;
        this._lottery[this._maxLotteryTicket] = sc;
    }

    public addStep(scenarioId: string, step: MockStep) {
        this._stepLex.addOrUpdateStep(step);
    }

    /**
     * conducts a weighted lottery between all scenarios in the repo, and chooses one
     */
    public getRandomScenarioByWeight(): Scenario {
        var retval: Scenario = null;
        var winningTicket = Math.floor(Math.random() * this._maxLotteryTicket);
        _.forOwn(this._lottery, (val, key) => {
            let num = _.toNumber(key);
            if (winningTicket <= num) {
                retval = this._lottery[key];
                return retval;
            }
        })
        return retval;
    }

    /**
     * returns a step by the given scenario and step index
     * all resolution and cloning routines are run on the possible step responses before returning it.
     */
    public getStepByNumber(scenarioName: string, stepIndex: number, request: any): MockStep {
        if (!scenarioName)
            this._logger.error("ScenarioRepo.getStepByNumber: scenarioId should be defined");

        if (!stepIndex && stepIndex != 0) {
            this._logger.warn("ScenarioRepo.getStepByNumber: stepIndex not defined, will try to use fallback");
        }

        var scenario: Scenario = this._nameMap[scenarioName];
        var stepId = scenario.steps[stepIndex];
        var step = this._stepLex.getStepByName(stepId, request);
        if (!step) {
            // step was not a match or no such step exists, try fallback steps
            _.forEach(scenario.fallbackSteps, (fStepId: string, key: string) => {
                let fStep: MockStep = this._stepLex.getStepByName(fStepId, request);
                //if this step was a match return it.
                if (fStep) {
                    step = fStep;
                    step.isFallback = true;
                    return false;
                }
            });
        }
        return step;
    }
}
