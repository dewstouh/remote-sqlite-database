
const { Client } = require("net-ipc");
const { EventEmitter } = require('events')

class RemoteCacheClient extends EventEmitter {
    constructor(options) {
        super();

        if(!options.host || typeof options.host != "string") throw new SyntaxError("Missing the Option host");
        if(!options.port || typeof options.port != "number") throw new SyntaxError("Missing the Option port");
        if(!options.username || typeof options.username != "string") throw new SyntaxError("Missing the Option username");
        if(!options.password || typeof options.password != "string") throw new SyntaxError("Missing the Option password");
        if(options.tls && typeof options.tls != "boolean") throw new SyntaxError("Provided option tls is not a Boolean");

        this.host = options.host || "localhost";
        this.port = options.port || 5000;
        this.tls = options.tls || true; 
        this.username = options.username || "database_cache";
        this.password = Buffer.from(options.password) || Buffer.from("database_password");

        this.client = new Client({
            host: this.host,
            port: this.port,
            tls: this.tls,
            options: {
                pskCallback: () => {
                    // return the user and the key for verification
                    return {
                        identity: this.username,
                        psk: Buffer.from(this.password)
                    }
                },
                ciphers: "PSK", // enable PSK ciphers, they are disabled by default
                checkServerIdentity: () => void 0, // bypass SSL certificate verification since we are not using certificates
            }
        });

        this.cache = new Map();
        this.sync = new Map();
        return this.init(), this;
    }
    init() {
        this.client.connect().catch(console.error);
        this.client
            .on("ready", async () => {
                const entries = await this.handleRequest("startSync")
                this.cache = new Map(entries);
                this.emit('cacheReady', null);
            })
            .on("error", (error) => {
                this.emit('cacheError', error);
            })
            .on("close", (reason) => {
                this.emit('cacheClose', reason);
            })
            .on("message", (message) => {
                this.emit('cacheMessage', message);
            })
            .on("request", async (request, response, client) => {
                if(request.requestSync) {
                    if(request.requestSyncData === undefined) {
                        return this.cache.delete(request.requestSync)
                    }
                    if(request.requestSyncClear) {
                        return this.cache.clear();
                    }
                    this.cache.set(request.requestSync, request.requestSyncData);
                    await response({syncUpdate: "true"})
                } else this.emit('cacheRequest', request, response, client);
            });
    }
    async handlePath(key, path = null) {
        if(!path) return this.cache.get(key);
        const data = this.cache.get(key);
        if(!data) return data;
        return lodash.get(data, path);
    }
    async ensure(key, data, path = null) {
        if(!key) throw "missing a key to ensure";
        if(!data) throw "missing data to ensure";
        return this.handleRequest("ensure", key, data, path);
    }
    async keyArray() {
        return [...this.cache.keys()]
    }
    async get(key, path = null) {
        if(!key) throw "Missing a key to get"
        return this.handlePath(key, path);
        return this.handleRequest("get", key, path);
    }
    async add(key, amount, path = null) {
        if(!key) throw "Missing a key to add"
        if(!amount || typeof amount != "number") throw "Missing the Amount (Number) to add to the Cache"

        return this.handleRequest("add", key, amount, path);
    }
    async push(key, element, path = null) {
        if(!key) throw "Missing a key to push"
        if(!element) throw "Missing the Element to push to the Cache"

        return this.handleRequest("push", key, element, path);
    }
    async remove(key, element, path = null) {
        if(!key) throw "Missing a key to remove"
        if(!element) throw "Missing the Element to remove from the Cache"

        return this.handleRequest("remove", key, element, path);
    }
    async has(key, path = null) {
        if(!key) throw "Missing a key to check for"
        return this.handlePath(key, path);
        return this.handleRequest("has", key, path);
    }
    async delete(key, path = null) {
        if(!key) throw "Missing a key to delete"

        return this.handleRequest("delete", key, path);
    }
    async set(key, data, path = null) {
        if(!key) throw "Missing a key to set"
        if(!data) throw "Missing a key to set"
        return this.handleRequest("set", key, data, path);
    }
    async size() {
        return this.cache.size;
        return this.handleRequest("size");
    }
    async ping() {
        return await this.client.ping();
    }
    async values() {
        return this.handleRequest("values");
    }
    async all() {
        return this.values();
    }
    async keys() {
        return this.handleRequest("keys");
    }
    async entries() {
        return this.handleRequest("entries");
    }

    async handleRequest(type, key, data, path) {
        const response = await this.client.request({ 
            dbAction: type, 
            key, 
            data, 
            path
        }).catch(err => { throw err; });
        if(response?.error) {
            throw response.error
        }
        return response.data;
    }
}  
module.exports = RemoteCacheClient;