'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

// Binding-agnostic endpoint for applications acting as clients (as opposed to servers).

const fs = require('fs');
const {getAddressFromCert} = require('./pki');
const {PARCEL_SERIALIZER} = require('./serialization');

class ClientEndpoint {

    /**
     * @param {string} certPath
     * @param {string} keyPath
     * @param {PogRPCClient} pdnClient
     * @param {function(Message): Buffer} serializer
     * @param {function(Buffer): Message} deserializer
     */
    constructor(certPath, keyPath, pdnClient, serializer, deserializer) {
        this.cert = fs.readFileSync(certPath);
        this.keyPath = keyPath;

        this._pdnClient = pdnClient;

        this._serializer = serializer;
        this._deserializer = deserializer;

        this._endpointAddres = getAddressFromCert(fs.readFileSync(certPath));
    }

    /**
     * @param {Message} message
     * @param {string} targetEndpointCertPath
     * @param {string} signatureHashAlgo
     * @param {string|null} id
     * @param {Date} date
     * @param {number} ttl
     * @returns {Promise<void>}
     */
    async deliverMessage(message, targetEndpointCertPath, {signatureHashAlgo = 'sha256', id = null, date = null, ttl = 0} = {}) {
        const payload = this._serializer(message);
        const parcelSerialized = await PARCEL_SERIALIZER.serialize(
            payload,
            targetEndpointCertPath,
            this.cert,
            this.keyPath,
            signatureHashAlgo,
            id,
            date,
            ttl,
        );
        await this._pdnClient.deliverParcels([{id, parcel: parcelSerialized}]);
    }

    /**
     * @returns {AsyncIterableIterator<Message>}
     */
    async* collectMessages() {
        const parcelSerializations = await this._pdnClient.collectParcels();
        for (const parcelSerialized of parcelSerializations) {
            const parcel = await PARCEL_SERIALIZER.deserialize(parcelSerialized);

            if (this._endpointAddres !== parcel.recipient) {
                console.warn(`Gateway provided parcel for another endpoint: ${parcel.recipient}`);
                break;
            }

            // Also validate the date and expiry of the message. And the signature, if we don't trust the gateway.

            const payload = await parcel.decryptPayload(this.keyPath);
            const message = this._deserializer(payload);
            yield message;
        }
    }
}

module.exports = ClientEndpoint;
