'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const net = require('net');
const uuid4 = require('uuid4');
const {CargoCollectionStream, CargoDeliveryStream} = require('./_streams');
const {serializeVarchar} = require('./_primitives');

class Client {
    constructor(socketPath) {
        this._socketPath = socketPath;
    }

    /**
     * @param {Iterable<Array<string,Buffer>>} cargoesGenerator
     * @returns {Promise<Array<string>>}
     */
    deliverCargoes(cargoesGenerator) {
        const deliveredCargoIds = [];
        const cargoIdByCargoDeliveryId = {};

        return new Promise((resolve, reject) => {
            const client = net.createConnection(this._socketPath, async function () {
                client.write('D'); // Intent ("D" for "deliver")

                const stream = new CargoDeliveryStream(client);
                stream.on('data', (data) => {
                    const cargoDeliveryId = data.toString();
                    const cargoId = cargoIdByCargoDeliveryId[cargoDeliveryId];
                    if (cargoId !== undefined) {
                        deliveredCargoIds.push(cargoId);
                        delete cargoIdByCargoDeliveryId[cargoDeliveryId];
                    }
                    if (Object.keys(cargoIdByCargoDeliveryId).length === 0) {
                        // The server has acknowledged the receipt of each cargo
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
        const cargoes = [];

        return new Promise((resolve, reject) => {
            const client = net.createConnection(this._socketPath, async function () {
                client.write('C'); // Intent ("C" for "collect")

                const collectionStream = new CargoCollectionStream(client);
                collectionStream.on('data', (cargoDelivery) => {
                    cargoes.push(cargoDelivery.stream);

                    // ACK
                    client.write('c');
                    client.write(serializeVarchar(cargoDelivery.id));
                });
                collectionStream.init();

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
