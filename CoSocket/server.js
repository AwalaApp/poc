'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const fs = require('fs');
const net = require('net');
const uuid4 = require('uuid4');
const VError = require('verror');
const {CargoDeliveryAck, getIntent, INTENTS} = require('./_packets');
const {CargoCollectionStream, CargoDeliveryStream} = require('./_streams');
const {CARGO_SERIALIZER, deserializeCargoPayload, serializeCargoPayload} = require('../core/serialization');

function runServer(socketPath, certPath, keyPath, parcelNotifier, cargoPayloadFetcher) {
    if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
    }

    const server = net.createServer(function (client) {
        async function triggerIntent(data) {
            client.off('data', triggerIntent);

            const intentTagBuffer = data.slice(0, 1);
            client.unshift(data.slice(1));

            // When the client collects then the server delivers, and vice versa.
            switch (getIntent(intentTagBuffer)) {
                case INTENTS.DELIVER:
                    await collectCargoes(client, keyPath, parcelNotifier);
                    break;
                case INTENTS.COLLECT:
                    await deliverCargoes(client, cargoPayloadFetcher, certPath, keyPath, parcelNotifier);
                    break;
                default:
                    const error = new Error(`Invalid intent tag ${intentTagBuffer.toString('hex')} (hex)`);
                    client.destroy(error);
                    break;
            }
        }

        client.on('data', triggerIntent);

        client.setTimeout(2000, () => {
            client.end();
            console.warn('Client timeout');
        })
    });

    server.on('error', function (error) {
        throw new VError(error, 'CoSocket server encountered an error');
    });

    server.listen(socketPath);
}

async function collectCargoes(client, keyPath, parcelNotifier) {
    const stream = new CargoCollectionStream(client);
    stream.on('data', async function (cargoDelivery) {
        if (cargoDelivery.stream === null) {
            // Acknowledge this empty cargo but don't do anything with it. An error MUST be sent to
            // the client instead in production.
            stream.write(new CargoDeliveryAck(cargoDelivery.id));

            console.warn(`Cargo ${cargoDelivery.id} was ignored because it was empty`);
            return;
        }

        // Cargoes are serialized with the Relaynet Abstract Message Format, which is meant to be validated
        // on the fly, so we should take advantage of that in the production implementation.

        const cargoSerializationChunks = [];
        cargoDelivery.stream.on('data', (data) => cargoSerializationChunks.push(data));

        cargoDelivery.stream.on('end', async function () {
            const cargoSerialized = Buffer.concat(cargoSerializationChunks);
            const cargo = await CARGO_SERIALIZER.deserialize(cargoSerialized);
            const cargoPayloadDecrypted = await cargo.decryptPayload(keyPath);
            const parcelSerializations = deserializeCargoPayload(cargoPayloadDecrypted);
            for (const parcelSerialized of parcelSerializations) {
                // Notify receipt of parcel from Cargo Relay Connection (CRC)
                parcelNotifier.emit('crc', parcelSerialized);
            }

            if (!client.destroyed) {
                stream.write(new CargoDeliveryAck(cargoDelivery.id));
            }
        });
    });
    stream.init();
}

async function deliverCargoes(client, cargoPayloadFetcher, certPath, keyPath, parcelNotifier) {
    // NB: There's one pretty significant omission in this PoC: The client MUST provide one Cargo Collection Authorization
    // for each gateway it's representing. That must be part of the "collect cargo" intent packet, and
    // it must be verified before calling cargoPayloadFetcher().

    const stream = new CargoDeliveryStream(client);
    const collectedParcelsByCargoId = {};

    stream.on('data', function (data) {
        const cargoId = data.toString();
        const parcelIds = collectedParcelsByCargoId[cargoId] || [];
        parcelIds.map(id => parcelNotifier.emit('crcCollection', id));
    });
    stream.init();

    const gatewayAddresses = []; // Only those whose Cargo Collection Authorizations (CCAs) were valid.
    for await (const {gatewayCertPath, parcels} of cargoPayloadFetcher(gatewayAddresses)) {
        const cargoPayload = serializeCargoPayload(...Object.values(parcels));
        const cargoSerialized = await CARGO_SERIALIZER.serialize(
            cargoPayload,
            gatewayCertPath, // Workaround until CCAs are supported.
            fs.readFileSync(certPath),
            keyPath,
        );
        const cargoId = uuid4();
        stream.write({id: cargoId, cargo: cargoSerialized});

        collectedParcelsByCargoId[cargoId] = Object.keys(parcels);
    }
    client.end();
}

module.exports = runServer;
