'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

// Utilities to support RS-002 (https://github.com/relaynet/specs/blob/master/rs002-pki.md)

const asn1js = require('asn1js');
const assert = require('assert').strict;
const bufferToArrayBuffer = require('buffer-to-arraybuffer');
const crypto = require('crypto');
const {
    Certificate,
    CryptoEngine,
    getCrypto,
    getAlgorithmParameters,
    AttributeTypeAndValue,
    setEngine,
} = require('pkijs');
const {pemToDer, isPemCert} = require('../_asn1_utils');
const WebCrypto = require("node-webcrypto-ossl");

const webcrypto = new WebCrypto();
setEngine('nodeEngine', webcrypto, new CryptoEngine({
    crypto: webcrypto,
    subtle: webcrypto.subtle,
    name: 'nodeEngine'
}));

const OID_COMMON_NAME = '2.5.4.3';

/**
 * @param {NodeWebcryptoOpenSSL.CryptoKey} publicKey
 * @param serialNumber
 * @returns {Promise<Certificate>}
 */
async function initCertificate(serialNumber, publicKey) {
    const certificate = new Certificate({
        version: 2,
        serialNumber: new asn1js.Integer({value: serialNumber}),
    });

    certificate.notBefore.value = new Date(2016, 1, 1);
    certificate.notAfter.value = new Date(2029, 1, 1);

    await certificate.subjectPublicKeyInfo.importKey(publicKey);
    return certificate;
}

/**
 * @param {NodeWebcryptoOpenSSL.CryptoKeyPair} keyPair
 * @param {string} address
 * @param serialNumber
 * @returns {Promise<Certificate>}
 */
async function createPublicNodeCertificate(keyPair, address, serialNumber = 1) {
    const certificate = await initCertificate(serialNumber, keyPair.publicKey);

    certificate.issuer.typesAndValues.push(new AttributeTypeAndValue({
        type: OID_COMMON_NAME,
        value: new asn1js.BmpString({value: address}),
    }));
    certificate.subject.typesAndValues.push(new AttributeTypeAndValue({
        type: OID_COMMON_NAME,
        value: new asn1js.BmpString({value: address})
    }));

    await certificate.sign(keyPair.privateKey, 'SHA-256');

    return certificate;
}

/**
 * @param {NodeWebcryptoOpenSSL.CryptoKeyPair} keyPair
 * @param {string} addressScheme
 * @param serialNumber
 * @returns {Promise<Certificate>}
 */
async function createPrivateNodeCertificate(keyPair, addressScheme, serialNumber = 1) {
    const certificate = await initCertificate(serialNumber, keyPair.publicKey);

    const address = await computePublicKeyFingerprint(keyPair.publicKey, addressScheme);
    certificate.issuer.typesAndValues.push(new AttributeTypeAndValue({
        type: OID_COMMON_NAME,
        value: new asn1js.BmpString({value: address}),
    }));
    certificate.subject.typesAndValues.push(new AttributeTypeAndValue({
        type: OID_COMMON_NAME,
        value: new asn1js.BmpString({value: address})
    }));

    await certificate.sign(keyPair.privateKey, 'SHA-256');

    return certificate;
}

async function computePublicKeyFingerprint(publicKey, addressScheme) {
    const cryptoEngine = getCrypto();

    const publicKeyDer = Buffer.from(await cryptoEngine.exportKey('spki', publicKey));

    const publicKeyHash = crypto.createHash('sha256').update(publicKeyDer).digest('hex');
    return `${addressScheme}:0${publicKeyHash}`;
}

/**
 * @param {string} hashAlgorithm
 * @returns {Promise<NodeWebcryptoOpenSSL.CryptoKeyPair>}
 */
async function generateNodeKeyPair(hashAlgorithm) {
    const cryptoEngine = getCrypto();

    const algorithm = getAlgorithmParameters("RSA-PSS", "generatekey");
    algorithm.algorithm.hash.name = hashAlgorithm;
    algorithm.algorithm.modulusLength = 4096;

    return await cryptoEngine.generateKey(algorithm.algorithm, true, algorithm.usages);
}

/**
 * @param {Buffer} certSerialized
 * @returns {string}
 */
function getAddressFromCert(certSerialized) {
    // The production equivalent of this function MUST validate the address.
    const certDerBuffer = isPemCert(certSerialized) ? pemToDer(certSerialized) : certSerialized;
    const asn1 = asn1js.fromBER(bufferToArrayBuffer(certDerBuffer));
    if (asn1.offset === (-1)) {
        throw new Error('Invalid cert');
    }
    const cert = new Certificate({schema: asn1.result});
    let address;
    for (const dnAttribute of cert.subject.typesAndValues) {
        if (dnAttribute.type === OID_COMMON_NAME) {
            address = dnAttribute.value.valueBlock.value;
            break;
        }
    }
    assert(address, 'There must be a CN attribute in the subject');
    return address;
}

module.exports = {
    createPrivateNodeCertificate,
    createPublicNodeCertificate,
    generateNodeKeyPair,
    getAddressFromCert,
};
