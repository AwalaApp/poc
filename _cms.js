'use strict';

const opensslCms = require('./_opensslCms');
const pkijsCms = require('./_pkijsCms');

module.exports = {
    sign: pkijsCms.sign,
    verifySignature: pkijsCms.verifySignature,
    encrypt: opensslCms.encrypt,
    decrypt: opensslCms.decrypt,
};
