'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const fs = require('fs');
const net = require('net');
const uuid4 = require('uuid4');
const VError = require('verror');
const {serializeVarchar} = require('./_primitives');
const {CargoCollectionStream, CargoDeliveryStream} = require('./_streams');
const {CARGO_SERIALIZER, deserializeCargoPayload, serializeCargoPayload} = require('../core/serialization');

const INTENTS = {
    COLLECT: 'C',
    DELIVER: 'D',
};

function runServer(socketPath, certPath, keyPath, parcelNotifier, cargoPayloadFetcher) {
    if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
    }

    const server = net.createServer(function (client) {
        async function triggerIntent(data) {
            client.off('data', triggerIntent);

            const intent = data.slice(0, 1).toString();
            client.unshift(data.slice(1));

            // When the client collects then the server delivers, and vice versa.
            if (intent === INTENTS.DELIVER) {
                await collectCargoes(client, keyPath, parcelNotifier);
            } else if (intent === INTENTS.COLLECT) {
                await deliverCargoes(client, cargoPayloadFetcher, certPath, keyPath, parcelNotifier);
            } else {
                client.destroy(new Error('Unexpected intent ' + intent));
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
            client.write('c');
            client.write(serializeVarchar(cargoDelivery.id));

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
                // Notify about receipt of parcel from Cargo Relay Network (CRN)
                parcelNotifier.emit('crn', parcelSerialized);
            }

            if (!client.destroyed) {
                // ACK
                client.write('c');
                client.write(serializeVarchar(cargoDelivery.id));
            }
        });
    });
    stream.init();
}

async function deliverCargoes(client, cargoPayloadFetcher, certPath, keyPath, parcelNotifier) {
    const stream = new CargoDeliveryStream(client);
    const collectedParcelsByCargoId = {};

    stream.on('data', function (data) {
        const cargoId = data.toString();
        const parcelIds = collectedParcelsByCargoId[cargoId] || [];
        parcelIds.map(id => parcelNotifier.emit('crnCollection', id));
    });
    stream.init();

    for await (const {gatewayAddress, parcels} of cargoPayloadFetcher(['rngo:03050d7491283a75fb4b1cc4141bcf863'])) {
        const cargoPayload = serializeCargoPayload(...Object.values(parcels));
        const cargoSerialized = await CARGO_SERIALIZER.serialize(
            cargoPayload,
            __dirname + '/../certs/relayer-gateway.cert.pem',
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
