'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const uuid4 = require('uuid4');

/**
 * @param {Array<Object<{id: string, parcel: Buffer}>>} parcelsSerialized
 * @param {ClientDuplexStream|ServerDuplexStream} grpcCall
 * @param {EventEmitter|null} parcelNotifier
 * @returns {Promise<void>}
 */
function deliverParcels(parcelsSerialized, grpcCall, parcelNotifier = null) {
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

            if (parcelNotifier) {
                parcelNotifier.emit('pdnCollection', parcelId);
            }
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
    deliverParcels,
};
