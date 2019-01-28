'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const Twitter = require('twitter-lite');
const {TweetMessage} = require('./service_messages');

require('dotenv').config();

const POLLING_FREQUENCY_SECONDS = 90;

async function main(apiAdapter, subscriptionNotifier) {
    const users = {};

    subscriptionNotifier.on('subscription', function (twitterCredentials, targetEndpointCert, parcelDeliveryAuthCert, relayEndpoint) {
        let user = users[twitterCredentials.accessTokenKey];
        if (!user) {
            user = new User(twitterCredentials.accessTokenKey, twitterCredentials.accessTokenSecret);
            users[twitterCredentials.accessTokenKey] = user;
        }

        user.addSubscription(new EndpointSubscription(
            targetEndpointCert,
            parcelDeliveryAuthCert,
            relayEndpoint,
        ));
    });

    while (true) {
        await sleep(POLLING_FREQUENCY_SECONDS);

        for (const user of Object.values(users)) {
            console.log('Checking updates...');
            await user.deliverUpdates(apiAdapter);
        }
    }
}

class EndpointSubscription {
    constructor(targetEndpointCert, parcelDeliveryAuthCert, relayEndpoint) {
        this._targetEndpointCert = targetEndpointCert;
        this._parcelDeliveryAuthCert = parcelDeliveryAuthCert;
        this._relayEndpoint = relayEndpoint;
    }

    async deliverMessage(messageSerialized, apiAdapter) {
        await apiAdapter.deliverMessage(
            messageSerialized,
            this._targetEndpointCert,
            this._relayEndpoint,
            this._parcelDeliveryAuthCert,
        );
    }
}

class User {
    constructor(accessTokenKey, accessTokenSecret) {
        this._accessTokenKey = accessTokenKey;
        this._accessTokenSecret = accessTokenSecret;
        this._endpointSubscriptions = [];
    }

    addSubscription(subscription) {
        this._endpointSubscriptions.push(subscription);
    }

    async deliverUpdates(apiAdapter) {
        const tweets = await this._pollTimeline();
        for (const tweet of tweets) {
            const tweetMsg = TweetMessage.create({
                creationDate: new Date(tweet.created_at),
                status: tweet.text,
                author: `@${tweet.user.screen_name}`,
            });
            const tweetMsgSerialized = TweetMessage.encode(tweetMsg).finish();
            await this._deliverMessage(tweetMsgSerialized, apiAdapter);
        }
    }

    async _deliverMessage(messageSerialized, apiAdapter) {
        for (const subscription of this._endpointSubscriptions) {
            await subscription.deliverMessage(messageSerialized, apiAdapter);
        }
    }

    async _pollTimeline() {
        const twitterClient = new Twitter({
            subdomain: "api",
            consumer_key: process.env.TWITTER_CONSUMER_KEY,
            consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
            access_token_key: this._accessTokenKey,
            access_token_secret: this._accessTokenSecret,
        });
        return await twitterClient.get('statuses/home_timeline');
    }
}

function sleep(timeoutSeconds) {
    return new Promise(resolve => setTimeout(resolve, timeoutSeconds * 1000));
}

module.exports = main;
