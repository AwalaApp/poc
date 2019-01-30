'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const assert = require('assert').strict;
const protobuf = require('protobufjs');
const {deserializeServiceMessage, serializeServiceMessage} = require('../core/serialization');
const {ServiceMessage} = require('../core/messages');

const root = protobuf.loadSync(__dirname + '/twitter.proto');

const TwitterCredentials = root.lookupType('twitter.relaynet_poc.TwitterCredentials');

/**
 * @type {Type}
 * @extends {Message}
 */
const TweetMessage = root.lookupType('twitter.relaynet_poc.Tweet');

/**
 * @type {Type}
 * @extends {Message}
 */
const HomeTimelineSubscription = root.lookupType('twitter.relaynet_poc.HomeTimelineSubscription');

/**
 * @param {Message} message
 * @return {Buffer}
 */
function serializeMessage(message) {
    const typePath = `twitter.relaynet_poc.${message.$type.name}`;
    const messageType = root.lookupType(typePath);
    const messageSerialized = messageType.encode(message).finish();
    const mediaType = `application/x-protobuf; messageType="${typePath}"`;
    const serviceMessage = new ServiceMessage(messageSerialized, mediaType);
    return serializeServiceMessage(serviceMessage);
}

/**
 * @param {Buffer} messageSerialized
 * @return {Message}
 */
function deserializeMessage(messageSerialized) {
    const serviceMessage = deserializeServiceMessage(messageSerialized);
    const mediaType = serviceMessage.type.match(/^application\/x-protobuf;\s*messageType="(?<messageType>[^"]+)"$/);
    assert(mediaType, 'Service messages are serialized with protobuf');
    assert(
        mediaType.groups.messageType.match(/^twitter\.relaynet_poc\.\w+$/),
        'Service messages must be in the "twitter.relaynet_poc" protobuf package',
    );
    const messageType = root.lookupType(mediaType.groups.messageType);
    const message = messageType.decode(serviceMessage.messageSerialized);
    const verificationError = messageType.verify(message);
    if (verificationError) {
        assert.fail(verificationError);
    }
    return message;
}

module.exports = {
    HomeTimelineSubscription,
    TwitterCredentials,
    TweetMessage,
    deserializeMessage,
    serializeMessage,
};
