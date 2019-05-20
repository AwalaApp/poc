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

const openssl = require('openssl-wrapper');
const tmp = require('tmp-promise');
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

module.exports = {
    encrypt,
    decrypt,
};
