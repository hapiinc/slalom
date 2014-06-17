#!/usr/bin/env node

/**
 * Falsy Values: false, 0, "", null, undefined, NaN
 */

(function () {
    /**
     * Module dependencies.
     */
    var httpProxy = require('http-proxy'),
        repro = require('repro'),
        slop = require('slop'),
        http = require('http'),
        net = require('net'),
        uri = require('url');

    /**
     * Process.argv will be an array.
     * Array:
     *  1st element will be 'node'
     *  2nd element will be '/path/to/this/JavaScript/file'
     *  3rd - Nth elements will be additional command line arguments
     *
     * Introspect Node arguments vector for:
     * - optional port to begin accepting connections
     * - optional host to begin accepting connections
     * - optional interval for updating route table
     * - optional debug flag to turn on debug logging
     *
     * Options.get() values may yield:
     * - {undefined}
     * - {boolean} true
     * - {string} (non-empty)
     *
     * Options.has() values may yield:
     * - {boolean} true
     * - {boolean} false
     */
    var options = slop().parse(process.argv),
        port = options.get('port'),
        host = options.get('host'),
        interval = options.get('interval'),
        debug = options.has('debug');

    /**
     * Default values.
     */
    port = (typeof port === 'string' && Number(port) >= 0) ? port : '8080';
    host = (typeof host === 'string') ? host : '0.0.0.0';
    interval = (typeof interval === 'string' && Number(interval) >= 0) ? Number(interval) : 30000;

    if (debug) {
        console.log('------------------------------');
        console.log('Port:');
        console.log(port);
        console.log('Host:');
        console.log(host);
        console.log('Interval:');
        console.log(interval);
        console.log('------------------------------');
    }

    /**
     * Pull these out into a Docker Remote API Wrapper eventually, or a HAPI.
     * ----------------------------------------------------------------------------------------------------------------
     */

    var Docker = {
        /**
         * Create a container
         *
         * POST /containers/create
         * Create a container
         *
         * @param socketPath is the Docker Unix Domain Socket path.
         * @param config is the Docker Container's Configuration.
         * @param name is the Docker Container's name. It is optional, but if included, it must
         * match /?[a-zA-Z0-9_-]+.
         * @param callback is a Callback {Function} Object with an arity of one.
         * The argument of the Callback {Function} should be expecting a Container {Object} if successful, or
         * {null} if failure.
         */
        createContainer: function (socketPath, config, name, callback) {
            var queryString = typeof name === 'string' ? ('?name=' + name) : '',
                request =
                    http
                        .request({
                            method: 'POST',
                            path: '/containers/create' + queryString,
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            socketPath: socketPath
                        }, function (res) {
                            if (res.statusCode === 201) {
                                var container = '';
                                res
                                    .on('data', function (data) {
                                        container += data;
                                    })
                                    .on('end', function () {
                                        return callback(JSON.parse(container));
                                    });
                            } else {
                                return callback(null);
                            }
                        })
                        .on('error', function (e) {
                            return callback(null);
                        });
            request.write(JSON.stringify(config));
            request.end();
        },
        /**
         * Start a container
         *
         * POST /containers/(id)/start
         * Start the container id
         *
         * @param socketPath is the Docker Unix Domain Socket path.
         * @param id is the Identifier of the Docker Container.
         * @param hostConfig is the Docker Container's Host Configuration. It is optional.
         * @param callback is a Callback {Function} Object with an arity of one.
         * The argument of the Callback {Function} should be expecting a {boolean} true if successful, or
         * {boolean} false if failure.
         */
        startContainer: function (socketPath, id, hostConfig, callback) {
            hostConfig = !!hostConfig && typeof hostConfig === 'object' ? hostConfig : {}
            var request =
                http
                    .request({
                        method: 'POST',
                        path: '/containers/' + id + '/start',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        socketPath: socketPath
                    }, function (res) {
                        return callback(res.statusCode === 204);
                    })
                    .on('error', function (e) {
                        return callback(false);
                    });
            request.write(JSON.stringify(hostConfig));
            request.end();
        },
        /**
         * Stop a container
         *
         * POST /containers/(id)/stop
         * Stop the container id
         *
         * @param socketPath is the Docker Unix Domain Socket path.
         * @param id is the Identifier of the Docker Container.
         * @param callback is a Callback {Function} Object with an arity of one.
         * The argument of the Callback {Function} should be expecting a {boolean} true if successful, or
         * {boolean} false if failure.
         */
        stopContainer: function (socketPath, id, callback) {
            http
                .request({
                    method: 'POST',
                    path: '/containers/' + id + '/stop',
                    socketPath: socketPath
                }, function (res) {
                    return callback(res.statusCode === 204);
                })
                .on('error', function (e) {
                    return callback(false);
                })
                .end();
        },
        /**
         * Inspect a container
         *
         * GET /containers/(id)/json
         * Return low-level information on the container id.
         *
         * @param socketPath is the Docker Unix Domain Socket path.
         * @param id is the Identifier of the Docker Container.
         * @param callback is a Callback {Function} Object with an arity of one.
         * The argument of the Callback {Function} should be expecting a Container {Object} if successful, or
         * {null} if failure.
         */
        inspectContainer: function (socketPath, id, callback) {
            http
                .request({
                    method: 'GET',
                    path: '/containers/' + id + '/json',
                    socketPath: socketPath
                }, function (res) {
                    if (res.statusCode === 200) {
                        var container = '';
                        res
                            .on('data', function (data) {
                                container += data;
                            })
                            .on('end', function () {
                                return callback(JSON.parse(container));
                            });
                    } else {
                        return callback(null);
                    }
                })
                .on('error', function (e) {
                    return callback(null);
                })
                .end();
        },
        /**
         * List containers
         *
         * GET /containers/json
         * List containers
         *
         * @param socketPath is the Docker Unix Domain Socket path.
         * @param callback is a Callback {Function} Object with an arity of one.
         * The argument of the Callback {Function} should be expecting a Container {Array} if successful, or
         * {null} if failure.
         */
        listContainers: function (socketPath, callback) {
            http
                .request({
                    method: 'GET',
                    path: '/containers/json?all=1',
                    socketPath: socketPath
                }, function (res) {
                    if (res.statusCode === 200) {
                        var containers = '';
                        res
                            .on('data', function (data) {
                                containers += data;
                            })
                            .on('end', function () {
                                return callback(JSON.parse(containers));
                            });
                    } else {
                        return callback(null);
                    }
                })
                .on('error', function (e) {
                    return callback(null);
                })
                .end();
        }
    };

    /**
     * ----------------------------------------------------------------------------------------------------------------
     */

    /**
     * Delegate callback {Function} for Docker.inspectContainer().
     *
     * @param container is a Docker Container {Object} if a Container was successfully inspected; {null}, otherwise.
     */
    function onContainerInspected(container) {
        if (!!container && typeof container === 'object') {
            /**
             * The name of every Container should be in the form of *.hapi.co.
             * The name should route to the IP address of its respective Container like DNS.
             */
            var routeHost = container.Name.slice(1),
                targetHost = container.NetworkSettings.IPAddress;

            /**
             * Map routes in the route table.
             * ssh://*.hapi.co:22 -> ssh://Docker.I.P.Address:22
             * http://*.hapi.co:80 -> http://Docker.I.P.Address:8080
             * http://ide.*.hapi.co:80 -> http://Docker.I.P.Address:80
             *
             * The routes may be existing routes, or new routes because new Containers were created.
             */
            proxyTable
                .addRoute(routeHost, targetHost, {
                    'scheme': 'ssh',
                    'port': '22'
                })
                .addRoute(routeHost, targetHost + ':8080')
                .addRoute('ide.' + routeHost, targetHost);

            /**
             * Also map www.hapi.co routes as hapi.co to the route table.
             */
            if (routeHost.indexOf('www.') === 0) {
                var modifiedRouteHost = routeHost.replace('www.', '');
                proxyTable
                    .addRoute(modifiedRouteHost, targetHost, {
                        'scheme': 'ssh',
                        'port': '22'
                    })
                    .addRoute(modifiedRouteHost, targetHost + ':8080')
                    .addRoute('ide.' + modifiedRouteHost, targetHost);
            }

            if (debug) {
                console.log('------------------------------');
                console.log('Container Name:');
                console.log(routeHost);
                console.log('Container IP:');
                console.log(targetHost);
                console.log('------------------------------');
            }
        }
    }

    /**
     * Delegate callback {Function} for Docker.listContainers().
     *
     * @param containers is a Docker Container {Array} if successfully listed; {null}, otherwise.
     */
    function onContainersListed(containers) {
        if (Array.isArray(containers)) {
            for (var container in containers) {
                container = containers[container];
                Docker.inspectContainer('/var/docker.sock', container.Id, onContainerInspected);
            }
        }
    }

    /**
     * Convenience {Function} to start adding Docker Container routes to the proxy route table.
     */
    function getRoutes() {
        Docker.listContainers('/var/docker.sock', onContainersListed);
    }

    /**
     * Convenience {Function} to start adding Docker Container routes to the proxy route table every specified time
     * interval.
     *
     * @param delay should be an integer {Number} indicative of a time interval.
     */
    function getRoutesAtInterval(delay) {
        setInterval(getRoutes, delay);
    }

    /**
     * Actually start adding Docker Container routes to the proxy route table at a time interval specified by
     * command line options. The default interval is 30 seconds.
     */
    getRoutesAtInterval(interval);

    /**
     * Create an HTTP Proxy Server capable of routing HTTP requests to their respective HTTP Origin Servers,
     * and capable of tunneling arbitrary TCP based protocols through to their respective Origin Servers.
     */
    var proxyTable = repro(),
        proxy = httpProxy.createProxy();
    http
        .createServer(function (req, res) {
            /**
             * Host = "Host" ":" host [ ":" port ] ; Section 3.2.2
             *
             * @see http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.23
             */
            var headers = req.headers,
                host = headers['host'],
                hasTarget = proxyTable.hasTarget(host);

            if (debug) {
                console.log('------------------------------');
                console.log('Host:');
                console.log(host);
                console.log('Has Target?');
                console.log(hasTarget);
                console.log('------------------------------');
            }

            if (hasTarget) {
                var targetUrl = proxyTable.getTarget(host);

                proxy.web(req, res, {
                    target: targetUrl
                }, function (e) {
                    if (debug) {
                        console.log('------------------------------');
                        console.log('Error:');
                        console.error(e);
                        console.log('------------------------------');
                    }
                    res.statusCode = 504;
                    res.end();
                });

                if (debug) {
                    console.log('------------------------------');
                    console.log('Target:');
                    console.log(targetUrl);
                    console.log('------------------------------');
                }
            } else {
                res.statusCode = 400;
                res.end();
            }
        })
        .on('upgrade', function (req, clientSocket, head) {
            /**
             * Host = "Host" ":" host [ ":" port ] ; Section 3.2.2
             *
             * @see http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.23
             */
            var headers = req.headers,
                host = headers['host'],
                badRequest = 'HTTP/1.1 400 Bad Request',
                gatewayTimeout = '504 Gateway Timeout',
                proxyAgent = 'Proxy-agent: Hapi-Proxy/1.0',
                hasTarget = proxyTable.hasTarget(host);

            if (debug) {
                console.log('------------------------------');
                console.log('Host:');
                console.log(host);
                console.log('Has Target?');
                console.log(hasTarget);
                console.log('------------------------------');
            }

            if (hasTarget) {
                var targetUrl = proxyTable.getTarget(host);

                proxy.ws(req, clientSocket, head, {
                    target: targetUrl
                }, function (e) {
                    if (debug) {
                        console.log('------------------------------');
                        console.log('Error:');
                        console.error(e);
                        console.log('------------------------------');
                    }
                    clientSocket.write(gatewayTimeout + '\r\n' + proxyAgent + '\r\n\r\n');
                    clientSocket.end();
                    clientSocket.destroy();
                });

                if (debug) {
                    console.log('------------------------------');
                    console.log('Target:');
                    console.log(targetUrl);
                    console.log('------------------------------');
                }
            } else {
                /**
                 * If the host is not a valid host on the server, the response MUST be a 400 (Bad Request)
                 * error message.
                 *
                 * @see http://www.w3.org/Protocols/rfc2616/rfc2616-sec5.html#sec5.2
                 */
                clientSocket.write(badRequest + '\r\n' + proxyAgent + '\r\n\r\n');
                clientSocket.end();
                clientSocket.destroy();
            }
        })
        .on('connect', function (req, clientSocket, head) {
            /**
             * The client connects to the proxy server, and uses the CONNECT method to specify the hostname and the
             * port number to connect to.  The hostname and port number are separated by a colon, and both of them
             * must be specified.
             *
             * Example of an SSL tunneling request to host home.netscape.com, to HTTPS port (443):
             *
             * CONNECT home.netscape.com:443 HTTP/1.0
             * User-agent: Mozilla/4.0
             * [CRLF]
             * ...data to be tunnelled to the server...
             *
             * Note that the "...data to be tunnelled to the server..." is not a part of the request.  It is shown
             * here only to make the point that once the tunnel is established, the same connection is used for
             * transferring the data that is to be tunnelled.
             *
             * @see https://tools.ietf.org/html/draft-luotonen-web-proxy-tunneling-01#page-3
             *
             * The Request URL will be the same syntax as an HTTP Host header:
             * host [ ":" port ]
             * A Host header may be specified, but the Host will probably be the Proxy and not the Target.
             */
            var url = req.url,
                badRequest = 'HTTP/1.1 400 Bad Request',
                connectionEstablished = 'HTTP/1.1 200 Connection Established',
                gatewayTimeout = '504 Gateway Timeout',
                proxyAgent = 'Proxy-agent: Hapi-Proxy/1.0',
                proxyOptions = {
                    'scheme': 'ssh',
                    'port': '22'
                },
                hasTarget = proxyTable.hasTarget(url, proxyOptions);

            if (debug) {
                console.log('------------------------------');
                console.log('Host:');
                console.log(url);
                console.log('Has Target?');
                console.log(hasTarget);
                console.log('------------------------------');
            }

            /**
             * Does the intended Host Route have a Target?
             */
            if (hasTarget) {
                /**
                 * If yes, the proxy will make a connection to the destination server.
                 *
                 * @see https://tools.ietf.org/html/draft-luotonen-web-proxy-tunneling-01#section-3.2
                 */
                var targetUrl = proxyTable.getTarget(url, proxyOptions),
                    target = uri.parse(targetUrl),
                    serverSocket =
                        net
                            .connect(target.port, target.hostname, function () {
                                /**
                                 * If successful, send a "200 Connection established" response to the client.
                                 *
                                 * @see https://tools.ietf.org/html/draft-luotonen-web-proxy-tunneling-01#section-3.2
                                 */
                                clientSocket.write(connectionEstablished + '\r\n' + proxyAgent + '\r\n\r\n');
                                /**
                                 * It is legal for the client to send some data intended for the server before the
                                 * "200 Connection established" (or any other success or error code) is received.
                                 * This allows for reduced latency and increased efficiency when any handshake data
                                 * intended for the remote server can be sent in the same TCP packet as the proxy
                                 * request.  This allows the proxy to immediately forward the data once the connection
                                 * to the remote server is established, without waiting for two round-trip times to
                                 * the client (sending 200 to client; waiting for the next packet from client).
                                 *
                                 * @see https://tools.ietf.org/html/draft-luotonen-web-proxy-tunneling-01#section-3.3
                                 */
                                serverSocket.write(head);
                                /**
                                 * The proxy will start passing data from the client connection to the remote server
                                 * connection, and vice versa. At any time, there may be data coming from either
                                 * connection, and that data must be forwarded to the other connection immediately.
                                 *
                                 * Note that since the tunnelled protocol is opaque to the proxy server, the proxy
                                 * cannot make any assumptions about which connection the first, or any subsequent,
                                 * packets will arrive.  In other words, the proxy server must be prepared to accept
                                 * packets from either of the connections at any time.  Otherwise, a deadlock may
                                 * occur.
                                 *
                                 * @see https://tools.ietf.org/html/draft-luotonen-web-proxy-tunneling-01#section-3.2
                                 */
                                serverSocket.pipe(clientSocket);
                                clientSocket.pipe(serverSocket);
                            })
                            .on('error', function (e) {
                                if (debug) {
                                    console.log('------------------------------');
                                    console.log('Error:');
                                    console.error(e);
                                    console.log('------------------------------');
                                }
                                /**
                                 * If at any point either one of the peers gets disconnected, any outstanding data
                                 * that came from that peer will be passed to the other one, and after that also the
                                 * other connection will be terminated by the proxy.  If there is outstanding data to
                                 * that peer undelivered, that data will be discarded.
                                 *
                                 * @see https://tools.ietf.org/html/draft-luotonen-web-proxy-tunneling-01#section-3.2
                                 */
                                clientSocket.write(gatewayTimeout + '\r\n' + proxyAgent + '\r\n\r\n');
                                clientSocket.end();
                                clientSocket.destroy();
                                serverSocket.end();
                                serverSocket.destroy();
                            });
                if (debug) {
                    console.log('------------------------------');
                    console.log('Target:');
                    console.log(targetUrl);
                    console.log('------------------------------');
                }
            } else {
                /**
                 * If the host is not a valid host on the server, the response MUST be a 400 (Bad Request)
                 * error message.
                 *
                 * @see http://www.w3.org/Protocols/rfc2616/rfc2616-sec5.html#sec5.2
                 */
                clientSocket.write(badRequest + '\r\n' + proxyAgent + '\r\n\r\n');
                clientSocket.end();
                clientSocket.destroy();
            }
        })
        .listen(port, host);
})();
