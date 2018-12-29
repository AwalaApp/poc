'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const fs = require('fs');
const net = require('net');
const {serializeVarbigint, serializeVarchar} = require('../utils/primitives');
const {promisify} = require('util');
const fsStat = promisify(fs.stat);

const _SOCKET_PATH = '/tmp/relayer-gateway.sock';
const _OUTGOING_CARGOES_PATH = __dirname + '/sample-cargoes';

const client = net.createConnection(_SOCKET_PATH, async function () {
    const cargoFileNames = await promisify(fs.readdir)(_OUTGOING_CARGOES_PATH);
    for (let cargoFileName of cargoFileNames) {
        await unloadCargo(`${_OUTGOING_CARGOES_PATH}/${cargoFileName}`, client);
    }

    client.end();
});

async function unloadCargo(cargoFilePath, client) {
    await writeCargoUnloadHeader(cargoFilePath, client);
    await pipeFileToSocket(cargoFilePath, client);
}

async function writeCargoUnloadHeader(cargoFilePath, client) {
    client.write('C'); // Message tag

    // The cargo id. Using the full path for expediency but should be something else.
    client.write(serializeVarchar(cargoFilePath));

    const cargoStat = await fsStat(cargoFilePath);
    client.write(serializeVarbigint(cargoStat.size));
}

function pipeFileToSocket(filePath, targetSocket) {
    const stream = fs.createReadStream(filePath);
    return new Promise((resolve, reject) => {
        stream.on('close', resolve);
        stream.on('error', reject);

        stream.pipe(targetSocket, {end: false});
    });
}

client.on('data', (data) => {
    console.log(data.toString());
    client.end();
});

client.on('error', (err) => {
    console.log('Error found; throwing it...');
    throw err;
});

client.on('end', () => {
    console.log('Disconnected from server');
});
