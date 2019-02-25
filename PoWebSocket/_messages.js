'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const _ = require('lodash');
const assert = require('assert').strict;
const protobuf = require('protobufjs');

const root = protobuf.loadSync(__dirname + '/powebsocket.proto');

const ParcelDelivery = root.lookupType('relaynet.powebsocket.ParcelDelivery');
const ParcelDeliveryAck = root.lookupType('relaynet.powebsocket.ParcelDeliveryAck');
const ParcelCollectionRequest = root.lookupType('relaynet.powebsocket.ParcelCollectionRequest');
const ParcelDeliveryComplete = root.lookupType('relaynet.powebsocket.ParcelDeliveryComplete');
const Quit = root.lookupType('relaynet.powebsocket.Quit');

const TYPE_BY_TAG = {
    0: ParcelDelivery,
    1: ParcelDeliveryAck,
    2: ParcelCollectionRequest,
    3: ParcelDeliveryComplete,
    7: Quit,
};
const TAG_BY_TYPE = _.invert(TYPE_BY_TAG);

/**
 * @param {Message} message
 * @return {Buffer}
 */
function serializeMessage(message) {
    const tag = TAG_BY_TYPE[message.$type];
    assert(tag !== undefined);
    const tagSerialized = Buffer.from([tag]);
    const payloadSerialized = message.$type.encode(message).finish();
    return Buffer.concat([tagSerialized, payloadSerialized]);
}

/**
 * @param {Buffer} messageSerialized
 * @return {Message}
 */
function deserializeMessage(messageSerialized) {
    assert(0 < messageSerialized.length, 'Message cannot be empty');
    const tag = messageSerialized[0];
    const type = TYPE_BY_TAG[tag];
    assert(type !== undefined);
    const payloadSerialized = messageSerialized.slice(1);
    const payload = type.decode(payloadSerialized);
    const verificationError = type.verify(payload);
    if (verificationError) {
        assert.fail(verificationError);
    }
    return payload;
}

module.exports = {
    serializeMessage,
    deserializeMessage,
    ParcelDelivery,
    ParcelDeliveryAck,
    ParcelCollectionRequest,
    ParcelDeliveryComplete,
    Quit,
};
