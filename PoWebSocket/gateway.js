'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const fs = require('fs');
const http = require('http');
const messages = require('./_messages');
const uuid4 = require('uuid4');
const ws = require('ws');

function configureConnection(connection, parcelNotifier, parcelCollector) {
    // TODO: Listen for new parcels in parcelNotifier

    const parcelByPendingDeliveryIds = {};
    let parcelCollectionRequested = false;

    connection.on('message', async function (messageSerialized) {
        const message = messages.deserializeMessage(messageSerialized);
        switch (message.$type) {
            case messages.ParcelDelivery:
                parcelNotifier.emit('pdc', message.parcel);
                const ack = messages.ParcelDeliveryAck.create({id: message.id});
                connection.send(messages.serializeMessage(ack));
                break;

            case messages.ParcelDeliveryAck:
                const parcelId = parcelByPendingDeliveryIds[message.id];
                if (parcelId === undefined) {
                    console.log(`Got ACK for unknown parcel (${message.id})`);
                    connection.close();
                    break;
                }
                parcelNotifier.emit('pdcCollection', parcelId);
                delete parcelByPendingDeliveryIds[message.id];
                break;

            case messages.ParcelCollectionRequest:
                parcelCollectionRequested = true;
                for await (const {id, parcel} of parcelCollector()) {
                    const parcelDeliveryId = uuid4();
                    const parcelDelivery = messages.ParcelDelivery.create({id: parcelDeliveryId, parcel});
                    parcelByPendingDeliveryIds[parcelDeliveryId] = id;
                    connection.send(messages.serializeMessage(parcelDelivery));
                }
                connection.send(messages.serializeMessage(messages.ParcelDeliveryComplete.create({})));
                break;
        }
    });
}

/**
 * @param {string} socketPath
 * @param {EventEmitter} parcelNotifier
 * @param {function():AsyncIterableIterator<Iterable<Buffer>>} parcelCollector
 */
function runUnixSocketServer(socketPath, parcelNotifier, parcelCollector) {
    if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
    }

    const httpServer = http.createServer();
    httpServer.listen(socketPath, function () {
        const wsServer = new ws.Server({server: httpServer});

        wsServer.on('connection', function (connection) {
            configureConnection(connection, parcelNotifier, parcelCollector)
        });
    })
}

module.exports = {
    runUnixSocketServer,
};
