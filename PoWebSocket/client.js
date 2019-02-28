'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const EventEmitter = require('events');
const uuid4 = require('uuid4');
const VError = require('verror');
const WebSocket = require('ws');
const {runClientHandshake} = require('./_handshake');
const {
    deserializeMessage,
    ParcelCollectionRequest,
    ParcelDelivery,
    ParcelDeliveryAck,
    ParcelDeliveryComplete,
    serializeMessage,
} = require('./_messages');

class PoWebSocketClient extends EventEmitter {

    /**
     * @param wsUrl
     * @param cert
     * @param key
     * @param {null|Array<Object<{cert: string, key: string}>>} oldCerts Certificates that
     *        are still active are no longer used due to key rotation.
     */
    constructor(wsUrl, cert, key, oldCerts = null) {
        super();

        this._wsUrl = wsUrl;
        this._client = null;
        this._connected = false;

        oldCerts = oldCerts || [];
        this._certs = [{cert: cert, key: key}, ...oldCerts];
    }

    async _connect() {
        if (this._connected) {
            return;
        }

        this._client = new WebSocket(this._wsUrl);

        try {
            await runClientHandshake(this._client, this._certs);
        } catch (error) {
            this.close();
            throw new VError(error, 'Could not do handshake with gateway');
        }

        this._connected = true;

    }

    close() {
        this._client.close(1000);
    }

    /**
     * @param {Array<Buffer>} parcelsSerialized
     * @returns {Promise<void>}
     */
    deliverParcels(parcelsSerialized) {
        // The final implementation should actually work with streams instead of loading everything in
        // memory and doing so much stuff synchronously.

        const pendingDeliveryIds = new Set();
        let allParcelsSent = false;

        const self = this;
        return new Promise(async (resolve, reject) => {
            await self._connect();

            function listenForAcks(messageSerialized) {
                const message = deserializeMessage(messageSerialized);
                if (message.$type !== ParcelDeliveryAck) {
                    return;
                }

                if (!pendingDeliveryIds.has(message.id)) {
                    console.warn(`Got ACK for unknown parcel (${message.id})`);
                    return;
                }

                pendingDeliveryIds.delete(message.id);

                if (allParcelsSent && pendingDeliveryIds.size === 0) {
                    self._client.off('message', listenForAcks);
                    resolve();
                }
            }

            self._client.on('message', listenForAcks);

            for (const parcel of parcelsSerialized) {
                const parcelDeliveryId = uuid4();
                pendingDeliveryIds.add(parcelDeliveryId);
                const message = ParcelDelivery.create({id: parcelDeliveryId, parcel});
                try {
                    await self._sendMessage(message);
                } catch (error) {
                    reject(error);
                }
            }
            allParcelsSent = true;

            if (pendingDeliveryIds.size === 0) {
                resolve();
            }
        });
    }

    /**
     * @returns {Promise<Array<Buffer>>}
     */
    collectParcels() {
        // The final implementation must actually emit an event for each parcel received.
        const receivedParcels = [];
        const self = this;

        return new Promise(async function (resolve, reject) {
            await self._connect();

            async function collectParcel(messageSerialized) {
                const message = deserializeMessage(messageSerialized);
                switch (message.$type) {
                    case ParcelDelivery:
                        receivedParcels.push(message.parcel);
                        const ack = ParcelDeliveryAck.create({id: message.id});
                        try {
                            await self._sendMessage(ack);
                        } catch (error) {
                            reject(error);
                        }
                        break;
                    case ParcelDeliveryComplete:
                        self._client.off('message', collectParcel);
                        resolve(receivedParcels);
                        break;
                }
            }

            self._client.on('message', collectParcel);

            try {
                await self._sendMessage(ParcelCollectionRequest.create());
            } catch (error) {
                reject(error);
            }
        });
    }

    _sendMessage(message) {
        const messageSerialized = serializeMessage(message);
        const self = this;
        return new Promise((resolve, reject) => {
            try {
                self._client.send(messageSerialized, (error) => {
                    if (error) {
                        return reject(error)
                    }
                });
            } catch (error) {
                return reject(error);
            }

            resolve();
        });
    }
}

module.exports = PoWebSocketClient;
