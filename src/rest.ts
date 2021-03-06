import Axios, { AxiosInstance, AxiosPromise } from 'axios';
import SocketIO from 'socket.io-client';
import mergeOptions from 'merge-options';
// import { testAuthentication } from './socket/authentication.channel';

import {
  Storage,
  StorageOptions,
  IndefiniteModelData,
  ModelData,
  ModelReference,
  TerminalStore,
  StorageReadRequest,
} from 'plump';

export interface RestOptions extends StorageOptions {
  baseURL?: string;
  axios?: AxiosInstance;
  socketURL?: string;
  apiKey?: string;
  onlyFireSocketEvents?: boolean;
}

export class RestStore extends Storage implements TerminalStore {
  public axios: AxiosInstance;
  public io: SocketIOClient.Socket;
  public options: RestOptions;
  httpInProgress: { [url: string]: AxiosPromise } = {};
  constructor(opts: RestOptions) {
    super(opts);
    this.options = Object.assign(
      {},
      {
        baseURL: 'http://localhost/api',
        onlyFireSocketEvents: false,
      },
      opts,
    );

    this.axios = this.options.axios || Axios.create(this.options);
    if (this.options.socketURL) {
      this.io = SocketIO(this.options.socketURL, { transports: ['websocket'] });
      this.io.on('connect', () => console.log('connected to socket'));
      this.io.on('plumpUpdate', data => this.updateFromSocket(data));
    }
  }

  debounceGet(url: string): AxiosPromise {
    if (!this.httpInProgress[url]) {
      this.httpInProgress[url] = this.axios.get(url).then(v => {
        delete this.httpInProgress[url];
        return v;
      });
    }
    return this.httpInProgress[url];
  }

  updateFromSocket(data) {
    try {
      if (data.eventType === 'update') {
        this.fireWriteUpdate({
          type: data.type,
          id: data.id,
          invalidate: ['attributes'],
        });
      } else if (data.eventType === 'relationshipCreate') {
        this.fireWriteUpdate({
          type: data.type,
          id: data.id,
          invalidate: [data.field],
        });
      } else if (data.eventType === 'relationshipUpdate') {
        this.fireWriteUpdate({
          type: data.type,
          id: data.id,
          invalidate: [data.field],
        });
      } else if (data.eventType === 'relationshipDelete') {
        this.fireWriteUpdate({
          type: data.type,
          id: data.id,
          invalidate: [data.field],
        });
      }
    } catch (e) {
      console.log('ERROR');
      console.log(e);
      console.log(data);
    }
  }

  writeAttributes(value: IndefiniteModelData): Promise<ModelData> {
    return Promise.resolve()
      .then(() => {
        if (value.id) {
          return this.axios.patch(`/${value.type}/${value.id}`, value);
        } else if (this.terminal) {
          return this.axios.post(`/${value.type}`, value);
        } else {
          throw new Error('Cannot create new content in a non-terminal store');
        }
      })
      .then(response => {
        const result = response.data;
        if (!this.options.onlyFireSocketEvents) {
          this.fireWriteUpdate({
            type: result.type,
            id: result.id,
            invalidate: ['attributes'],
          });
        }
        return result;
      });
  }

  fixDates(d: ModelData) {
    if (!d.attributes && !d.relationships) {
      return d;
    }
    const schema = this.getSchema(d.type);
    const override = {
      attributes: {},
      relationships: {},
    };
    Object.keys(schema.attributes)
      .filter(attr => schema.attributes[attr].type === 'date')
      .forEach(dateAttr => {
        override.attributes[dateAttr] = new Date(d.attributes[dateAttr]);
      });
    Object.keys(schema.relationships).forEach(relName => {
      if (
        d.relationships &&
        d.relationships[relName] &&
        d.relationships[relName].length > 0 &&
        schema.relationships[relName].type.extras
      ) {
        const toChange = Object.keys(
          schema.relationships[relName].type.extras,
        ).filter(extraField => {
          if (
            schema.relationships[relName].type.extras[extraField].type ===
            'date'
          ) {
            return true;
          } else {
            return false;
          }
        });
        if (toChange.length > 0) {
          override.relationships[relName] = d.relationships[relName].map(rel =>
            mergeOptions(
              ...[rel].concat(toChange.map(tc => ({
                meta: { [tc]: new Date(rel.meta[tc] as string) },
              })) as any),
            ),
          );
        }
      }
    });
    return mergeOptions({}, d, override);
  }

  readAttributes(req: StorageReadRequest): Promise<ModelData> {
    let url: string = `/${req.item.type}/${req.item.id}`;
    if (req.view) {
      url = `${url}?view=${req.view}`;
    }
    return Promise.resolve()
      .then(() => this.debounceGet(url))
      .then(reply => {
        if (reply.status === 404) {
          return null;
        } else if (reply.status !== 200) {
          throw new Error(reply.statusText);
        } else {
          const result = reply.data;
          if (result.included) {
            result.included.forEach(includedData => {
              this.fireReadUpdate(this.fixDates(includedData));
            });
          }
          return this.fixDates(result);
        }
      })
      .then(v => new Promise(resolve => setTimeout(() => resolve(v), 5))) // make sure results are cached.
      .catch(err => {
        if (err.response && err.response.status === 404) {
          return null;
        } else {
          throw err;
        }
      });
  }

  readRelationship(req: StorageReadRequest): Promise<ModelData> {
    return this.debounceGet(`/${req.item.type}/${req.item.id}/${req.rel}`)
      .then(response => {
        if (response.data.included) {
          response.data.included.forEach(item => {
            this.fireReadUpdate(this.fixDates(item));
          });
        }
        return this.fixDates(response.data);
      })
      .catch(err => {
        if (err.response && err.response.status === 404) {
          return [];
        } else {
          throw err;
        }
      });
  }

  writeRelationshipItem(
    value: ModelReference,
    relName: string,
    child: { id: string | number },
  ): Promise<ModelData> {
    return this.axios
      .put(`/${value.type}/${value.id}/${relName}`, child)
      .then(res => {
        if (!this.options.onlyFireSocketEvents) {
          this.fireWriteUpdate({
            type: value.type,
            id: value.id,
            invalidate: [`relationships.${relName}`],
          });
        }
        return res.data;
      });
  }

  deleteRelationshipItem(
    value: ModelReference,
    relName: string,
    child: { id: string | number },
  ): Promise<ModelData> {
    return this.axios
      .delete(`/${value.type}/${value.id}/${relName}/${child.id}`)
      .then(res => {
        if (!this.options.onlyFireSocketEvents) {
          this.fireWriteUpdate({
            type: value.type,
            id: value.id,
            invalidate: [`relationships.${relName}`],
          });
        }
        return res.data;
      });
  }

  delete(value: ModelReference): Promise<void> {
    return this.axios.delete(`/${value.type}/${value.id}`).then(response => {
      if (!this.options.onlyFireSocketEvents) {
        this.fireWriteUpdate({
          type: value.type,
          id: value.id,
          invalidate: ['attributes'],
        });
      }
      return response.data;
    });
  }

  query(type: string, q: any) {
    return this.axios.get(`/${type}`, { params: q }).then(response => {
      if (response.data.included) {
        response.data.included.forEach(item => {
          this.fireReadUpdate(this.fixDates(item));
        });
      }
      return response.data.data.map(v => this.fixDates(v));
    });
  }
}
