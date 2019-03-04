'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const cms = require('../_cms');
const protobuf = require('protobufjs');
const uuid4 = require('uuid4');
const {getAddressFromCert} = require('../core/pki');

const root = protobuf.loadSync(__dirname + '/powebsocket.handshake.proto');

const Challenge = root.lookupType('relaynet.powebsocket.handshake.Challenge');
const Response = root.lookupType('relaynet.powebsocket.handshake.Response');
const Complete = root.lookupType('relaynet.powebsocket.handshake.Complete');

/**
 * @param {Message} message
 * @return {Uint8Array}
 */
function serialize(message) {
    return message.$type.encode(message).finish();
}

/**
 * @param {Buffer} messageSerialized
 * @param {Type} messageType
 * @return {Message}
 */
function deserialize(messageSerialized, messageType) {
    const message = messageType.decode(messageSerialized);
    const verificationError = messageType.verify(message);
    if (verificationError) {
        throw verificationError;
    }
    return message;
}

const STATES = {
    CHALLENGE: 1,
    RESPONSE: 2,
    COMPLETE: 3,
};

/**
 * @param {WebSocket} connection
 * @param {Array<Object<{cert: Buffer, key: Buffer}>>} endpointCerts
 * @return {Promise<void>}
 */
function runClientHandshake(connection, endpointCerts) {
    return new Promise(async (resolve, reject) => {
        let nextState = STATES.CHALLENGE;

        function sendMessage(message) {
            const messageSerialized = serialize(message);
            return new Promise((resolve, reject) => {
                try {
                    connection.send(messageSerialized, (error) => {
                        if (error) {
                            reject(error)
                        }
                    });
                } catch (error) {
                    return reject(error);
                }

                resolve();
            });
        }

        async function resumeHandshake(message) {
            switch (nextState) {
                case STATES.CHALLENGE:
                    const challenge = deserialize(message, Challenge);
                    const gatewayNonceSignatures = [];
                    for (const {cert, key} of endpointCerts) {
                        gatewayNonceSignatures.push(await cms.sign(
                            Buffer.from(challenge.gatewayNonce),
                            key,
                            cert,
                            'sha256',
                            true,
                        ));
                    }

                    const response = Response.create({gatewayNonceSignatures});
                    try {
                        sendMessage(response);
                    } catch (error) {
                        reject(error);
                        return;
                    }

                    nextState = STATES.COMPLETE;
                    break;

                case STATES.COMPLETE:
                    connection.off('message', resumeHandshake);
                    const completeMessage = deserialize(message, Complete);

                    if (completeMessage.success === true) {
                        resolve();
                    } else {
                        reject(new Error('Handshake did not complete successfully'));
                    }

                    break;

                default:
                    reject(new Error(`Invalid handshake state ${nextState}`));
            }

        }

        connection.on('message', resumeHandshake);
    });
}

function runServerHandshake(connection, postHandshakeCallback) {
    const nonce = uuid4();

    async function processResponse(messageSerialized) {
        const responseMessage = deserialize(messageSerialized, Response);
        for (const signature of responseMessage.gatewayNonceSignatures) {
            let signerCert;
            try {
                signerCert = await cms.verifySignature(Buffer.from(nonce), signature);
            } catch (error) {
                console.warn('Invalid nonce signature', error);
                connection.close();
                return;
            }
            console.log(`[PDC] Endpoint ${getAddressFromCert(signerCert)} connected.`);
        }

        const completeMessage = Complete.create({success: true});
        connection.send(serialize(completeMessage));

        postHandshakeCallback();
        connection.off('message', processResponse);
    }

    connection.on('message', processResponse);

    const challenge = Challenge.create({gatewayNonce: nonce});
    connection.send(serialize(challenge));
}

module.exports = {
    runClientHandshake,
    runServerHandshake,
};
