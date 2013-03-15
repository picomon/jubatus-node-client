/*jslint node: true */

var api = require('./api'),
    rpc = require('./lib/msgpack-rpc');

var isDebugEnabled = process.env.NODE_DEBUG && (/jubatus/).test(process.env.NODE_DEBUG),
    debug = isDebugEnabled ? function (x) { console.error('JUBATUS:', x); } : function () {};

function toArray(args) {
    return Array.prototype.slice.call(args);
}

function createConstructor(className) {
    var constructor = function (portNumber, hostName) {
        if (!(this instanceof constructor)) {
            throw new Error(className + ' is constructor.');
        }

        var port = portNumber || 9199,
            host = hostName || 'localhost',
            client = rpc.createClient(port, host),
            propertyName;
        for (propertyName in this) {
            /*jslint forin: true */
            debug(propertyName);
            client[propertyName] = this[propertyName];
        }
        return client;
    };

    constructor.prototype.get_client = function () {
        return this;
    };

    api[className].methods.forEach(function (method) {
        debug(method);
        var methodName = method.name || method;
        constructor.prototype[methodName] = function () {
            var params = toArray(arguments),
                hasCallback = (typeof params[params.length - 1] === 'function'),
                callback = hasCallback ? params.pop() : undefined;
            this.call(methodName, params, function (error, result, msgid) {
                callback(error && new Error(error.message || error), result, msgid);
            });
        };
    });
    return constructor;
}

Object.keys(api).forEach(function (className) {
    var client = {};
    client[className] = createConstructor(className);
    module.exports[className.toLowerCase()] = { client: client };
});
