'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const grpc = require('grpc');
const Twitter = require('twitter-lite');
const protobuf = require('protobufjs/light');

require('dotenv').config();

const twitterProto = protobuf.loadSync(__dirname + '/twitter.proto');

const TweetMessage = twitterProto.lookupType('twitter.relaynet_poc.Tweet');

function deliverParcel(call, callback) {
    // TODO: Implement -- I haven't actually tested this.
    const invalidTweetError = TweetMessage.verify(call.request);
    if (invalidTweetError) {
        return callback(invalidTweetError);
    }

    // NB: In the final implementation, we should actually queue the message and acknowledge its receipt -- instead of doing things synchronously like an RPC!
    // return callback(null, {});

    const tweetMsg = TweetMessage.create(call.request);

    const twitterClient = new Twitter({
        subdomain: "api",
        consumer_key: process.env.TWITTER_CONSUMER_KEY,
        consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
        access_token_key: tweetMsg.access_token_key,
        access_token_secret: tweetMsg.access_token_secret,
    });
    twitterClient
        .post("statuses/update", {status: tweetMsg.status})
        .catch((error) => {
            // TODO: Send error message to origin endpoint.
        });

    callback(null, {});
}

function runServer(ip = '127.0.0.1', port = 8080) {
    const server = new grpc.Server();
    server.addService(pogrpcPackage.PogRPC.service, {deliverParcel});
    server.bind(`${ip}:${port}`, grpc.ServerCredentials.createInsecure());
    server.start();
}
