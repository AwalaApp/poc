'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const net = require('net');
const uuid4 = require('uuid4');
const {CargoCollectionStream, CargoDeliveryStream} = require('./_streams');
const {CargoDeliveryAck, INTENTS} = require('./_packets');

class Client {
    constructor(socketPath) {
        this._socketPath = socketPath;
    }

    /**
     * @param {Iterable<Array<string,Buffer>>} cargoesGenerator
     * @returns {Promise<Array<string>>}
     */
    deliverCargoes(cargoesGenerator) {
        // This function should be a generator in production
        const deliveredCargoIds = [];
        const cargoIdByCargoDeliveryId = {};

        return new Promise((resolve, reject) => {
            const client = net.createConnection(this._socketPath, async function () {
                client.write(INTENTS.DELIVER);

                const stream = new CargoDeliveryStream(client);
                stream.on('data', (data) => {
                    const cargoDeliveryId = data.toString();
                    const cargoId = cargoIdByCargoDeliveryId[cargoDeliveryId];
                    if (cargoId !== undefined) {
                        deliveredCargoIds.push(cargoId);
                        delete cargoIdByCargoDeliveryId[cargoDeliveryId];
                    }
                    if (Object.keys(cargoIdByCargoDeliveryId).length === 0) {
                        // The server has acknowledged the receipt of all cargoes
                        client.end();
                        resolve(deliveredCargoIds);
                    }
                });
                stream.init();

                for (const [cargoId, cargoSerialized] of cargoesGenerator) {
                    // Use a different id for the cargo delivery.
                    const cargoDeliveryId = uuid4();
                    cargoIdByCargoDeliveryId[cargoDeliveryId] = cargoId;
                    stream.write({id: cargoDeliveryId, cargo: cargoSerialized})
                }

                if (Object.keys(cargoIdByCargoDeliveryId).length === 0) {
                    // No cargo was delivered.
                    client.end();
                    resolve([]);
                    return;
                }

                client.setTimeout(2000, () => {
                    client.end();
                    reject(new Error('Server became inactive'));
                });
            });

            client.on('error', reject);

            client.on('end', () => resolve(deliveredCargoIds));
        });
    }

    collectCargoes() {
        // This function should be a generator in production
        const cargoes = [];

        return new Promise((resolve, reject) => {
            const client = net.createConnection(this._socketPath, async function () {
                client.write(INTENTS.COLLECT);

                const stream = new CargoCollectionStream(client);
                stream.on('data', (cargoDelivery) => {
                    cargoes.push(cargoDelivery.stream);

                    // We should only ACK when the cargo has been safely persisted or
                    // relayed in production.
                    stream.write(new CargoDeliveryAck(cargoDelivery.id));
                });
                stream.init();

                client.setTimeout(2000, () => {
                    client.end();
                    reject(new Error('Server became inactive'));
                });
            });

            client.on('error', reject);

            client.on('end', () => resolve(cargoes));
        });
    }
}

module.exports = Client;
