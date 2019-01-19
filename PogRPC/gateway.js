'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync(
    __dirname + '/pogrpc.proto',
    {keepCase: true},
);
const pogrpcPackage = grpc.loadPackageDefinition(packageDefinition).relaynet.pogrpc;

// Yup. This is the "database". And it's not even synchronized on disk. (It's a PoC!)
const PARCELS_DB = {};

function deliverParcels(call) {
    call.on('data', function (parcelDelivery) {
        PARCELS_DB[parcelDelivery.id] = parcelDelivery.parcel;
        call.write({id: parcelDelivery.id}); // ACK
    });

    call.on('end', function () {
        call.end();
    });
}

function collectParcels(call) {
    if (Object.keys(PARCELS_DB).length === 0) {
        call.end();
        return;
    }

    const pendingAckParcelIds = new Set();

    call.on('data', function (deliveryAck) {
        if (pendingAckParcelIds.has(deliveryAck.id)) {
            delete PARCELS_DB[deliveryAck.id];
            pendingAckParcelIds.delete(deliveryAck.id);
        }
    });

    call.on('end', function () {
        call.end();
    });

    for (const [parcelId, parcel] of Object.entries(PARCELS_DB)) {
        call.write({id: parcelId, parcel});
        pendingAckParcelIds.add(parcelId);
    }

    call.on('data', function () {
        if (pendingAckParcelIds.size === 0) {
            call.end();
        }
    });

    setTimeout(() => {
        if (0 < pendingAckParcelIds.size) {
            call.end();
            console.error('Endpoint took too long to acknowledge all parcel collections');
            // This should be propagated to the app in the final implementation so
            // it can queue a retry for the unacknowledged parcels if necessary
        }
    }, 2000);
}

function runServer(ip = '127.0.0.1', port = 21473) { // 21473? Too late!
    const server = new grpc.Server();
    server.addService(pogrpcPackage.PogRPC.service, {
        deliverParcels,
        collectParcels,
    });
    server.bind(`${ip}:${port}`, grpc.ServerCredentials.createInsecure());
    server.start();
}

module.exports = {
    runServer,
};
