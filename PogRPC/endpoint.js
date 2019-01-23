'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

// PogRPC Endpoint for Node.js.

const grpc = require('grpc');
const grpcProtoLoader = require('@grpc/proto-loader');
const {PARCEL_SERIALIZER} = require('../messages/serialization');

const pogrpcPackageDefinition = grpcProtoLoader.loadSync(
    __dirname + '/pogrpc.proto',
    {keepCase: true},
);
const pogrpcPackage = grpc.loadPackageDefinition(pogrpcPackageDefinition).relaynet.pogrpc;

/**
 * Start a _host endpoint_.
 *
 * @param {string} netloc
 * @param {Buffer} serverCert PEM-encoded X.509 cert for the HTTP server
 * @param {Buffer} serverKey PEM-encoded private key for `serverCert`
 * @param {string} endpointKeyPath
 * @param messageProcessor Function to call with each message extracted from a parcel
 */
function runHost(netloc, serverCert, serverKey, endpointKeyPath, messageProcessor) {
    const server = new grpc.Server();
    server.addService(pogrpcPackage.PogRPC.service, {
        deliverParcels(call) {
            call.on('data', async function (parcelDelivery) {
                const parcel = await PARCEL_SERIALIZER.deserialize(parcelDelivery.parcel);

                // Pretend the parcel labels were successfully validated at this point.

                await messageProcessor(await parcel.decryptPayload(endpointKeyPath));

                call.write({id: parcelDelivery.id}); // ACK
            });

            call.on('end', function () {
                call.end();
            });
        }
    });

    server.bind(netloc, grpc.ServerCredentials.createSsl(null, [{private_key: serverKey, cert_chain: serverCert}]));

    server.start();
}

module.exports = {
    runHost,
};
