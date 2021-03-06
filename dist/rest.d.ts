/// <reference types="socket.io-client" />
import { AxiosInstance, AxiosPromise } from 'axios';
import { Storage, StorageOptions, IndefiniteModelData, ModelData, ModelReference, TerminalStore, StorageReadRequest } from 'plump';
export interface RestOptions extends StorageOptions {
    baseURL?: string;
    axios?: AxiosInstance;
    socketURL?: string;
    apiKey?: string;
    onlyFireSocketEvents?: boolean;
}
export declare class RestStore extends Storage implements TerminalStore {
    axios: AxiosInstance;
    io: SocketIOClient.Socket;
    options: RestOptions;
    httpInProgress: {
        [url: string]: AxiosPromise;
    };
    constructor(opts: RestOptions);
    debounceGet(url: string): AxiosPromise;
    updateFromSocket(data: any): void;
    writeAttributes(value: IndefiniteModelData): Promise<ModelData>;
    fixDates(d: ModelData): any;
    readAttributes(req: StorageReadRequest): Promise<ModelData>;
    readRelationship(req: StorageReadRequest): Promise<ModelData>;
    writeRelationshipItem(value: ModelReference, relName: string, child: {
        id: string | number;
    }): Promise<ModelData>;
    deleteRelationshipItem(value: ModelReference, relName: string, child: {
        id: string | number;
    }): Promise<ModelData>;
    delete(value: ModelReference): Promise<void>;
    query(type: string, q: any): Promise<any>;
}
