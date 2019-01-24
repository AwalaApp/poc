'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const Twitter = require('twitter-lite');
const pogrpcEndpoint = require('../PogRPC/host_endpoint');
const {TweetMessage} = require('./messages');

require('dotenv').config();

function processTweet(message) {
    const invalidTweetError = TweetMessage.verify(message);
    if (invalidTweetError) {
        // TODO: Reply with an error contained in a parcel
        throw invalidTweetError;
    }

    // NB: In the final implementation, we should actually queue the message and acknowledge its receipt -- instead of doing things synchronously like an RPC!
    // return callback(null, {});

    const tweetMsg = TweetMessage.decode(message);

    const twitterClient = new Twitter({
        subdomain: "api",
        consumer_key: process.env.TWITTER_CONSUMER_KEY,
        consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
        access_token_key: tweetMsg.credentials.accessTokenKey,
        access_token_secret: tweetMsg.credentials.accessTokenSecret,
    });
    twitterClient
        .post('statuses/update', {status: tweetMsg.status})
        .catch((error) => {
            // TODO: Send error message to origin endpoint.
            console.log('Could not post tweet', error);
        });
}

function runServer(netloc, serverCert, serverKey, endpointKeyPath) {
    pogrpcEndpoint.runHost(netloc, serverCert, serverKey, endpointKeyPath, processTweet);
}

module.exports = {
    runServer,
};
