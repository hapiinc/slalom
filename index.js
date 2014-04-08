#!/usr/bin/env node

/**
 * Falsy Values: false, 0, "", null, undefined, NaN
 */

(function () {
    /**
     * Module dependencies.
     */
    var argo = require('argo'),
        logger = require('argo-clf'),
        gzip = require('argo-gzip'),
        repro = require('repro'),
        slop = require('slop'),
        fs = require('fs'),
        http = require('http'),
        https = require('https'),
        net = require('net'),
        uri = require('url');

    var key = fs.readFileSync('ssl/key.pem', 'utf8'),
        cert = fs.readFileSync('ssl/cert.pem', 'utf8'),
        proxyTable = repro();

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
         * @param host is the Host of the Docker Remote API.
         * @param port is the Port of the Docker Remote API.
         * @param key is the SSL Key of the Docker Remote API.
         * @param cert is the SSL Certificate of the Docker Remote API.
         * @param config is the Docker Container's Configuration.
         * @param name is the Docker Container's name. It is optional, but if included, it must
         * match /?[a-zA-Z0-9_-]+.
         * @param callback is a Callback {Function} Object with an arity of one.
         * The argument of the Callback {Function} should be expecting a Container {Object} if successful, or
         * {null} if failure.
         */
        createContainer: function (host, port, key, cert, config, name, callback) {
            var queryString = typeof name === 'string' ? ('?name=' + name) : '',
                request =
                    https
                        .request({
                            method: 'POST',
                            path: '/containers/create' + queryString,
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            host: host,
                            port: port,
                            key: key,
                            cert: cert,
                            rejectUnauthorized: false,
                            agent: false
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
         * @param host is the Host of the Docker Remote API.
         * @param port is the Port of the Docker Remote API.
         * @param key is the SSL Key of the Docker Remote API.
         * @param cert is the SSL Certificate of the Docker Remote API.
         * @param id is the Identifier of the Docker Container.
         * @param hostConfig is the Docker Container's Host Configuration. It is optional.
         * @param callback is a Callback {Function} Object with an arity of one.
         * The argument of the Callback {Function} should be expecting a {boolean} true if successful, or
         * {boolean} false if failure.
         */
        startContainer: function (host, port, key, cert, id, hostConfig, callback) {
            hostConfig = !!hostConfig && typeof hostConfig === 'object' ? hostConfig : {}
            var request =
                https
                    .request({
                        method: 'POST',
                        path: '/containers/' + id + '/start',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        host: host,
                        port: port,
                        key: key,
                        cert: cert,
                        rejectUnauthorized: false,
                        agent: false
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
         * @param host is the Host of the Docker Remote API.
         * @param port is the Port of the Docker Remote API.
         * @param key is the SSL Key of the Docker Remote API.
         * @param cert is the SSL Certificate of the Docker Remote API.
         * @param id is the Identifier of the Docker Container.
         * @param callback is a Callback {Function} Object with an arity of one.
         * The argument of the Callback {Function} should be expecting a {boolean} true if successful, or
         * {boolean} false if failure.
         */
        stopContainer: function (host, port, key, cert, id, callback) {
            https
                .request({
                    method: 'POST',
                    path: '/containers/' + id + '/stop',
                    host: host,
                    port: port,
                    key: key,
                    cert: cert,
                    rejectUnauthorized: false,
                    agent: false
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
         * @param host is the Host of the Docker Remote API.
         * @param port is the Port of the Docker Remote API.
         * @param key is the SSL Key of the Docker Remote API.
         * @param cert is the SSL Certificate of the Docker Remote API.
         * @param id is the Identifier of the Docker Container.
         * @param callback is a Callback {Function} Object with an arity of one.
         * The argument of the Callback {Function} should be expecting a Container {Object} if successful, or
         * {null} if failure.
         */
        inspectContainer: function (host, port, key, cert, id, callback) {
            https
                .request({
                    method: 'GET',
                    path: '/containers/' + id + '/json',
                    host: host,
                    port: port,
                    key: key,
                    cert: cert,
                    rejectUnauthorized: false,
                    agent: false
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
         * @param host is the Host of the Docker Remote API.
         * @param port is the Port of the Docker Remote API.
         * @param key is the SSL Key of the Docker Remote API.
         * @param cert is the SSL Certificate of the Docker Remote API.
         * @param callback is a Callback {Function} Object with an arity of one.
         * The argument of the Callback {Function} should be expecting a Container {Array} if successful, or
         * {null} if failure.
         */
        listContainers: function (host, port, key, cert, callback) {
            https
                .request({
                    method: 'GET',
                    path: '/containers/json?all=1',
                    host: host,
                    port: port,
                    key: key,
                    cert: cert,
                    rejectUnauthorized: false,
                    agent: false
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
             * http://*.hapi.co:80 -> http://Docker.I.P.Address:80
             * http://api.*.hapi.co:80 -> http://Docker.I.P.Address:8080
             *
             * The routes may be existing routes, or new routes because new Containers were created.
             */
            proxyTable
                .addRoute(routeHost, targetHost, {
                    'scheme': 'ssh',
                    'port': '22'
                })
                .addRoute(routeHost, targetHost)
                .addRoute('api.' + routeHost, targetHost + ':8080');

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
                Docker.inspectContainer('hapi.co', '4243', key, cert, container.Id, onContainerInspected);
            }
        }
    }

    /**
     * Convenience {Function} to start adding Docker Container routes to the proxy route table.
     */
    function getRoutes() {
        Docker.listContainers('hapi.co', '4243', key, cert, onContainersListed);
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
    http
        .createServer(
            argo()
                .use(logger)
                .use(gzip)
                .use(function (handle) {
                    handle('request', function (env, next) {
                        /**
                         * Host = "Host" ":" host [ ":" port ] ; Section 3.2.2
                         *
                         * @see http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.23
                         */
                        var req = env.request,
                            res = env.response,
                            target = env.target,
                            connection = req.connection,
                            headers = req.headers,
                            url = req.url,
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

                        /**
                         * Does the intended Host Route have a Target?
                         * If yes, then forward the request to the Target.
                         * If no, then respond with a 400 (Bad Request) status.
                         */
                        if (hasTarget) {
                            /**
                             * "by" identifies the user-agent facing interface of the proxy.
                             * "for" identifies the node making the request to the proxy.
                             * "host" is the host request header field as received by the proxy.
                             * "proto" indicates what protocol was used to make the request.
                             *
                             * @see http://tools.ietf.org/html/draft-ietf-appsawg-http-forwarded-10#section-5
                             */
                            headers['X-Forwarded-For'] = connection.remoteAddress;
                            headers['X-Forwarded-Host'] = host;
                            headers['X-Forwarded-Proto'] = connection.encrypted ? 'https' : 'http';
                            /**
                             * The Target will always have the syntax:
                             * scheme://host:port
                             * The Url will always have the syntax:
                             * /path?query_string#fragment_id
                             */
                            target.url = proxyTable.getTarget(host) + (!!url ? url : '');

                            if (debug) {
                                console.log('------------------------------');
                                console.log('Target:');
                                console.log(target.url);
                                console.log('------------------------------');
                            }
                        } else {
                            /**
                             * A client MUST include a Host header field in all HTTP/1.1 request messages.
                             * If the requested URI does not include an Internet host name for the service being
                             * requested, then the Host header field MUST be given with an empty value. An HTTP/1.1
                             * proxy MUST ensure that any request message it forwards does contain an appropriate
                             * Host header field that identifies the service being requested by the proxy. All
                             * Internet-based HTTP/1.1 servers MUST respond with a 400 (Bad Request) status code to
                             * any HTTP/1.1 request message which lacks a Host header field.
                             *
                             * @see http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.23
                             *
                             * If the host is not a valid host on the server, the response MUST be a 400 (Bad Request)
                             * error message.
                             *
                             * @see http://www.w3.org/Protocols/rfc2616/rfc2616-sec5.html#sec5.2
                             */
                            res.statusCode = 400;
                        }

                        next(env);
                    });
                })
                .build()
                .run
        )
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
