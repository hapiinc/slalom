#!/usr/bin/env node

/**
 * Falsy Values: false, 0, "", null, undefined, NaN
 */

(function () {
    /**
     * Module Dependencies.
     */
    var argo = require('argo'),
        gzip = require('argo-gzip'),
        router = require('argo-url-router'),
        logger = require('argo-clf'),
        xop = require('xop'),
        https = require('https'),
        fs = require('fs');

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
     * - optional HTTP router library
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
    var options = xop().parse(process.argv),
        port = options.get('port'),
        host = options.get('host'),
        lib = options.get('lib'),
        debug = options.has('debug');

    /**
     * Default the Port and Host values if they're not defined.
     */
    port = (typeof port === 'string' && Number(port) >= 0) ? port : '8080';
    host = (typeof host === 'string') ? host : '0.0.0.0';

    if (debug) {
        console.log('Port: ' + JSON.stringify(port));
        console.log('Host: ' + JSON.stringify(host));
        console.log('Lib: ' + JSON.stringify(lib));
    }

    var key = fs.readFileSync('ssl/key.pem', 'utf8'),
        cert = fs.readFileSync('ssl/cert.pem', 'utf8');

    /**
     * Simple, Proxy Route Table that maintains Host Header values as keys, and ports as values.
     */
    var table = {};

    function inspectContainer(container) {
        var inspection = '';
        https
            .request({
                host: '54.84.109.160',
                port: '4243',
                method: 'GET',
                path: '/containers/' + container.Id + '/json',
                key: key,
                cert: cert,
                rejectUnauthorized: false,
                agent: false
            }, function (res) {
                res
                    .on('data', function (data) {
                        inspection += data;
                    })
                    .on('end', function () {
                        inspection = JSON.parse(inspection);
                        if (!!inspection && typeof inspection === 'object') {
                            table[inspection.Name.substring(1) + '.hapi.co'] =
                                'http://' + inspection.NetworkSettings.IPAddress + ':8080';
                        }
                    });
            })
            .on('error', function (e) {
                console.error(e);
            })
            .end();
    }

    function getContainers() {
        var containers = '';
        https
            .request({
                host: '54.84.109.160',
                port: '4243',
                method: 'GET',
                path: '/containers/json',
                key: key,
                cert: cert,
                rejectUnauthorized: false,
                agent: false
            }, function (res) {
                res
                    .on('data', function (data) {
                        containers += data;
                    })
                    .on('end', function () {
                        containers = JSON.parse(containers);
                        for (var container in containers) {
                            container = containers[container];
                            inspectContainer(container);
                        }
                    });
            })
            .on('error', function (e) {
                console.error(e);
            })
            .end();
    }

    function monitorContainers() {
        setInterval(getContainers, 5000);
    }

    monitorContainers();

    argo()
        .use(router)
        .use(logger)
        .use(gzip)
        .use(function (handle) {
            handle('request', function (env, next) {
                var headers = env.request.headers,
                    host = !!headers && typeof headers === 'object' ? headers['host'] : null;

                console.log(table);

                if (!!host && table.hasOwnProperty(host)) {
                    headers['X-Forwarded-Host'] = host;
                    headers['X-Forwarded-Proto'] = env.request.connection.encrypted ? 'https' : 'http';
                    headers['X-Forwarded-For'] = env.request.connection.remoteAddress;
                    env.target.url = table[host] + env.request.url;
                } else {
                    env.response.statusCode = 404;
                }

                next(env);
            });
        })
        .listen(port, host);
})();
