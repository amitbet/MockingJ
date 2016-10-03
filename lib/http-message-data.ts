import _ = require("lodash");

export interface HttpMessageData {
    url?: string;
    method?: string;
    headers: _.Dictionary<any>;//{ [key: string]: any }
    body: string;
    time: Date;
    status?:number; //http status (200)
}