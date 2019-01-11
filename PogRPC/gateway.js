'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync(
    __dirname + '/pogrpc.proto',
    {keepCase: true},
);
const pogrpcPackage = grpc.loadPackageDefinition(packageDefinition).relaynet.pogrpc;

function deliverParcel(call, callback) {
    // TODO: Actually implement
    console.log('Got parcel ', call.request.id);
    callback(null, {});
}

function collectParcels(call) {
    // TODO: Actually implement
    const parcels = [];
    for (let parcel of parcels) {
        call.write({id: 42, parcel: Buffer.from('Answer to all questions')});
    }
    call.end();
}

function runServer(ip = '127.0.0.1', port = 21473) { // 21473? Too late!
    const server = new grpc.Server();
    server.addService(pogrpcPackage.PogRPC.service, {
        deliverParcel,
        collectParcels,
    });
    server.bind(`${ip}:${port}`, grpc.ServerCredentials.createInsecure());
    server.start();
}

module.exports = {
    runServer,
};
