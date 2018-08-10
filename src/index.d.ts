import * as Buffer from 'buffer';
declare module ZeroIPC{
    export interface Net{
        createConnection({path : string} , onConnection : ()=>void):void
        createServer({path : string} , onConnection : ()=>void):void
    }
    export interface NetServer{
        listen(path:string , onListen : (error?:Error)=>void);
        on(eventName : string , cb : ()=>void):void;
        emit(eventName : string , value:any):void;
        close():void;
    }
    export interface NetClient{
        send(data : string|Buffer , onFinish : ()=>void)
        end(data : string|Buffer)
        on(eventName : string , cb : ()=>void):void;
        emit(eventName : string , value:any):void;
        removeAllListeners(eventName:string);
        close():void;
    }
    export interface FS{
        unlinkSync(path:string):void;
    }
    type onClientSocket = ()=>void;
    type onConnection = (connection : IPCServerConnection)=>void;
    export class IPCSingleDirectionServer{
        static net:Net;
        static fs:FS;
        static saflyRemovePreviousFiles(path:string):void;
        constructor(onClientSocket? : onClientSocket);
        listen(path:string|number , removeOpenFiles? : boolean):Promise<void>;
    }
    export interface Queue{
        constructor(maxParallelism:number);
        push(task : ()=>void):void;
        release():void;
    }
    export class IPCServerConnection{
        public id : string;
        public container:any;
        public outgoingSocket:NetClient;
        public incomingSocket:NetClient;
        public writeQueue:Queue;
        private handleFailures():void;
        public send(id:string,kind:string,msBuffer : string|Buffer);
        public sendWithReplay(msgBuffer : string | Buffer , timeoutInMs : number , onResponse : (response:Buffer)=>void):void;
        public sendWithReplayPromise(msgBuffer : string | Buffer , timeoutInMs : number) : Promise<Buffer>;


    }
    export class IPCServer{
        constructor(onConnection? : onConnection);
        private createMultiplax(onConnection : onConnection):void;
        public listen(listenConfig : {in : string|number , out:string|number , removeOpenFiles:boolean}):void;
        private addConnection(connection : IPCServerConnection):void;

    }

    export class IPCClient{
        static net:Net;
        static fs:FS;
        static saflyRemovePreviousFiles(path:string):void;
        constructor(onClientSocket : onClientSocket);
        listen(path:string|number , removeOpenFiles? : boolean):Promise<void>;
    }
}

export = ZeroIPC;