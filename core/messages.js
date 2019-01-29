'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const {decrypt} = require('./_cms');

/**
 * Relaynet Abstract Message Format v1
 *
 * In real life, this would be a *stream* (wrapping the payload).
 */
class RAMFMessage {
    constructor(recipient, senderCert, id, date, ttl, payload) {
        this.recipient = recipient;
        this.senderCert = senderCert;
        this.id = id;
        this.date = date;
        this.ttl = ttl;
        this.payload = payload;
    }

    /**
     * @param {string} privateKeyPath
     * @returns {Promise<Buffer>}
     */
    async decryptPayload(privateKeyPath) {
        return await decrypt(this.payload, privateKeyPath);
    }
}

class Parcel extends RAMFMessage {
}

class Cargo extends RAMFMessage {
}

class ServiceMessage {
    /**
     * @param {Buffer|Uint8Array} messageSerialized
     * @param {string} type
     */
    constructor(messageSerialized, type) {
        this.messageSerialized = messageSerialized;
        this.type = type;
    }
}

module.exports = {
    Cargo,
    Parcel,
    ServiceMessage,
};
