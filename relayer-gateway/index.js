'use strict';
// Remember this is a proof of concept! The code below is ugly and has no tests.

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const {Authentication, Cargo} = require('../relay/messages');
const {RelayerStream} = require('../relay/relayer-transformer');

const _SOCKET_PATH = '/tmp/relayer-gateway.sock';
const _INCOMING_CARGOES_DIR = '/tmp/incoming-cargoes';

const server = net.createServer(function (client) {
    const relayerClient = new RelayerStream(client);
    relayerClient.on('data', function (data) {
        if (data instanceof Authentication) {
        } else if (data instanceof Cargo) {
            const cargoFileName = crypto.randomBytes(16).toString("hex") + '.cargo';
            const cargoFileStream = fs.createWriteStream(`${_INCOMING_CARGOES_DIR}/${cargoFileName}`);
            data.stream.pipe(cargoFileStream);
        } else {
            console.log('Got', data);
        }
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
