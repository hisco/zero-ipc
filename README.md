# Zero IPC
Fastest IPC communication module

[![Greenkeeper badge](https://badges.greenkeeper.io/hisco/zero-ipc.svg)](https://greenkeeper.io/)
[![NPM Version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]

Fastest IPC communication module

## Motivation
When creating multiple processes on the machine there is the need for the these processes to comunicate.

High level communication can be established using http for example.
The problem with such protocol is the they add another layer of parsing and overheads.

`Zero IPC` enables low level commiucation with almost no overheads using unix sockets files.
IPC - internal process communication.

Over that low level communication there is also a simple async rpc helpers with promises as a response.

Bonus it allow more than one client for each socket created by server.

## Example
More examples can be found in the integration tests.
Also in the integration you will find an integration with RX observables.
```ts
    const {IPCClient , IPCServer} = require('zero-ipc');
    const unixPathPrefix = './test-ipc';

    const server = new IPCServer((connection)=>{
    })
    server.on('request' , function(message){
        message.replay('hi');
    })
    server.listen({
        removeOpenFiles : true,
        in : unixPathPrefix+".in.sock",
        out : unixPathPrefix+".out.sock"
    })
    const client = new IPCClient({
        out : unixPathPrefix+".in.sock",
        in : unixPathPrefix+".out.sock"
    } , ()=>{

    })

    IPCClient.promiseSendWithReplay(client , 'test1' , 100)
    .then((message)=>{
        console.log(message.toString());
        //hi
    })
```

## License

 [MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/zero-ipc.svg
[npm-url]: https://npmjs.org/package/zero-ipc
[travis-image]: https://img.shields.io/travis/hisco/zero-ipc/master.svg?style=flat-square
[travis-url]: https://travis-ci.org/hisco/zero-ipc