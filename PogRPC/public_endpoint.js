'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

// PogRPC public endpoint.

const grpc = require('grpc');
const grpcProtoLoader = require('@grpc/proto-loader');
const {PARCEL_SERIALIZER} = require('../core/serialization');

const pogrpcPackageDefinition = grpcProtoLoader.loadSync(
    __dirname + '/pogrpc.proto',
    {keepCase: true},
);
const pogrpcPackage = grpc.loadPackageDefinition(pogrpcPackageDefinition).relaynet.pogrpc;

/**
 * Start a public endpoint server.
 *
 * @param {string} netloc
 * @param {Buffer} serverCert PEM-encoded X.509 cert for the HTTP server
 * @param {Buffer} serverKey PEM-encoded private key for `serverCert`
 * @param {string} endpointKeyPath
 * @param {function(Buffer): Message} messageDeserializer
 * @param {function(Message, Buffer, string)} messageProcessor Function to call with the message extracted from a parcel
 */
function runServer(netloc, serverCert, serverKey, endpointKeyPath, messageDeserializer, messageProcessor) {
    const server = new grpc.Server();
    server.addService(pogrpcPackage.PogRPC.service, {
        deliverParcels(call) {
            // Zero or one gateway must be present. Multiple values MUST be rejected in production.
            const relayingGatewayAddress = (call.metadata.get('Gateway') || [null])[0].toString();

            call.on('data', async function (parcelDelivery) {
                const parcel = await PARCEL_SERIALIZER.deserialize(parcelDelivery.parcel);

                // Pretend the parcel labels were successfully validated at this point.

                const parcelPayload = await parcel.decryptPayload(endpointKeyPath);
                const message = messageDeserializer(parcelPayload);
                await messageProcessor(message, parcel.senderCert, relayingGatewayAddress);

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
    runServer,
};
