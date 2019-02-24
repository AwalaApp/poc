'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const {deliverParcels} = require('./_streaming');

const packageDefinition = protoLoader.loadSync(
    __dirname + '/pogrpc.proto',
    {keepCase: true},
);
const pogrpcPackage = grpc.loadPackageDefinition(packageDefinition).relaynet.pogrpc;

function collectParcels(call, parcelNotifier) {
    call.on('data', function (parcelDelivery) {
        parcelNotifier.emit('pdc', parcelDelivery.parcel);
        call.write({id: parcelDelivery.id}); // ACK
    });

    call.on('end', function () {
        call.end();
    });
}

/**
 * @param {string} netloc
 * @param {EventEmitter} parcelNotifier
 * @param {null|function():AsyncIterableIterator<Iterable<Buffer>>} parcelCollector
 */
function runServer(netloc, parcelNotifier, parcelCollector = null) {
    const server = new grpc.Server();
    server.addService(pogrpcPackage.PogRPC.service, {
        deliverParcels(call) {
            collectParcels(call, parcelNotifier);
        },
        async collectParcels(call) {
            if (!parcelCollector) {
                // Parcels can't be collected from this gateway.
                // Presumably it's a relaying gateway.
                call.end();
                return;
            }
            const parcelsSerialized = [];
            for await (const parcelDelivery of parcelCollector()) {
                parcelsSerialized.push(parcelDelivery);
            }
            await deliverParcels(parcelsSerialized, call, parcelNotifier);
        },
    });
    server.bind(netloc, grpc.ServerCredentials.createInsecure());
    server.start();
}

module.exports = {
    runServer,
};
