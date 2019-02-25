'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const uuid4 = require('uuid4');

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

/**
 * @param {Array<Object<{id: string, parcel: Buffer}>>} parcelsSerialized
 * @param {ClientDuplexStream|ServerDuplexStream} grpcCall
 * @param {EventEmitter|null} parcelNotifier
 * @returns {Promise<void>}
 */
function deliverParcels(parcelsSerialized, grpcCall, parcelNotifier) {
    // The final implementation should actually work with streams instead of loading everything in
    // memory and doing so much stuff synchronously.

    const parcelByPendingDeliveryIds = {};
    let allParcelsSent = false;

    return new Promise((resolve, reject) => {
        grpcCall.on('data', function (deliveryAck) {
            const parcelId = parcelByPendingDeliveryIds[deliveryAck.id];
            if (parcelId === undefined) {
                grpcCall.end();
                reject(new Error(`Got ACK for unknown parcel (${deliveryAck.id})`));
                return;
            }

            parcelNotifier.emit('pdcCollection', parcelId);
            delete parcelByPendingDeliveryIds[deliveryAck.id];

            if (allParcelsSent && Object.keys(parcelByPendingDeliveryIds).length === 0) {
                grpcCall.end();
                resolve();
            }
        });

        grpcCall.on('error', reject);

        grpcCall.on('end', function () {
            grpcCall.end();
        });

        let anyParcelsSent;
        for (const {id, parcel} of parcelsSerialized) {
            const parcelDeliveryId = uuid4();
            grpcCall.write({id: parcelDeliveryId, parcel});
            parcelByPendingDeliveryIds[parcelDeliveryId] = id;
            anyParcelsSent = true;
        }
        allParcelsSent = true;

        if (!anyParcelsSent) {
            grpcCall.end();
        }
    });
}

module.exports = {
    runServer,
};
