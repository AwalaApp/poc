'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

// Client/SDK for the PogRPC gateway.

const grpc = require('grpc');
const grpcProtoLoader = require('@grpc/proto-loader');
const uuid4 = require('uuid4');

const pogrpcPackageDefinition = grpcProtoLoader.loadSync(
    __dirname + '/pogrpc.proto',
    {keepCase: true},
);
const PogRPCService = grpc.loadPackageDefinition(pogrpcPackageDefinition).relaynet.pogrpc.PogRPC;

class PogRPCClient {

    /**
     * @param {string} targetEndpointNetloc
     * @param {null|string} gatewayAddress The relaying gateway's address, if applicable.
     * @param {boolean|Buffer} tls Whether to use TLS, and if so, optionally which self-signed cert to use
     */
    constructor(targetEndpointNetloc, gatewayAddress = null, tls = true) {
        const cert = (Buffer.isBuffer(tls)) ? tls : null;
        const credentials = (tls) ? grpc.credentials.createSsl(cert) : grpc.credentials.createInsecure();
        this._grpcClient = new PogRPCService(targetEndpointNetloc, credentials);

        this._grpcMetadata = new grpc.Metadata();
        if (gatewayAddress) {
            this._grpcMetadata.add('Gateway', gatewayAddress);
        }
    }

    close() {
        this._grpcClient.close();
    }

    /**
     * @param {Array<Buffer>} parcelsSerialized
     * @returns {Promise<void>}
     */
    async deliverParcels(parcelsSerialized) {
        const call = this._grpcClient.deliverParcels(this._grpcMetadata, {deadline: new Date(Date.now() + 20000)});
        // In production, this function should also be a generator that yields the id
        // of each parcel that's acknowledged by the server.
        await deliverParcels(parcelsSerialized, call);
    }

    /**
     * @returns {Promise<Array<Buffer>>}
     */
    collectParcels() {
        // The final implementation should actually work with streams instead of loading everything in
        // memory and doing so much stuff synchronously.
        const receivedParcels = [];
        const self = this;

        return new Promise(function (resolve, reject) {
            const call = self._grpcClient.collectParcels();

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
}

/**
 * @param {Array<Buffer>} parcelsSerialized
 * @param {ClientDuplexStream} grpcCall
 * @returns {Promise<void>}
 */
function deliverParcels(parcelsSerialized, grpcCall) {
    // The final implementation should actually work with streams instead of loading everything in
    // memory and doing so much stuff synchronously.

    const pendingDeliveryIds = new Set();
    let allParcelsSent = false;

    return new Promise((resolve, reject) => {
        grpcCall.on('data', function (deliveryAck) {
            if (!pendingDeliveryIds.has(deliveryAck.id)) {
                grpcCall.end();
                reject(new Error(`Got ACK for unknown parcel (${deliveryAck.id})`));
                return;
            }

            pendingDeliveryIds.delete(deliveryAck.id);

            if (allParcelsSent && pendingDeliveryIds.size === 0) {
                grpcCall.end();
                resolve();
            }
        });

        grpcCall.on('error', reject);

        grpcCall.on('end', function () {
            grpcCall.end();
        });

        for (const parcel of parcelsSerialized) {
            const parcelDeliveryId = uuid4();
            grpcCall.write({id: parcelDeliveryId, parcel});
            pendingDeliveryIds.add(parcelDeliveryId);
        }
        allParcelsSent = true;

        if (pendingDeliveryIds.size === 0) {
            grpcCall.end();
            resolve();
        }
    });
}

module.exports = PogRPCClient;
