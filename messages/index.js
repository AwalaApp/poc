'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

/**
 * Relaynet Abstract Message v1
 *
 * In real life, this would be a stream wrapping `payload`.
 */
class Message {
    constructor(recipient, labels, payload, signature) {
        this.recipient = recipient;
        this.labels = labels || {};
        this.payload = payload;
        this.signature = signature;
    }
}

class Parcel extends Message {}

class Cargo extends Message {}

module.exports = {
    Parcel,
    Cargo,
};
