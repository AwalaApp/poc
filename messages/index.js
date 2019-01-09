'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const openssl = require('openssl-wrapper');
const {promisify} = require('util');

const opensslExec = promisify(openssl.exec);

/**
 * Relaynet Abstract Message v1
 *
 * In real life, this would be a stream wrapping `payload`.
 */
class Message {
    constructor(recipient, senderCert, payload, signature) {
        this.recipient = recipient;
        this.payload = payload;
        this.senderCert = senderCert;
        this.signature = signature;
    }

    async decryptPayload(privateKeyPath) {
        return await opensslExec('cms.decrypt', this.payload, {
            binary: true,
            inform: 'DER',
            inkey: privateKeyPath,
        });
    }
}

class Parcel extends Message {}

class Cargo extends Message {}

module.exports = {
    Parcel,
    Cargo,
};
