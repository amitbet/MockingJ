
export interface MockStep {
    requestConditions: any;// the conditions section is a json which should match the request exactly, missing lines will not be checked (so only lines that exist are required in the request) 
    delay?: number;// time to wait in millisecs before performing any actions
    type: "queue" | "ws" | "rest";// a protocol type so we know how to treat condition checking
    actions?: Array<MockResponse>;// actions are steps without conditions that should be performed when step is done (notice that a delay may be also included in each)
    id: string;
    isFallback?: boolean;
}

export interface MockResponse {
    response: any; // the response to send 
    delay?: number;// time to wait in millisecs before sending response
    type?: "queue" | "ws" | "rest", "runTask"; // response type indicates which protocol will be used to send this response if missing will be inharited from step
    name?: string;// an optional name, for logging & debugging
}