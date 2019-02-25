'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const EventEmitter = require('events');
const uuid4 = require('uuid4');
const WebSocket = require('ws');
const {
    deserializeMessage,
    ParcelCollectionRequest,
    ParcelDelivery,
    ParcelDeliveryAck,
    ParcelDeliveryComplete,
    serializeMessage,
} = require('./_messages');

class PoWebSocketClient extends EventEmitter {
    constructor(wsServerAddress) {
        super();

        this._client = new WebSocket(wsServerAddress);

        this._connected = false;
        const self = this;
        this._client.on('open', () => self._connected = true);
    }

    close() {
        this._client.close();
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

            await self._waitUntilConnected();

            try {
                await self._sendMessage(ParcelCollectionRequest.create());
            } catch (error) {
                reject(error);
            }
        });
    }

    _waitUntilConnected() {
        const self = this;
        return new Promise((resolve) => {
            this._client.on('open', resolve);

            if (self._connected) {
                resolve();
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
                        reject(error)
                    }
                });
            } catch (error) {
                return reject(error);
            }

            resolve();
        })
    }
}

module.exports = PoWebSocketClient;
