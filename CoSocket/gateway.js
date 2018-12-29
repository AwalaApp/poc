'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const {serializeVarchar} = require('./_primitives');
const {RelayerStream} = require('./_stream');

const _SOCKET_PATH = '/tmp/relayer-gateway.sock';
const _INCOMING_CARGOES_DIR = '/tmp/incoming-cargoes';

const server = net.createServer(function (client) {
    const relayerClient = new RelayerStream(client);
    relayerClient.on('data', function (cargo) {
        const cargoFileName = crypto.randomBytes(16).toString("hex") + '.cargo';
        const cargoFileStream = fs.createWriteStream(`${_INCOMING_CARGOES_DIR}/${cargoFileName}`);
        cargoFileStream.on('finish', () => {
            // This should call fdatasync() in real life

            if (!client.destroyed) {
                client.write('c');
                client.write(serializeVarchar(cargo.id));
            }
        });
        cargo.stream.pipe(cargoFileStream);
    });
    relayerClient.init();
});

server.on('error', function (err) {
    console.log('Error found; throwing it...');
    throw err;
});

if (fs.existsSync(_SOCKET_PATH)) {
    fs.unlinkSync(_SOCKET_PATH);
}
if (!fs.existsSync(_INCOMING_CARGOES_DIR)) {
    fs.mkdirSync(_INCOMING_CARGOES_DIR);
}
server.listen(_SOCKET_PATH);
