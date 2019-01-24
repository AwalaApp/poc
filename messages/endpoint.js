'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

// Binding-agnostic endpoint for applications acting as clients (as opposed to hosts).

const fs = require('fs');
const gatewayClient = require('../PogRPC/gateway_client');  // TODO: REMOVE
const {getAddressFromCert} = require('./utils');
const {PARCEL_SERIALIZER} = require('./serialization');

class ClientEndpoint {
    constructor(certPath, keyPath, gatewayClient) {
        this.cert = fs.readFileSync(certPath);
        this.keyPath = keyPath;

        this._gatewayClient = gatewayClient;

        this._endpointAddres = getAddressFromCert(fs.readFileSync(certPath));
    }

    async deliverMessage(messageSerialized, targetEndpointCertPath, {signatureHashAlgo = 'sha256', id = null, date = null, ttl = 0}) {
        const parcel = await PARCEL_SERIALIZER.serialize(
            messageSerialized,
            targetEndpointCertPath,
            this.cert,
            this.keyPath,
            signatureHashAlgo,
            id,
            date,
            ttl,
        );
        await gatewayClient.deliverParcels([parcel], this._gatewayClient);
    }

    async* collectMessages() {
        const parcelSerializations = gatewayClient.collectParcels(this._gatewayClient);
        for (const parcelSerialized of parcelSerializations) {
            const parcel = await PARCEL_SERIALIZER.deserialize(parcelSerialized);

            if (this._endpointAddres !== parcel.recipient) {
                console.warn(`Gateway provided parcel for another endpoint: ${parcel.recipient}`);
                break;
            }

            // Also validate the date and expiry of the message. And the signature, if
            // we don't trust the gateway.

            yield parcel.decryptPayload(this.keyPath);
        }
    }
}

module.exports = ClientEndpoint;
