'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const {Attribute, SignedAndUnsignedAttributes, ContentInfo, Certificate, SignedData,
    EncapsulatedContentInfo, IssuerAndSerialNumber, SignerInfo, getCrypto, getAlgorithmParameters,
    } = require("pkijs");
const {pemToDer} = require('./_asn1_utils');
const asn1js = require('asn1js');
const bufferToArrayBuffer = require('buffer-to-arraybuffer');
const fs = require('fs');

function parseCertificate(certBufferDer) {
    const asn1 = asn1js.fromBER(bufferToArrayBuffer(certBufferDer));
    if (asn1.offset === (-1)) {
        throw new Error('Invalid cert');
    }
    return new Certificate({schema: asn1.result});
}

/**
 * @param {Buffer} plaintext
 * @param {string|Buffer} keyPem PEM-encoded private key (or the path to it)
 * @param {Buffer} certPem
 * @param {string} hashAlgorithm
 * @param {boolean} embedCert Whether to embed the DER-encoded form of `certPem` in the signature.
 * @returns {Promise<Buffer>} The signature (detached)
 */
async function sign(plaintext, keyPem, certPem, hashAlgorithm, embedCert = false) {
    hashAlgorithm = hashAlgorithm === 'sha256' ? 'SHA-256' : hashAlgorithm;
    if (hashAlgorithm !== 'SHA-256') {
        throw new Error(`Unsupported hash ${hashAlgorithm}`);
    }

    const certificate = parseCertificate(pemToDer(certPem));

    const crypto = getCrypto();

    // Add signed attributes
    const digest = await crypto.digest({name: hashAlgorithm}, new Uint8Array(plaintext));
    const signerInfo = new SignerInfo({
        version: 1,
        sid: new IssuerAndSerialNumber({
            issuer: certificate.issuer,
            serialNumber: certificate.serialNumber,
        }),
        signedAttrs: new SignedAndUnsignedAttributes({
            type: 0,
            attributes: [
                new Attribute({
                    type: "1.2.840.113549.1.9.3", // Content type
                    values: [
                        new asn1js.ObjectIdentifier({value: "1.2.840.113549.1.7.1"})
                    ]
                }),
                new Attribute({
                    type: "1.2.840.113549.1.9.4", // Message digest
                    values: [
                        new asn1js.OctetString({valueHex: digest})
                    ]
                })
            ],
        }),
    });
    const signedDataParams = {
        version: 1,
        encapContentInfo: new EncapsulatedContentInfo({
            eContentType: "1.2.840.113549.1.7.1", // "data" content type
        }),
        signerInfos: [signerInfo],
    };
    if (embedCert) {
        signedDataParams.certificates = [certificate];
    }
    const cmsSigned = new SignedData(signedDataParams);

    const keyAlgorithmParams = await getAlgorithmParameters('RSA-PSS', 'importkey');
    keyAlgorithmParams.algorithm.hash.name = hashAlgorithm;
    keyPem = (typeof keyPem === 'string') ? fs.readFileSync(keyPem) : keyPem;
    const privateKey = await crypto.importKey(
        "pkcs8",
        bufferToArrayBuffer(pemToDer(keyPem)),
        keyAlgorithmParams.algorithm,
        true,
        ["sign"],
    );

    await cmsSigned.sign(privateKey, 0, hashAlgorithm, bufferToArrayBuffer(plaintext));

    const cmsContentSimp = new ContentInfo({
        contentType: "1.2.840.113549.1.7.2",
        content: cmsSigned.toSchema(true)
    });

    const signatureWrapped = cmsContentSimp.toSchema().toBER(false);

    return Buffer.from(signatureWrapped);
}

/**
 * @param {Buffer} plaintext
 * @param {Buffer} signature
 * @param {Buffer|null} certDer
 * @returns {Promise<void|Buffer>} The certificate embedded in the signature if `certDer` is absent
 * @throws Error If the signature doesn't match
 */
async function verifySignature(plaintext, signature, certDer = null) {
    const asn1 = asn1js.fromBER(bufferToArrayBuffer(signature));
    if (asn1.offset === (-1)) {
        throw new Error('Invalid signature serialisation');
    }
    const cmsContentSimpl = new ContentInfo({schema: asn1.result});

    const signedDataParams = {schema: cmsContentSimpl.content};
    let certificate;
    if (certDer) {
        certificate = parseCertificate(certDer);
        signedDataParams.certificates = [certificate];
    }
    const cmsSignedSimpl = new SignedData(signedDataParams);

    const verificationParameters = {
        signer: 0,
        data: bufferToArrayBuffer(plaintext),
        extendedMode: true,
    };

    const {signatureVerified, code} = await cmsSignedSimpl.verify(verificationParameters);

    if (!signatureVerified) {
        throw new Error(`Invalid signature (code: ${code})`);
    }

    if (!certDer) {
        certificate = cmsSignedSimpl.certificates[0];
        return Buffer.from(certificate.toSchema().toBER(false));
    }
}

module.exports = {
    sign,
    verifySignature,
};
