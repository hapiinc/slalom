Slalom
======

A reverse proxy, hostname router that polls Docker for hosts.

## Installation

    cd paasta
    make build n=base
    make build n=slalom
    make run n=slalom r="-d -p 80:8080 -v /var/run/docker.sock:/var/docker.sock --name=slalom.hapi.co"

## Usage

    curl http://*.hapi.co

## Tests

No unit tests are currently present. Eventually:

    npm test

## Contributing

In lieu of a formal style guideline, take care to maintain the existing coding style.

## Release History

+ 0.0.1 Initial release
