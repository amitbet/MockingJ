import _ = require("lodash");

export interface HttpMessageData {
    url?: string;
    method?: string;
    headers: _.Dictionary<any>;// { [key: string]: any }
    body: string;
    status?:number; // http status (e.g. 200)
}