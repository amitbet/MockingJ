import { SimpleLogger } from "./simple-logger";
import { MockRecorder } from "./recorder/mock-recorder";

// --test main--
var logger = new SimpleLogger();
var mr = new MockRecorder({
    wsProxyPort: 9000,
    httpProxyPort: 8000,
    wsProxyTarget: "ws://localhost:8044",
    httpProxyTarget: "http://localhost:8045",
    listeners: "both",
    matchWsField: "uid",
    mirrorFields: ["uid", "data.data.sessionId", "data.data.sessionInfo.PackageManagerAddress"],
    largeFields: ["fromFile", "data.data.AdditionalInfo.ReportEventData.SnapshotBitmapRef"]
}, logger);

mr.start("./scenarioRecording.json");