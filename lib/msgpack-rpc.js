var msgpack = require('msgpack-js'),
    Stream = require('msgpack').Stream,
    assert = require('assert'),
    net = require('net'),
    events = require('events'),
    util = require('util');

var isDebugEnabled = (process.env.NODE_DEBUG && /msgpack-rpc/.test(process.env.NODE_DEBUG)),
    debug = isDebugEnabled ? function (x) { console.error('MSGPACK-RPC:', x); } : function () {};

var msgidGenerator = (function () {
    var MAX = Math.pow(2, 32) - 1,
        msgid = 0;
    return {
        next: function () {
            return (msgid = (msgid < MAX ? msgid + 1 : 0));
        }
    };
}());

function Client(socket) {
    assert(socket instanceof net.Socket, 'Illegal argument');

    events.EventEmitter.call(this);

    var self = this,
        port = socket.remotePort,
        host = socket.remoteAddress,
        callbacks = {},
        receive = function receive(response) {
            if (isDebugEnabled) { debug('received message: ' + util.inspect(response, false, null, true)); }

            var type = response.shift(),
                msgid = response.shift(),
                error = response.shift(),
                result = response.shift(),
                callback = (callbacks[msgid] || function () {});
            callback.call(self, error, result, msgid);
            delete callbacks[msgid];
        },
        stream = new Stream(socket).on('msg', receive),
        send = function send(request) {
            var buf = msgpack.encode(request);
            return socket.write(buf, function () {
                if (isDebugEnabled) { debug('sent message: ' + util.inspect(request, false, null, true)); }
            });
        },
        ready = function ready() {
            if (self.closed) { throw new Error('closed'); }
            if (socket.destroyed) { socket.connect(port, host); }
        },
        socketEvents = [ 'connect', 'end', 'timeout', 'drain', 'error', 'close' ];

    socketEvents.forEach(function (eventName) {
        socket.on(eventName, function () {
            debug('socket event [' + eventName + ']');
            var args = [eventName].concat(Array.prototype.slice.call(arguments));
            self.emit.apply(self, args);
        });
    });
    socket.once('connect', function onConnect() {
        host = this.remoteAddress;
        port = this.remotePort;
    });
    debug({ socket: socket });

    this.closed = socket.destroyed;
    this.close = function close() {
        socket.end();
        this.closed = true;
    };
    this.call = function call(method, params, callback) {
        ready();
        var msgid = msgidGenerator.next(),
            request = [0, msgid, method, [].concat(params)];
        callbacks[msgid] = callback;
        send(request);
    };
    this.notify = function notify(method, params) {
        ready();
        send([2, method, params]);
    };
}

util.inherits(Client, events.EventEmitter);
exports.Client = Client;

exports.createClient = function createClient(port, host, timeout) {
    debug({ port: port, host: host, timeout: timeout });
    var socket = net.connect(port, host || 'localhost');
    socket.setTimeout(timeout || 0);
    return new Client(socket);
};

function Server(server) {
    assert(server instanceof net.Server, 'Illegal argument');

    events.EventEmitter.call(this);

    var self = this;

    server.on('connection', function onConnection(socket) {
        var stream = new Stream(socket).on('msg', function onMsg(request) {
                var type = request.shift(),
                    msgid = request.shift(),
                    method = request.shift(),
                    params = request.shift(),
                    callback = function (error, result) {
                        var response = [1, msgid, error, [].concat(result)],
                            buf = msgpack.encode(response);
                        socket.write(buf);
                    };
                self.emit(method, params, callback);
            });
    });
}

util.inherits(Server, events.EventEmitter);
exports.Server = Server;

