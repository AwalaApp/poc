'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const protobuf = require('protobufjs');

const root = protobuf.loadSync(__dirname + '/twitter.proto');

const TwitterCredentials = root.lookupType('twitter.relaynet_poc.TwitterCredentials');
const TweetMessage = root.lookupType('twitter.relaynet_poc.Tweet');

module.exports = {
    TwitterCredentials,
    TweetMessage,
};
