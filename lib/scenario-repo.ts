import _ = require("lodash");
import { StepLexicon } from "./step-lexicon";
import fs = require("fs");
import path = require("path");
import { MockStep } from "./mock-step";

export interface Scenario {
    steps: Array<string>;// array of step names
    fallbackSteps: Array<string>;
    initialSteps?: Array<string>;// will be run when scenario is first added (before accepting any messages for this scenario).
    closeSteps?: Array<string>;// will be performed on scenario/session end
    intervalSteps?: _.Dictionary<number>; // {stepName, interval} dictionary
    id: string;
}

export interface ScenarioStep {
    step: MockStep;
    isFallback: boolean;
}

export class ScenarioRepo {
    private _scenarios: Array<Scenario> = [];
    private _nameMap: _.Dictionary<Scenario> = {};
    private _stepLex: StepLexicon;
    private _dataFilePath: string = "";

    constructor(private _logger) {
        this._stepLex = new StepLexicon(this._logger);
    }

    public toJson(): string {
        var poolStr = this._stepLex.toJson();
        var retVal = {
            "stepPool": JSON.parse(poolStr),
            "scenarios": this._scenarios
        };
        return JSON.stringify(retVal, null, 2);
    }

    // public fromJson(json: string) {
    //     var obj = JSON.parse(json);
    //     this._stepLex.fromJson(JSON.stringify(obj.stepPool));
    //     this._scenarios = obj.scenarios;
    // }

    public addScenarios(scArr: Array<Scenario>) {
        for (var i = 0; i < scArr.length; i++) {
            this.addScenario(scArr[i]);
        }
    }

    public loadDataFile(mockDataFile: string, callback: Function) {
        this._dataFilePath = path.dirname(mockDataFile);
        this._stepLex.setScriptWorkingDir(this._dataFilePath);

        fs.readFile(mockDataFile, "utf8", (err, data) => {
            if (err) throw err;
            var obj = JSON.parse(data);
            this._stepLex.addSteps(obj.stepPool);
            this.addScenarios(obj.scenarios);
            callback();
        });
    }

    public addScenario(sc: Scenario) {
        this._scenarios.push(sc);
        this._nameMap[sc.id] = sc;
    }

    public addStep(scenarioId: string, step: MockStep, isFallback = false) {
        this._stepLex.addOrUpdateStep(step);
        let existingScenario = this._nameMap[scenarioId];
        if (!existingScenario) {
            let sc: Scenario = {
                steps: [],// array of step names
                fallbackSteps: [],
                id: scenarioId
            };
            this.addScenario(sc);
            existingScenario = sc;
        }
        if (isFallback)
            existingScenario.fallbackSteps.push(step.id);
        else
            existingScenario.steps.push(step.id);


    }

    /**
     * finds all matching scenarios and chooses one in random
     */
    public getRandomScenarioForType(type: string): Scenario {
        let scenarios: Array<Scenario> = [];
        _.each(this._scenarios, sc => {
            let types = this.calculateTypesForScenario(sc);
            if (_.includes(types, type)) {
                scenarios.push(sc);
            }
        });

        if (scenarios.length === 0) {
            return null;
        }

        let choice = Math.round(Math.random() * (scenarios.length - 1));
        return scenarios[choice];
    }
    /**
     * finds all matching scenarios for given request and chooses one in random
     */
    public getRandomScenarioForRequest(request: any, type: string): Scenario {
        let scenarios: Array<Scenario> = [];
        _.each(this._scenarios, sc => {
            if (this.isMatchScenario(sc, request, type)) {
                scenarios.push(sc);
            }
        });

        if (scenarios.length === 0) {
            return null;
        }

        let choice = Math.round(Math.random() * (scenarios.length - 1));
        return scenarios[choice];
    }

    /**
     * gets all initial steps that should be performed for this repo on service start.
     */
    public getAllInitialSteps(): Array<MockStep> {
        let allSteps: Array<MockStep> = [];
        _.forEach(this._scenarios, scenario => {
            allSteps = allSteps.concat(this.getInitialStepsForScenario(scenario.id));
        });
        return allSteps;
    }


    /**
     * returns a step by the given scenario and step index
     * all resolution and cloning routines are run on the possible step responses before returning it.
     */
    public getStepByNumber(scenarioId: string, stepIndex: number, request: any): ScenarioStep {
        if (!scenarioId)
            this._logger.error("ScenarioRepo.getStepByNumber: scenarioId should be defined");
        let isFallback = false;

        if (!stepIndex && stepIndex !== 0) {
            this._logger.warn("ScenarioRepo.getStepByNumber: stepIndex not defined, will try to use fallback");
        }

        var scenario: Scenario = this._nameMap[scenarioId];
        var stepId = scenario.steps[stepIndex];
        var step = this._stepLex.getStepByName(stepId, request);
        if (!step) {
            // step was not a match or no such step exists, try fallback steps
            _.forEach(scenario.fallbackSteps, (fStepId: string, key: string) => {
                let fStep: MockStep = this._stepLex.getStepByName(fStepId, request);
                // if this step was a match return it.
                if (fStep) {
                    step = fStep;
                    isFallback = true;
                    return false;
                }
            });
        }

        let retVal: ScenarioStep = { step: step, isFallback: isFallback };
        return retVal;
    }

    /**
     * get all initial steps for the given scenario
     */
    private getInitialStepsForScenario(scenarioId: string): Array<MockStep> {
        if (!scenarioId)
            this._logger.error("ScenarioRepo.getStepByNumber: scenarioId should be defined");
        var scenario: Scenario = this._nameMap[scenarioId];
        var steps: Array<MockStep> = [];
        if (!scenario || !scenario.initialSteps) {
            steps = [];
        }

        _.forEach(scenario.initialSteps, (iStepId: string, key: string) => {
            let iStep: MockStep = this._stepLex.getStepByName(iStepId);
            if (iStep) {
                steps.push(iStep);
            }
        });

        return steps;
    }

    private isMatchScenario(scenario: Scenario, request: any, type: string): boolean {
        let step: MockStep;
        let retval: boolean = false;
        if (scenario.steps.length > 0) {
            step = this._stepLex.getStepByName(scenario.steps[0], null, false);
            retval = this._stepLex.isMatch(step, request, type);
        }
        if (!retval)
            _.each(scenario.fallbackSteps, fstep => {
                step = this._stepLex.getStepByName(fstep, null, false);
                let match = this._stepLex.isMatch(step, request, type);

                if (match)
                    retval = true;
            });

        return retval;
    }

    private calculateTypesForScenario(scenario: Scenario): Array<string> {
        let types: Array<string> = [];
        let type: string;

        if (scenario.steps.length > 0) {
            type = this._stepLex.getStepByName(scenario.steps[0], null, false).type;
            types.push(type);
        }

        _.each(scenario.fallbackSteps, fstep => {
            type = this._stepLex.getStepByName(fstep, null, false).type;
            types.push(type);
        });

        return _.uniq(types);
    }

}

