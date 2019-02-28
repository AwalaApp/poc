'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const cms = require('../_cms');
const protobuf = require('protobufjs');
const uuid4 = require('uuid4');
const {getAddressFromCert} = require('../core/pki');
const {pemCertToDer} = require('../_asn1_utils');

const root = protobuf.loadSync(__dirname + '/powebsocket.handshake.proto');

const Start = root.lookupType('relaynet.powebsocket.handshake.Start');
const GatewayResponse = root.lookupType('relaynet.powebsocket.handshake.GatewayResponse');
const EndpointResponse = root.lookupType('relaynet.powebsocket.handshake.EndpointResponse');
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
    START: 0,
    GATEWAY_RESPONSE: 1,
    ENDPOINT_RESPONSE: 2,
    COMPLETE: 3,
};

/**
 * @param {WebSocket} connection
 * @param {Array<Object<{cert: Buffer, key: Buffer}>>} endpointCerts
 * @return {Promise<void>}
 */
function runClientHandshake(connection, endpointCerts) {
    return new Promise(async (resolve, reject) => {
        let nextState = STATES.GATEWAY_RESPONSE;

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
                case STATES.GATEWAY_RESPONSE:
                    const gwResponse = deserialize(message, GatewayResponse);
                    const gatewayNonceSignatures = {};
                    for (const {cert, key} of endpointCerts) {
                        const address = getAddressFromCert(cert);
                        gatewayNonceSignatures[address] = await cms.sign(
                            Buffer.from(gwResponse.gatewayNonce),
                            key,
                            cert,
                            'sha256',
                        );
                    }

                    const endpointResponse = EndpointResponse.create({
                        gatewayNonceSignatures,
                    });
                    try {
                        sendMessage(endpointResponse);
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

        connection.on('open', async () => {
            const startMessage = Start.create({
                endpointCertificates: endpointCerts.map(c => pemCertToDer(c.cert)),
            });
            try {
                await sendMessage(startMessage);
            } catch (error) {
                reject(error);
            }
        });
    });
}

function runServerHandshake(connection, postHandshakeCallback) {
    let nextState = STATES.START;
    const nonce = uuid4();
    const endpointCertByAddress = {};

    async function processHandshakeMessage(messageSerialized) {
        switch (nextState) {
            case STATES.START:
                const startMessage = deserialize(messageSerialized, Start);
                for (const endpointCert of startMessage.endpointCertificates) {
                    const address = getAddressFromCert(endpointCert);
                    endpointCertByAddress[address] = endpointCert;
                }
                const gwResponse = GatewayResponse.create({
                    gatewayNonce: nonce,
                });
                connection.send(serialize(gwResponse));
                nextState = STATES.ENDPOINT_RESPONSE;
                break;

            case STATES.ENDPOINT_RESPONSE:
                const responseMessage = deserialize(messageSerialized, EndpointResponse);
                for (const [address, signature] of Object.entries(responseMessage.gatewayNonceSignatures)) {
                    const endpointCert = endpointCertByAddress[address];
                    if (!endpointCert) {
                        console.warn(`Invalid EndpointResponse address: ${address}`);
                        connection.close();
                        return;
                    }
                    try {
                        await cms.verifySignature(
                            Buffer.from(nonce),
                            signature,
                            endpointCert,
                        )
                    } catch (error) {
                        console.warn(`Invalid EndpointResponse signature for ${address}`);
                        connection.close();
                        return;
                    }
                }

                const completeMessage = Complete.create({success: true});
                connection.send(serialize(completeMessage));

                postHandshakeCallback();

                nextState = null;
                break;

            default:
                connection.off('message', processHandshakeMessage);
                break;
        }
    }

    connection.on('message', processHandshakeMessage);
}

module.exports = {
    runClientHandshake,
    runServerHandshake,
};
