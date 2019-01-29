'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const path = require('path');
const {TwitterCredentials, TweetMessage} = require('./service_messages');

// Clients still have to ship with the target endpoint's certificate in production.
// This is just an initial certificate and it can be rotated subsequently, after
// the two endpoints have established a secure session (per RS-003).
const TWITTER_API_ENDPOINT_CERT_PATH = path.normalize(__dirname + '/../certs/twitter-endpoint.cert.pem');

// Don't bother posting a tweet if more than 7 days have elapsed since its creation
const TWEET_TTL_DAYS = 7 * 86400;

class TwitterClient {
    /**
     * @param {string} accessTokenKey
     * @param {string} accessTokenSecret
     * @param {ClientEndpoint} endpoint
     */
    constructor(accessTokenKey, accessTokenSecret, endpoint) {
        this._credentialsMessage = TwitterCredentials.create({
            accessTokenKey,
            accessTokenSecret,
        });
        this._endpoint = endpoint;
    }

    /**
     * @param {TweetMessage} tweetMessage
     * @returns {Promise<void>}
     */
    async postTweet(tweetMessage) {
        tweetMessage.credentials = this._credentialsMessage;
        await this._endpoint.deliverMessage(
            tweetMessage,
            TWITTER_API_ENDPOINT_CERT_PATH,
            {ttl: TWEET_TTL_DAYS},
        );
    }
}

module.exports = TwitterClient;
