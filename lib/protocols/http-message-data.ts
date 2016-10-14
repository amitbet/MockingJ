import _ = require("lodash");
import {MockResponse} from "../mock-step";
export interface HttpMessageData extends MockResponse {
    url?: string;
    method?: string;
    headers: _.Dictionary<any>;// { [key: string]: any }
    status?:number; // http status (e.g. 200)
}