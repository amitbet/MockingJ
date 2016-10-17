

export interface ILogger {
    error(msg, ...optionalParams: any[]);
    warn(msg, ...optionalParams: any[]);
    debug(msg, ...optionalParams: any[]);
    info(msg, ...optionalParams: any[]);
    trace(msg, ...optionalParams: any[]);
}

export class SimpleLogger implements ILogger {
    public error(msg, ...optionalParams: any[]) {
        console.error.apply(this, [].concat("error: " + msg, optionalParams));
    }
    public warn(msg, ...optionalParams: any[]) {
        console.log.apply(this, [].concat("warn: " + msg, optionalParams));
    }
    public debug(msg, ...optionalParams: any[]) {
        console.log.apply(this, [].concat("debug: " + msg, optionalParams));
    }
    public info(msg, ...optionalParams: any[]) {
        console.log.apply(this, [].concat("info: " + msg, optionalParams));
    }
    public trace(msg, ...optionalParams: any[]) {
        console.log.apply(this, [].concat("trace: " + msg, optionalParams));
    }
}