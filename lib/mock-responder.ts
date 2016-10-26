import { MockResponse } from "./mock-step";
import { MockServerIds } from "./mock-service";
/**
 * Any protocol "client" that can handle sending responses in a given protocol (can be either server or client, just that it handles outgoing traffic)
 * http server, http client (for new outgoing requests) & ws server should all implement this + register as responder for httpRes / HttpReq / ws actions (respectively).
 */
export interface MockResponder {
    type: string;
    sendMockResponse(originalMessage: any, // the request information
        action: MockResponse, // the response dictated by the chosen step
        session: MockServerIds); // the session created by the listener, holding scenario & step info updated by the MockFramework
}