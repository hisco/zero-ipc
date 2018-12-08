const { TasksQueue } = require('zeroq');
const { EventEmitter } = require('events');

const MAGIC_NUMBER_TO_CONVERT_STRING_TO_BUFFER_FOR_SPEED = 100;
const MESSAGE_ID_LENGTH = 4;
const MESSAGE_TYPE_LENGTH = 2;
const MESSAGE_HEADER_LENGTH = MESSAGE_ID_LENGTH+MESSAGE_TYPE_LENGTH;
const MESSAGE_ID_POSSIBILITIES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()?:><"}{|.,`~[]-_+=\\\/';

function forwardError(error){
    this.emit('error' , error);
}
class IPCSingleDirectionServer{
    static get net(){
        return require('net');
    }
    static get fs(){
        return require('fs');
    }
    static saflyRemovePreviousFiles(path ){
        try {
            IPCSingleDirectionServer.fs.unlinkSync(path);
            //The file was deleted and we can continue
        } catch (err) {
            //The file doesn't exists and we can continue
        }
    }
    constructor(onClietSocket){
        this._server = IPCSingleDirectionServer.net.createServer((clientSocket) => {
            onClietSocket(clientSocket);
        })
        this._server.on('error', forwardError.bind(this));
    }
    
    listen(path, removeOpenFiles){
        this._path = path;
        return new Promise((resolve , reject)=>{
            if (isNaN(path) && removeOpenFiles)
                IPCSingleDirectionServer.saflyRemovePreviousFiles(path);
            this._server.listen(path , (err)=>{
                if (err){
                    reject(err)
                }
                else {
                    resolve()
                }
            });
        })
    }
    end(){
        return new Promise((resolve , reject)=>{
            this._server.close((error)=>{
                if (error){
                    reject(error);
                }
                else{
                    resolve();
                }
                try{
                    if (isNaN(path))
                        IPCSingleDirectionServer.saflyRemovePreviousFiles(path);           
                }
                catch(err){

                }
            })
        }) 
    }
}

class IPCServer extends EventEmitter{
    constructor(
        onConnection
    ){
        super();
        this.connections = [];
        this.createMultiplax(onConnection);
        this.messageCache = {};
        //Fixme: add auto clear tale parked
    }
    getMessageFromCache(msgId){
        return this.messageCache[msgId];
    }
    setMessageCache(msgId , msg){
        return this.messageCache[msgId] = msg;
    }
    removeMessageCache(msgId ){
        delete this.messageCache[msgId];
    }
    createMultiplax(onConnection){
        const parked = this.parked = {};
        let i = 0;

        this.outgoingServer = new IPCSingleDirectionServer(function(outgoingSocket){
            outgoingSocket.on('data' , function onHandshakeData(data){
                outgoingSocket.removeAllListeners('data');
                
                const socketId = data.toString();
                if (socketId && parked[socketId]){
                    const incomingSocket = parked[socketId].incomingSocket;
                    delete parked[socketId];
                    incomingSocket.write(socketId);
                    const connection = new IPCServerConnection(++i , this,outgoingSocket , incomingSocket );
                    this.addConnection(connection);
                    onConnection(connection)
                }
                else{
                    outgoingSocket.end('notFound') 
                }
            }.bind(this));
        }.bind(this));
        this.incomingServer = new IPCSingleDirectionServer(function(incomingSocket){
            const socketId =  Math.random()+'';
            parked[socketId] = {incomingSocket , createdAt : Date.now()};
            incomingSocket.write(socketId);
        });
    }
    listen(listenConfig){
        return Promise.all([
            this.outgoingServer.listen(listenConfig.out , listenConfig.removeOpenFiles),
            this.incomingServer.listen(listenConfig.in ,listenConfig.removeOpenFiles)
        ])
    }

    addConnection(connection){
        connection.incomingSocket.on('data' , onData.bind(connection));
        this.connections.push(connection);
        connection.on('close' , ()=>{
            for (var i = 0 ;i<this.connections.length;i++){
                const currentConnection = this.connections[i];
                if (connection.id == currentConnection.id){
                    this.connections.splice(i,1);
                    break;
                }
            }
            this.emit('removed' , connection);
        });
    }
    destory(){
        this.outgoingServer.end();
        this.incomingServer.end();
    }
    
}

class IPCServerConnection extends EventEmitter{
    constructor(
            id ,
            container,
            outgoingSocket ,
            incomingSocket
         ){
        super();
        this.id = id;
        this.container = container;
        this.outgoingSocket = outgoingSocket;
        this.incomingSocket = incomingSocket;
        this.writeQueue = new TasksQueue(1);
        this.handleFailures();
    }
    handleFailures(){
        [
            this.outgoingSocket,
            this.incomingSocket
        ].forEach((socket)=>{
            //Todo : maybe handle close of channels, maybe reconnect? 
            //Generraly speaking it may cause lost messages or memomry increase if we handle reconnect - this is why currently it's not supported
            socket.on('end' , (endMessage)=>{
                const msg = endMessage && endMessage.toString();
                if (msg != 'closedBySelf');
                    this.emit('close' ,msg)
            });
            socket.on('error' , (err)=>{
                this.emit('close' ,err)
            });
        });
    }

    send(id , kind , msgBuffer){
        var ipcServer = this;
        this.writeQueue.push(function onAction(){
            send(ipcServer,id,kind,msgBuffer , ipcServer.writeQueue.release)
        });
    }
    sendMessage(msgBuffer){
        var id = generateMessageId();
        this.writeQueue.push(function onAction(){
            send(ipcServer,id,'ms',msgBuffer , ipcServer.writeQueue.release)
        });
    }
    sendWithReplay(msgBuffer  , timeoutMs , cb){
        return sendWithReplay(this ,msgBuffer  , timeoutMs ,cb)
    }
    sendWithReplayPromise(msgBuffer  , timeoutMs){
        var ipcServer = this;
        return new Promise(function onPromise(resolve , reject){
            sendWithReplay(ipcServer ,msgBuffer  , timeoutMs ,function onReplay(err,response){
                if (err)
                    reject(err);
                else 
                    resolve(response)
            })
        })
    }
    end(endMessage){
        endMessage  = endMessage || 'closedBySelf';
        const message = generateMessageId()+'cl'+endMessage;
        this.emit('close',endMessage);
        this.outgoingSocket.end(message);
        this.incomingSocket.end(message);
    }
}


class IPCMessage{
    constructor(
        connection,
        id,
        kind,
        buffer
    ){
        this.connection = connection;
        this.id = id;
        this.kind = kind;
        this.buffer = buffer;
    }
    replay(msgBuffer){
        return this.connection.send(this.id,'mr',msgBuffer);
    }
    sendData(msgBuffer){
        return this.connection.send(this.id,'od',msgBuffer);
    }
    sendAccepted(){
        return this.connection.send(this.id,'oa','');
    }
    endSuccess(){
        return this.connection.send(this.id,'os','');
    }
    endError(msgBuffer){
        return this.connection.send(this.id,'oe',msgBuffer);
    }
    toString(encoding){
        return this.buffer.toString(encoding);
    }
    toJSON(encoding){
        return JSON.parse(this.toString(encoding))
    }
}


class IPCClient extends EventEmitter{
    static get net(){
        return require('net')
    }
    constructor(paths , onConnection){
        super();
        this._whenReady = this._createConnection(paths , (err , connection)=>{
            this.connection = connection;
            this.outgoingSocket = connection.outgoingSocket;
            this.incomingSocket = connection.incomingSocket;
            this.send = this._send.bind(this);

            connection.incomingSocket.on('data' ,onData.bind(connection));
            
            onConnection(connection)
        });
        this.writeQueue = new TasksQueue(1);
        this.send = this._waitAndSend.bind(this);

    }
    _waitAndSend(id , kind , msgBuffer){
        var ipcClient = this;
        return this.whenReady()
            .then(function onEndWait(){
                ipcClient.writeQueue.push(function onAction(){
                    send(ipcClient,id,kind,msgBuffer , ipcClient.writeQueue.release)
                })
            })
    }
    whenReady(){
        return this._whenReady;
    }
    _createConnection(paths , onConnection){
        return new Promise((resolve , reject)=>{
            const outgoingSocket = IPCClient.net.createConnection({ path : paths.out }, () => {
            
            });
            outgoingSocket.on('data' , function onId(idBuffer){
                outgoingSocket.removeAllListeners('data' );
                const id = idBuffer.toString();
                const incomingSocket = IPCClient.net.createConnection({ path : paths.in }, () => {
                    incomingSocket.write(id);
                });
                outgoingSocket.on('data' , function onApproved(comparedId){
                    outgoingSocket.removeAllListeners('data');
                    if (comparedId.toString() == id){
                        //approved connection
                        try{
                            const connection = new IPCServerConnection(id , this, outgoingSocket , incomingSocket);
                            resolve();
                            onConnection(null,connection)
                        }
                        catch(err){
            
                        }
                    }
                }.bind(this)) //the reason we're using bind is that named functions are much faster then arrow functions
            }.bind(this));
        })
    }
    
    _send(id , kind , msgBuffer){
        var ipcClient = this;
        ipcClient.writeQueue.push(function onAction(){
            send(ipcClient,id,kind,msgBuffer , ipcClient.writeQueue.release)
        })
    }
    sendWithReplay(msgBuffer  , timeoutMs , cb){
        return sendWithReplay(this ,msgBuffer  , timeoutMs ,cb)
    }
    sendAndObserve(msgBuffer,timeoutMs,onNext ,onComplete ,onError){
        return sendAndObserve(this,msgBuffer , timeoutMs , onNext ,onComplete ,onError).dispose;
    }
    destory(){
        this.connection.end();
    }
    static promiseSendWithReplay(client,msgBuffer , timeoutMs){
        return new Promise(function onPromise(resolve ,reject){
            client.sendWithReplay(msgBuffer ,timeoutMs, function onResponse(err,message){
                if (err)
                    reject(err);
                else 
                    resolve(message);
            });
        })
    }
    static sendAndObserve(client ,msgBuffer, timeoutMs , onNext ,onComplete ,onEnd){
        return client.sendAndObserve(
            msgBuffer,
            timeoutMs,
            onNext ,
            onComplete ,
            onEnd
        );
    }
    static sendAndCreateObservable(Observable , client ,msgBuffer, timeoutMs){
        return Observable.create(function createIpc(observer) {
            return IPCClient.sendAndObserve(
                client ,
                msgBuffer,
                timeoutMs,
                observer.next.bind(observer),
                observer.complete.bind(observer),
                observer.error.bind(observer)
            )
        });
    }
}


const startTypeBuffer = MESSAGE_ID_LENGTH;
const endTypeBuffer = MESSAGE_ID_LENGTH+MESSAGE_TYPE_LENGTH;
const startContentBuffer = MESSAGE_HEADER_LENGTH;

function onData(data){
    var header = data.slice( 0 , MESSAGE_HEADER_LENGTH).toString();
    var contentBuf = data.slice( startContentBuffer);
    var msgId = header.slice(0,MESSAGE_ID_LENGTH);

    const message = new IPCMessage(
        this, 
        msgId ,
        header.slice(startTypeBuffer,endTypeBuffer) ,
        contentBuf
    );
    var container = this.container;
    if (message.kind == 'rm'){ // rm = Request message , when a request is recived by one side
        //We trigger a special request event
        container.emit('request' , message);
    }
    else if (message.kind == 'ob'){ // or = Observable request , when a request is recived by one side
        //We trigger a special request event
        container.emit('clientObserver' , message);
    }
    else if (message.kind == 'mr'){ //mr = Message response (The response for the request).
        //after one side will get a request he will respond for that request, this is that response
        //We trigger an internal event that will be used to match the currect requst for the promise matching
        container.emit('mr' + message.id ,message)
    }
    else if (message.kind == 'od'){ 
        container.emit(message.id + 'data' , message);
    }
    else if (message.kind == 'os'){ 
        container.emit(message.id + 'success' , message);
    }
    else if (message.kind == 'oe'){ 
        container.emit(message.id + 'error' , message);
    }
    else if (message.kind == 'oa'){ 
        container.emit(message.id + 'accepted' , message);
    }
    else if (message.kind == 'cd'){ 
        container.emit('observableDispose', message);
    }
    else if (message.kind == 'cl'){
        //Fixme: Do something when message is close
        // this.container.emit()
    }
    else //Any kind of message the module doesn't internally handle
        container.emit('message',message);
}
function send(client , id , kind , msgBuffer , onFinish){
    if (kind.length!=MESSAGE_TYPE_LENGTH)
        throw new Error(`Outgoing message must have exactly ${MESSAGE_TYPE_LENGTH} chars`);
    
    var msgId = id || generateMessageId();
    var header = msgId+kind;
    var isBuffer = msgBuffer instanceof Buffer;
    
    if (isBuffer || msgBuffer.length > MAGIC_NUMBER_TO_CONVERT_STRING_TO_BUFFER_FOR_SPEED)
        client.outgoingSocket.write(
            Buffer.concat([
                Buffer.from(header) ,
                msgBuffer instanceof Buffer ? msgBuffer : Buffer.from(msgBuffer)
            ],
                MESSAGE_HEADER_LENGTH + msgBuffer.length
            ),
            onFinish
        );
    else
        client.outgoingSocket.write(
            header + msgBuffer,
            onFinish
        );
    
    return msgId;
}
function sendWithReplay(client,msgBuffer , timeoutMs , cb){
    var msgId = generateMessageId();
    var eventId =  'mr'+msgId;

    function listener(rMsg){
        process.nextTick(removeListener);
        cb(null , rMsg);
    }
    function removeListener(){
        client.removeAllListeners(eventId);
        clearTimeout(timeoutId);
    }

    var timeoutId = setTimeout(function msgReplayTimeout(){
        removeListener();
        cb(new Error('timeout'));
    }, timeoutMs);

    client.on(eventId ,listener);
    client.send(msgId , 'rm', msgBuffer);

    return removeListener;
}
function sendAndObserve(
    client ,
    msgBuffer,
    timeoutMs ,
    onNext , 
    onSuccess , 
    onError
){
    var msgId = generateMessageId();
    var eventId =  msgId;
    var closed = true;
    var accepted = false;

    function nextListener(rMsg){
        onNext(rMsg);
    }
    function acceptedListener(){
        closed = false;
        accepted = true;
        client.removeAllListeners(eventId + 'accepted');
        clearTimer();
    }

    function successListener(){
        closed = true;
        process.nextTick(removeListener);
        onSuccess();
    }
    function errorListener(errorMsg){
        closed = true;
        process.nextTick(removeListener);
        onError(errorMsg);
    }

    function removeListener(){
        client.removeAllListeners(eventId + 'accepted');
        client.removeAllListeners(eventId + 'success');
        client.removeAllListeners(eventId + 'data');
        client.removeAllListeners(eventId + 'error');
        if (!closed){
            console.log('sent cd')
            client.send(eventId , 'cd' , '');
            onSuccess();
        }
        else if (!accepted){
            onSuccess();
        }
        clearTimer();
    }
    function clearTimer(){
        if (timeoutId){
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    }

    var timeoutId = setTimeout(function msgObsTimeout(){
        removeListener();
        onError('timeout');
    }, timeoutMs);

    client.on(eventId + 'accepted' ,acceptedListener);
    client.on(eventId + 'data' ,nextListener);
    client.on(eventId + 'success',successListener);
    client.on(eventId + 'error',errorListener);
    client.send(msgId , 'ob', msgBuffer);

    return {
        dispose : removeListener
    }
}

function generateMessageId() {
    var text = '';
    for (var i = 0; i < MESSAGE_ID_LENGTH; i++)
      text += MESSAGE_ID_POSSIBILITIES[Math.floor(Math.random() * MESSAGE_ID_POSSIBILITIES.length)];
    return text;
}

module.exports = {
	IPCClient,
	IPCServer,
	IPCServerConnection,
	IPCMessage
}
