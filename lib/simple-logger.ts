

export interface ILogger {
    error(msg, ...optionalParams: any[]);
    warn(msg, ...optionalParams: any[]);
    debug(msg, ...optionalParams: any[]);
    info(msg, ...optionalParams: any[]);
    trace(msg, ...optionalParams: any[]);
}

export class SimpleLogger implements ILogger {
    public error(msg, ...optionalParams: any[]) {
        console.error("error: " + msg, optionalParams);
    }
    public warn(msg, ...optionalParams: any[]) {
        console.log("warn: " + msg, optionalParams);
    }
    public debug(msg, ...optionalParams: any[]) {
        console.log("debug: " + msg, optionalParams);
    }
    public info(msg, ...optionalParams: any[]) {
        console.log("info: " + msg, optionalParams);
    }
    public trace(msg, ...optionalParams: any[]) {
        console.log("trace: " + msg, optionalParams);
    }
}