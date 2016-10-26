// import * as http from "http";
// var shortid = require("shortid");
import _ = require("lodash");
import { MockResponse } from "../mock-step";
import { EventEmitter } from "events";
import { MockServerIds, MockListener } from "../mock-service";
import { MockResponder } from "../mock-responder";
import { ILogger, SimpleLogger } from "../simple-logger";
import Amqp = require("amqplib");
import Q = require("q");
import { AmqpConnectionHelper, AmqpUtil } from "./queue-helper";

export interface QueuePublishInfo {
    exchangeName: string;
    messageType: string;
}

export interface QueueConsumeInfo {
    exchangeName: string;
    queueName: string;
    pattern: string; // decides which messageTypes we will listen to, defult is empty string which means all.
}

/**
 * a queue client to be used in a microservices environment (uses exchanges, not simple queues due to the usual Scale & High availability requirements)
 */
export class MockQueueClient extends EventEmitter implements MockListener, MockResponder {
    public type: string;
    public port: number;

    private _consumeFromQueues: Array<QueueConsumeInfo> = [];
    private _publishToQueues: Array<QueuePublishInfo> = [];
    private _amqpChannel: Amqp.Channel;

    /**
     * creates a new queue client, can be a listener/resonder/both decided by the provided consumer/publisher info objects.
     * more publish/consume behaviours can be added later by using the add functions.
     */
    constructor(private _queueHost: string, private _queuePort: string, private _logger: ILogger, consumeInfo?: QueueConsumeInfo, publishInfo?: QueuePublishInfo) {
        super();
        if (consumeInfo) {
            this._consumeFromQueues.push(consumeInfo);
        }
        if (publishInfo) {
            this._publishToQueues.push(publishInfo);
        }
        if (!_logger)
            this._logger = new SimpleLogger();
    }


    /**
     * adds a new Exchange & Message-type to publish all messages sent from this MockResponder to queue
     */
    public addPublishing(publishInfo: QueuePublishInfo) {
        this._publishToQueues.push(publishInfo);
    }

    public start(): Q.Promise<void> {
        let helper: AmqpConnectionHelper = new AmqpConnectionHelper("MockQueueClient", this._queueHost, this._queuePort, this._logger);

        if (!this._amqpChannel) {
            helper.connect().then((channel) => {
                this._amqpChannel = channel;
                return Q.resolve<void>(undefined);
                // Q(this._amqpChannel.assertExchange(this._queueName, "direct", { durable: false })).thenResolve(undefined);
            });
        }
        else return Q.resolve<void>(undefined);
    }

    public stop() {
        if (this._amqpChannel)
            this._amqpChannel.close();
    }

    public sendMockResponse(
        originalMessage: any, // the request information
        action: MockResponse, // the response dictated by the chosen step
        session: MockServerIds) {
        _.each(this._publishToQueues, (queue) => {
            this._publishToExchange(queue.exchangeName, queue.messageType, action.body);
        });
    }

    /**
     * adds a listener for the given exchange & queue, filtering messages according to the pattern
     * for example:
     * exchangeName = "configuration"  ---> get configuration messages from that exchange
     * queueName = "queueForAllTestManagerInstances" ---> create/join a queue for all test manager instances (any message will only be handled by a single instance)
     * pattern = "TestManager" ---> listen only to messages of type TestManager, so you don't get JobManager configurations.
     */
    public addConsuming(info: QueueConsumeInfo): Q.Promise<void> {
        return Q(this._amqpChannel.assertExchange(info.exchangeName, "direct", { durable: false }))
            .then(() => {
                return this._amqpChannel.assertQueue(info.queueName, { exclusive: false });
            }).then((q: Amqp.Replies.AssertQueue) => {
                this._amqpChannel.bindQueue(q.queue, info.exchangeName, info.pattern);
                return this._amqpChannel.consume(q.queue, (msg: Amqp.Message) => this._consumeEventMessage(info.exchangeName, msg));
            }).then(() => {
                this._logger.info("MockQueueClient.addConsuming: connected successfully to queue");
            });
    }

    private _publishToExchange(queueName: string, messageType: string, msgObj: any): boolean {
        const methodName: string = "MockQueueClient._publishToExchange:";
        let msg = JSON.stringify(msgObj);
        this._logger.debug(methodName, "message will be published, queue name:", queueName, ", message type:", messageType, ", message content:", msg);
        let success = this._amqpChannel.publish(queueName, messageType, new Buffer(msg));
        if (success) {
            this._logger.trace(methodName, "message was published successfully");
        } else {
            this._logger.error(methodName, "failed to publish a message");
        }
        return success;
    }

    private _consumeEventMessage(exchangeName: string, amqpMsg: Amqp.Message) {
        this._logger.trace("MockQueueClient._consumeEventMessage: received request exchangeName:", exchangeName);

        let eventMsgContent = AmqpUtil.extractMessageContent(amqpMsg, this._logger);
        this.emit("incoming", eventMsgContent);
    }
}
