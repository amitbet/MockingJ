import {ILogger} from "../simple-logger";
import Q = require("q");
import Amqp = require("amqplib");
import UrlUtil = require("url");
import {EventEmitter} from "events";

const CONNECTION_RETRY: number = 5 * 1000;

export class AmqpUtil {
    public static extractMessageContent(amqpMsg: Amqp.Message, logger: ILogger): any {
        if (!amqpMsg || !amqpMsg.content) {
            logger.error("QueueHelper.extractMessageContent: unexpected message data received:", amqpMsg);
            return undefined;
        }

        let content = new Buffer(amqpMsg.content).toString("utf-8");
        try {
            return JSON.parse(content);
        }
        catch (e) {
            logger.error("QueueHelper.extractMessageContent: unexpected content received in message:", content);
            return undefined;
        }
    }
}

export class AmqpConnectionHelper {
    private _channel: Amqp.Channel;
    private _queueUrl: string;
    private _connection: Amqp.Connection;
    private _eventEmitter: EventEmitter;

    constructor(private _name: string, hostname: string, port: string, private _logger: ILogger) {
        this._logger.trace("AmqpConnectionHelper[", this._name, "].c'tor: start");
        this._queueUrl = UrlUtil.format({
            host: hostname,
            port: port,
            protocol: "amqp"
        });

        this._eventEmitter = new EventEmitter();
    }

    public get isConnected(): boolean {
        return !!this._connection;
    }

    public connect(): Q.Promise<Amqp.Channel> {
        this._logger.trace("AmqpConnectionHelper[", this._name, "].connect: called");
        return this._initQueueConnection(this._queueUrl);
    }

    public disconnect(): Q.Promise<void> {
        this._logger.trace("AmqpConnectionHelper[", this._name, "].disconnect: called");
        if (!this._connection) {
            this._logger.warn("AmqpConnectionHelper[", this._name, "].disconnect: Not connected. Returning.");
            return Q.when();
        }

        this._connection.removeAllListeners(); // Avoid attempting to reconnect by removing all current listeners on close/error and emit disconnection event ourselves
        return Q(this._connection.close()).then<void>(() => {
            this._logger.trace("AmqpConnectionHelper[", this._name, "].disconnect: completed");
        }).catch(err => {
            this._logger.error("AmqpConnectionHelper[", this._name, "].disconnect: failed to close connection. forcing delete of connection object. Error:", err);
            return Q.reject<void>(err);
        }).finally(() => {
            this._connection = undefined;
            this._eventEmitter.emit("disconnect");
        });
    }

    public onReconnect(connectionHandler: (channel: Amqp.Channel) => void) {
        this._logger.trace("AmqpConnectionHelper[", this._name, "].onConnect: registring a new handler");
        this._eventEmitter.on("reconnect", connectionHandler);
    }

    public onDisconnect(disconnectHandler: (err: Error) => void) {
        this._logger.trace("AmqpConnectionHelper[", this._name, "].onConnect: registring a new handler");
        this._eventEmitter.on("disconnect", disconnectHandler);
    }

    private _connectToQueue(url: string): Q.Promise<Amqp.Connection> {
        this._logger.debug("AmqpConnectionHelper[", this._name, "]._connectToQueue: connecting to queue:", url);
        return Q(Amqp.connect(url))
            .catch((err: Error) => {
                this._logger.error("AmqpConnectionHelper[", this._name, "]._connectToQueue: failed to connect to queue", url, ". RETRYING. Error:", err.message);
                return Q.delay(CONNECTION_RETRY).then(() => this._connectToQueue(url));
            });
    }

    private _initQueueConnection(url: string): Q.Promise<Amqp.Channel> {
        this._logger.trace("AmqpConnectionHelper[", this._name, "]._initQueueConnection: initializing queue:", url);
        let connection: Amqp.Connection;
        return this._connectToQueue(url)
            .then(conn => {
                this._logger.info("AmqpConnectionHelper[", this._name, "]._initQueueConnection: connection established to queue:", url);
                connection = conn;
                connection.on("error", err => this._onConnectionError(err));
                connection.on("closed", () => this._onConnectionClosed());
                return connection.createChannel();
            }).then(channel => {
                this._connection = connection;
                this._channel = channel;
                return channel;
            });
    }

    private _onConnectionError(err: Error) {
        this._logger.warn("AmqpConnectionHelper[", this._name, "]._onConnectionError: connection dropped because of an error:", err);
        this._handleAbnormalDisconnection();
    }

    private _onConnectionClosed() {
        this._logger.warn("AmqpConnectionHelper[", this._name, "]._onConnectionClosed: connection closed");
        this._handleAbnormalDisconnection();
    }

    private _handleAbnormalDisconnection() {
        this._logger.trace("AmqpConnectionHelper[", this._name, "]._handleAbnormalDisconnection: called");
        this._connection = undefined;
        this._eventEmitter.emit("disconnect");
        this._initQueueConnection(this._queueUrl).then(channel => {
            this._logger.trace("AmqpConnectionHelper[", this._name, "]._handleAbnormalDisconnection: reconnected successfully");
            this._eventEmitter.emit("reconnect", channel);
        });
    }
}