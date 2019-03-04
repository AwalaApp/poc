'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

/**
 * Cryptographic Message Syntax (CMS) interface.
 *
 * This proof-of-concept uses `openssl` via the CLI for expediency, but the final
 * implementation must use something like PKI.js -- I just couldn't get it to work
 * within my self-imposed timebox.
 *
 * node-forge doesn't yet support CMS (https://github.com/digitalbazaar/forge/pull/289).
 */

const fs = require('fs');
const openssl = require('openssl-wrapper');
const tmp = require('tmp-promise');
const {derCertToPem} = require('./_asn1_utils');
const {promisify} = require('util');

const opensslExec = promisify(openssl.exec);

tmp.setGracefulCleanup();

/**
 * @param {Buffer} plaintext
 * @param {string} certPath
 * @returns {Promise<Buffer>} The ciphertext
 */
async function encrypt(plaintext, certPath) {
    return await opensslExec('cms.encrypt', plaintext, {
        binary: true,
        outform: 'DER',
        [certPath]: false,
    });
}

/**
 * @param {Buffer} ciphertext
 * @param {string} keyPath
 * @returns {Promise<Buffer>} The plaintext
 */
async function decrypt(ciphertext, keyPath) {
    return await opensslExec('cms.decrypt', ciphertext, {
        binary: true,
        inform: 'DER',
        inkey: keyPath,
    });
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
    const keyPath = (typeof keyPem === 'string') ? keyPem : (await bufferToTmpFile(keyPem)).path;
    const certPemFile = await bufferToTmpFile(certPem);
    return await opensslExec('cms.sign', plaintext, {
        binary: true,
        outform: 'DER',
        md: hashAlgorithm,
        nocerts: !embedCert,
        signer: certPemFile.path,
        inkey: keyPath,
    });
}

/**
 * @param {Buffer} plaintext
 * @param {Buffer} signature
 * @param {Buffer|null} certDer
 * @returns {Promise<void|Buffer>} The certificate embedded in the signature if `certDer` is absent
 * @throws Error If the signature doesn't match
 */
async function verifySignature(plaintext, signature, certDer = null) {
    const plaintextFile = await bufferToTmpFile(plaintext);
    const args = {
        binary: true,
        inform: 'DER',
        noverify: true, // Allow self-signed certs (undocumented!)
        content: plaintextFile.path,
    };
    if (certDer) {
        args.certfile = (await bufferToTmpFile(derCertToPem(certDer))).path;
        args.nointern = true;
    } else {
        args.signer = (await tmp.file()).path;
    }

    await opensslExec('cms.verify', signature, args);

    if (args.signer) {
        return fs.readFileSync(args.signer);
    }
}

async function bufferToTmpFile(buffer) {
    const file = await tmp.file();
    fs.writeFileSync(file.fd, buffer);
    return file;
}

module.exports = {
    encrypt,
    decrypt,
    sign,
    verifySignature,
};
