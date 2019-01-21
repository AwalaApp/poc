'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const {decrypt} = require('./_cms');

/**
 * Relaynet Abstract Message v1
 *
 * In real life, this would be a *stream* (wrapping the payload).
 */
class Message {
    constructor(recipient, senderCert, id, date, ttl, payload) {
        this.recipient = recipient;
        this.senderCert = senderCert;
        this.id = id;
        this.date = date;
        this.ttl = ttl;
        this.payload = payload;
    }

    async decryptPayload(privateKeyPath) {
        return await decrypt(this.payload, privateKeyPath);
    }
}

class Parcel extends Message {}

class Cargo extends Message {}

module.exports = {
    Parcel,
    Cargo,
};
