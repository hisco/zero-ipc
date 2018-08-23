
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-spies'));

const {IPCClient , IPCServer} = require('../../src/index');
const {Observable} = require('rxjs');

describe('Messages' , ()=>{
    let server,client;
    const unixPathPrefix = './test-ipc';
    let requestsHandler;
    beforeEach(async ()=>{
        return new Promise((resolve , reject)=>{
            server = new IPCServer((connection)=>{
            });
            server.on('request' , function(){
                if (requestsHandler)
                    requestsHandler.apply(this,arguments);
            })
            server.listen({
                removeOpenFiles : true,
                in : unixPathPrefix+".in.sock",
                out : unixPathPrefix+".out.sock"
            });
            resolve();
        })
            .then(()=>{
                return new Promise((resolve , reject)=>{
                    client = new IPCClient({
                        out : unixPathPrefix+".in.sock",
                        in : unixPathPrefix+".out.sock"
                    } , ()=>{
                        resolve();
                    });
                })
            })
    });
    afterEach(async ()=>{
        if (client){
            await client.destory();
        }
        if (server){
            await server.destory();
        }
    });

    it('Should resolve promise' , async()=>{
        server.on('request' , (message)=>{
            message.replay('hi')
        });
        await IPCClient.promiseSendWithReplay(client , 'test1' , 100)
            .then((message)=>{
                expect(message.toString()).to.equal( 'hi');
            })
    });
    it('Should resolve promises' , async()=>{
        const queue = [];
        server.on('request' , (message)=>{
            queue.push(message);
            function testAndReplay(i){
                const msg = queue[i];
                if (msg.toString() == 'test'+i){
                    queue[i].replay('hi'+i);
                }
            }
            if (queue.length == 3){
                testAndReplay(0);
                testAndReplay(1);
                testAndReplay(2);
            }
            
        });
        function sendAndTestMessage(i){
            return IPCClient.promiseSendWithReplay(client , 'test' + i , 100)
                .then((message)=>{
                    expect(message.toString()).to.equal( 'hi'+i);
                })
        }
        await Promise.all([
            sendAndTestMessage(0),
            sendAndTestMessage(1),
            sendAndTestMessage(2)
        ]);
    });

    it('Should observe' , async()=>{
        let buffer = '';
        server.on('clientObserver' , (message)=>{
            message.sendAccepted();
            message.sendData('h');
            message.sendData('i');
            message.endSuccess();
        });
        await new Promise((resolve , reject)=>{
            IPCClient.sendAndObserve(
                client ,
                'test',
                100,
                function(d){
                    buffer+=d;
                },
                function onSuccess(){
                    resolve();  
                },
                (error)=>{
                    reject(error);
                }
            )
               
        })
        .then(()=>{
            expect(buffer).to.equal('hi');
        })
    });
    it('Should dispose observe' , async()=>{
        let buffer = '';
        server.on('clientObserver' , (message)=>{
            message.sendAccepted();
            //Using setTimeout because we want the close to have a chance to to happen between open/send messages
            setTimeout(()=>{
                message.sendData('h');
                message.sendData('i');
                message.endSuccess();
            } , 4);
            
        });

        await new Promise((resolve , reject)=>{
            const subs = IPCClient.sendAndObserve(
                client ,
                'test',
                100,
                function(d){
                    buffer+=d;
                },
                function onSuccess(){
                    resolve();  
                },
                (error)=>{
                    reject(error);
                }
            );
            //dispose - it's with setTimeout because we want it to be opened first
            setTimeout(subs,1)
               
        })
        .then(()=>{
            expect(buffer).to.equal('');
        })
    });
    it('Should observe with rx observable' , async()=>{
        let buffer = '';
        server.on('clientObserver' , (message)=>{
            message.sendAccepted();
            message.sendData('h');
            message.sendData('i');
            message.endSuccess();
        });
        await new Promise((resolve , reject)=>{
            const observable = IPCClient.sendAndCreateObservable(
                    Observable ,
                    client ,
                    'test',
                    100
                )
              observable.subscribe({
                next: x => buffer+=x,
                error: err => reject(err),
                complete: () => resolve(),
              });
               
        })
        .then(()=>{
            expect(buffer).to.equal('hi');
        })
    });
    it('Should observe with rx observable and be disposed' , async()=>{
        let buffer = '';
        server.on('clientObserver' , (message)=>{
            message.sendAccepted();
            message.sendData('h');
            message.sendData('i');
            message.endSuccess();
        });
        await new Promise((resolve , reject)=>{
            const observable = IPCClient.sendAndCreateObservable(
                    Observable ,
                    client ,
                    'test',
                    100
                )
              const subscription = observable.subscribe({
                next: x => {
                    buffer+=x;
                    subscription.unsubscribe();
                    resolve();
                },
                error: err => reject(err),
                complete: () => resolve(),
              });
        })
        .then(()=>{
            expect(buffer).to.equal('h');
        })
    });
})