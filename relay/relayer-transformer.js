'use strict';
// Remember this is a proof of concept! The code below is ugly and has no tests.

const {Authentication, Cargo} = require('./messages');
const {deserializeVarbigint} = require('../utils/primitives');
const {PassThrough, Readable} = require('stream');

class RelayerStream extends Readable {
    constructor(socket) {
        super({objectMode: true});

        this._socket = socket;

        this._alreadyAuthenticated = false;
        this._partialMessage = null;

        this._buffer = Buffer.allocUnsafe(0);
        this._bufferLength = 0;
        this._canProcessData = true;
    }

    init() {
        this._socket.on('data', (data) => {
            this._buffer = Buffer.concat([this._buffer, data]);
            this._bufferLength += data.length;

            this._processData();
        });

        this._socket.on('end', () => {
            this.push(null);
        });

        this._socket.on('error', (err) => {
            this.emit('error', err);
        });
    }

    _read(size) {
        this._socket.resume();
    }

    _processData() {
        this._canProcessData = true;
        while (this._canProcessData) {
            let message;
            if (this._alreadyAuthenticated) {
                message = this._getCargo();
            } else {
                message = this._getAuthn();
            }

            if (message) {
                if (!this.push(message)) {
                    this._socket.pause();
                }
            }
        }
    }

    _getAuthn() {
        if (!this._partialMessage && !this._hasOctets(2)) {
            return;
        }

        let lengthPrefix;
        if (this._partialMessage) {
            lengthPrefix = this._partialMessage.relayerIdLength;
        } else {
            const authnHeader = this._readOctets(2);
            const tag = String.fromCharCode(authnHeader[0]);
            if (tag !== 'W') {
                this.emit('error', new Error(`Expected 'W' tag, got ${tag}`));
                this.push(null);
                return;
            }

            lengthPrefix = authnHeader[1];
        }

        if (!this._hasOctets(lengthPrefix)) {
            this._partialMessage = {relayerIdLength: lengthPrefix};
            return;
        }

        const relayerIdSerialized = this._readOctets(lengthPrefix);
        const authentication = new Authentication(relayerIdSerialized.toString());

        this._alreadyAuthenticated = true;
        this._partialMessage = null;
        return authentication;
    }

    _getCargo() {
        this._partialMessage = this._partialMessage || {};

        // Get cargo id length
        if (this._partialMessage.cargoIdLengthPrefix === undefined && !this._hasOctets(2)) {
            return;
        }
        if (this._partialMessage.cargoIdLengthPrefix === undefined) {
            const cargoPartialHeader = this._readOctets(2);
            const tag = String.fromCharCode(cargoPartialHeader[0]);
            if (tag !== 'C') {
                this.emit('error', new Error(`Expected 'C' tag, got ${tag}`));
                this.push(null);
                return;
            }

            this._partialMessage.cargoIdLengthPrefix = cargoPartialHeader[1];
        }

        // Get cargo id
        if (this._partialMessage.cargoId === undefined && !this._hasOctets(this._partialMessage.cargoIdLengthPrefix)) {
            return;
        }
        if (this._partialMessage.cargoId === undefined) {
            this._partialMessage.cargoId = this._readOctets(this._partialMessage.cargoIdLengthPrefix).toString();
        }

        // Get cargo length prefix
        if (this._partialMessage.cargoLengthPrefix === undefined && !this._hasOctets(1)) {
            return;
        }
        if (this._partialMessage.cargoLengthPrefix === undefined) {
            this._partialMessage.cargoLengthPrefix = this._readOctets(1)[0];
        }

        // Get the cargo length
        if (this._partialMessage.cargoLength === undefined && !this._hasOctets(this._partialMessage.cargoLengthPrefix)) {
            return;
        }
        if (this._partialMessage.cargoLength === undefined) {
            this._partialMessage.cargoLength = deserializeVarbigint(this._readOctets(this._partialMessage.cargoLengthPrefix));
        }

        // Get the cargo itself
        let message;
        if (this._partialMessage.cargoPassThrough === undefined) {
            message = new Cargo(
                this._partialMessage.cargoId,
                this._partialMessage.cargoLength,
                new PassThrough(),
            );
            this._partialMessage.cargoPassThrough = message.stream;
            this._partialMessage.cargoOctetsPendingCount = this._partialMessage.cargoLength;
        } else {
            message = null;
        }

        const cargoReceivedOctetsCount = Math.min(this._bufferLength, this._partialMessage.cargoLength);
        const cargoReceivedOctets = this._readOctets(cargoReceivedOctetsCount);
        this._partialMessage.cargoPassThrough.write(cargoReceivedOctets);
        this._partialMessage.cargoOctetsPendingCount -= cargoReceivedOctetsCount;

        if (this._partialMessage.cargoOctetsPendingCount === 0) {
            this._partialMessage.cargoPassThrough.end();
            this._partialMessage = null;
        }

        return message;
    }

    _readOctets(octetsCount) {
        if (this._bufferLength < octetsCount) {
            throw new Error(`Can't read ${octetsCount} octets because we have ${this._buffer.length}`);
        }

        const octets = this._buffer.slice(0, octetsCount);
        this._buffer = this._buffer.slice(octetsCount);

        this._bufferLength -= octetsCount;
        this._canProcessData = 0 < this._bufferLength;

        return octets;
    }

    _hasOctets(octetsCount) {
        const hasOctets = octetsCount <= this._bufferLength;
        this._canProcessData = hasOctets;
        return hasOctets
    }
}

module.exports = {
    RelayerStream
};
