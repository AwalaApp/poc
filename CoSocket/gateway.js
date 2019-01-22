'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const {serializeVarchar} = require('./_primitives');
const {RelayerStream} = require('./_stream');
const {CARGO_SERIALIZER, deserializeCargoPayload} = require('../messages/serialization');

const _INCOMING_CARGOES_DIR = '/tmp/incoming-cargoes';

function saveCargo(cargo, onFinish) {
    const cargoFileName = crypto.randomBytes(16).toString("hex") + '.cargo';
    const cargoFilePath = `${_INCOMING_CARGOES_DIR}/${cargoFileName}`;
    const cargoFileStream = fs.createWriteStream(cargoFilePath);

    cargoFileStream.on('finish', () => {
        // This should call fdatasync() in the production-ready implementation

        onFinish(cargoFilePath);
    });

    cargo.stream.pipe(cargoFileStream);
}

async function extractParcelsFromCargo(cargoFilePath, privateKeyPath) {
    const cargo = await CARGO_SERIALIZER.deserialize(fs.readFileSync(cargoFilePath));

    const cargoPayloadDecrypted = await cargo.decryptPayload(privateKeyPath);
    return deserializeCargoPayload(cargoPayloadDecrypted);
}

function runServer(socketPath, privateKeyPath, parcelNotifier) {
    if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
    }
    if (!fs.existsSync(_INCOMING_CARGOES_DIR)) {
        fs.mkdirSync(_INCOMING_CARGOES_DIR);
    }

    const server = net.createServer(function (client) {
        const relayerClient = new RelayerStream(client);
        relayerClient.on('data', function (cargo) {
            // Cargoes are serialized with the Relaynet Abstract Message Format, which is meant to be validated
            // on the fly, so we should take advantage of that in the production-ready implementation.

            saveCargo(cargo, async function (cargoFilePath) {
                if (!client.destroyed) {
                    client.write('c');
                    client.write(serializeVarchar(cargo.id));
                }

                const parcelSerializations = await extractParcelsFromCargo(cargoFilePath, privateKeyPath);

                for (const parcelSerialized of parcelSerializations) {
                    // Notify about receipt of parcel from Cargo Relay Network (CRN)
                    parcelNotifier.emit('crn', parcelSerialized);
                }

                // Not need to keep the cargo if we got to this point
                fs.unlinkSync(cargoFilePath);
            });
        });
        relayerClient.init();
    });

    server.on('error', function (err) {
        console.error('Error found; throwing it...');
        throw err;
    });

    server.listen(socketPath);
}

module.exports = {
    runServer,
};
