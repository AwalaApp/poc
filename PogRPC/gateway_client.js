'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

// Client/SDK for the PogRPC gateway.

const grpc = require('grpc');
const grpcProtoLoader = require('@grpc/proto-loader');
const {createHash} = require('crypto');

const pogrpcPackageDefinition = grpcProtoLoader.loadSync(
    __dirname + '/pogrpc.proto',
    {keepCase: true},
);
const pogrpcPackage = grpc.loadPackageDefinition(pogrpcPackageDefinition).relaynet.pogrpc;

/**
 * Create a gRPC client to a PogRPC server.
 *
 * @param netloc
 * @param {boolean|Buffer} tls Whether to use TLS, and if so, optionally which
 *        self-signed cert to use
 * @returns {grpc.Client}
 */
function makeClient(netloc = 'localhost:21473', tls = true) {
    const cert = (Buffer.isBuffer(tls)) ? tls : null;
    const credentials = (tls) ? grpc.credentials.createSsl(cert) : grpc.credentials.createInsecure();
    return new pogrpcPackage.PogRPC(netloc, credentials);
}

function deliverParcels(parcels, client) {
    // The final implementation should actually work with streams instead of loading everything in
    // memory and doing so much stuff synchronously.

    const sentParcelIds = new Set();
    let allParcelsSent = false;

    return new Promise((resolve, reject) => {
        const call = client.deliverParcels();

        call.on('data', function (deliveryAck) {
            if (!sentParcelIds.has(deliveryAck.id)) {
                call.end();
                reject(new Error(`Got ACK for unknown parcel (${deliveryAck.id})`));
                return;
            }

            sentParcelIds.delete(deliveryAck.id);

            if (sentParcelIds.size === 0 && allParcelsSent) {
                call.end();
                resolve();
            }
        });

        call.on('error', reject);

        call.on('end', function () {
            call.end();
        });

        for (let parcel of parcels) {
            const parcelId = createHash('sha1').update(parcel).digest('hex');
            call.write({id: parcelId, parcel});
            sentParcelIds.add(parcelId);
        }
        allParcelsSent = true;

        setTimeout(() => {
            call.end();
            reject(new Error('Timed out'));
            // This should be propagated to the app in the final implementation so
            // it can queue a retry for the unacknowledged parcels if necessary
        }, 2000);
    });
}

function collectParcels(client) {
    // The final implementation should actually work with streams instead of loading everything in
    // memory and doing so much stuff synchronously.
    const receivedParcels = [];

    return new Promise(function (resolve, reject) {
        const call = client.collectParcels();

        call.on('data', function (parcelDelivery) {
            receivedParcels.push(parcelDelivery.parcel);

            // The final implementation probably shouldn't send the ACK until the app
            // has received and processed the parcel.
            call.write({id: parcelDelivery.id});
        });

        call.on('end', function () {
            call.end();
            resolve(receivedParcels);
        });

        call.on('error', function (error) {
            reject(error);
            call.end();
        });
    });
}

module.exports = {
    makeClient,
    deliverParcels,
    collectParcels,
};
