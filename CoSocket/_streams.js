'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const {CargoDelivery} = require('./_packets');
const {deserializeVarbigint, serializeVarbigint, serializeVarchar} = require('./_primitives');
const {Duplex, PassThrough, Readable} = require('stream');

class BufferedStream extends Readable {
    constructor(stream) {
        super();

        this._stream = stream;
        this._buffer = Buffer.allocUnsafe(0);
        this._bufferLength = 0;
        this._canProcessData = true;
    }

    init() {
        this._stream.on('data', (data) => {
            this._buffer = Buffer.concat([this._buffer, data]);
            this._bufferLength += data.length;

            this._canProcessData = true;
            this.emit('canProcessData');
        });

        this._stream.on('end', () => {
            this.push(null);
        });

        this._stream.on('error', (err) => {
            this.emit('error', err);
        });
    }

    canProcessData() {
        return this._canProcessData;
    }

    getBufferLength() {
        return this._bufferLength;
    }

    readOctets(octetsCount) {
        if (this._bufferLength < octetsCount) {
            throw new Error(`Can't read ${octetsCount} octets because we have ${this._buffer.length}`);
        }

        const octets = this._buffer.slice(0, octetsCount);
        this._buffer = this._buffer.slice(octetsCount);

        this._bufferLength -= octetsCount;
        this._canProcessData = 0 < this._bufferLength;

        return octets;
    }

    hasOctets(octetsCount) {
        const hasOctets = octetsCount <= this._bufferLength;
        this._canProcessData = hasOctets;
        return hasOctets
    }
}

class CargoCollectionStream extends Readable {
    constructor(socket) {
        super({objectMode: true});

        this._socket = socket;

        this._bufferedReader = new BufferedStream(socket);
        this._partialMessage = null;
    }

    init() {
        const self = this;
        this._bufferedReader.on('canProcessData', () => self._processData());
        this._bufferedReader.init();
    }

    _read(size) {
        this._socket.resume();
    }

    _processData() {
        while (this._bufferedReader.canProcessData()) {
            const message = this._getCargo();
            if (message) {
                if (!this.push(message)) {
                    this._socket.pause();
                }
            }
        }
    }

    _getCargo() {
        this._partialMessage = this._partialMessage || {};

        // Get cargo id length
        if (this._partialMessage.cargoIdLengthPrefix === undefined && !this._bufferedReader.hasOctets(2)) {
            return;
        }
        if (this._partialMessage.cargoIdLengthPrefix === undefined) {
            const cargoPartialHeader = this._bufferedReader.readOctets(2);
            const tag = String.fromCharCode(cargoPartialHeader[0]);
            if (tag !== 'C') {
                this.emit('error', new Error(`Expected 'C' tag, got ${tag}`));
                this.push(null);
                return;
            }

            this._partialMessage.cargoIdLengthPrefix = cargoPartialHeader[1];
        }

        // Get cargo id
        if (this._partialMessage.cargoId === undefined && !this._bufferedReader.hasOctets(this._partialMessage.cargoIdLengthPrefix)) {
            return;
        }
        if (this._partialMessage.cargoId === undefined) {
            this._partialMessage.cargoId = this._bufferedReader.readOctets(this._partialMessage.cargoIdLengthPrefix).toString();
        }

        // Get cargo length prefix
        if (this._partialMessage.cargoLengthPrefix === undefined && !this._bufferedReader.hasOctets(1)) {
            return;
        }
        if (this._partialMessage.cargoLengthPrefix === undefined) {
            this._partialMessage.cargoLengthPrefix = this._bufferedReader.readOctets(1)[0];
        }
        if (this._partialMessage.cargoLengthPrefix === 0) {
            // We MUST not acknowledge this cargo in production. It should be an error instead.
            const message = new CargoDelivery(this._partialMessage.cargoId, 0, null);
            this._partialMessage = null;
            return message;
        }

        // Get the cargo length
        if (this._partialMessage.cargoLength === undefined && !this._bufferedReader.hasOctets(this._partialMessage.cargoLengthPrefix)) {
            return;
        }
        if (this._partialMessage.cargoLength === undefined) {
            this._partialMessage.cargoLength = deserializeVarbigint(this._bufferedReader.readOctets(this._partialMessage.cargoLengthPrefix));
        }

        // Get the cargo itself
        let message;
        if (this._partialMessage.cargoPassThrough === undefined) {
            message = new CargoDelivery(
                this._partialMessage.cargoId,
                this._partialMessage.cargoLength,
                new PassThrough(),
            );
            this._partialMessage.cargoPassThrough = message.stream;
            this._partialMessage.cargoOctetsPendingCount = this._partialMessage.cargoLength;
        } else {
            message = null;
        }

        const cargoReceivedOctetsCount = Math.min(
            this._bufferedReader.getBufferLength(),
            this._partialMessage.cargoLength,
        );
        const cargoReceivedOctets = this._bufferedReader.readOctets(cargoReceivedOctetsCount);
        this._partialMessage.cargoPassThrough.write(cargoReceivedOctets);
        this._partialMessage.cargoOctetsPendingCount -= cargoReceivedOctetsCount;

        if (this._partialMessage.cargoOctetsPendingCount === 0) {
            this._partialMessage.cargoPassThrough.end();
            this._partialMessage = null;
        }

        return message;
    }
}

class CargoDeliveryStream extends Duplex {
    constructor(socket) {
        super({writableObjectMode: true});

        this._socket = socket;

        this._bufferedReader = new BufferedStream(socket);
        this._partialDeliveryAck = null;
    }

    init() {
        const self = this;
        this._bufferedReader.on('canProcessData', () => self._processData());
        this._bufferedReader.init();
    }

    _read(size) {
        this._socket.resume();
    }

    _processData() {
        while (this._bufferedReader.canProcessData()) {
            const deliveryAcl = this._getDeliveryAck();
            if (deliveryAcl) {
                if (!this.push(deliveryAcl)) {
                    this._socket.pause();
                }
            }
        }
    }

    _getDeliveryAck() {
        this._partialDeliveryAck = this._partialDeliveryAck || {};

        // validate tag and get cargo id length
        if (this._partialDeliveryAck.cargoIdLengthPrefix === undefined && !this._bufferedReader.hasOctets(2)) {
            return;
        }
        if (this._partialDeliveryAck.cargoIdLengthPrefix === undefined) {
            const [tag, cargoIdLengthPrefix] = this._bufferedReader.readOctets(2);
            if (String.fromCharCode(tag) !== 'c') {
                this.emit('error', new Error(`Expected 'c' tag, got ${tag}`));
                this.push(null);
                return;
            }

            this._partialDeliveryAck.cargoIdLengthPrefix = cargoIdLengthPrefix;
        }

        // Get cargo id
        if (!this._bufferedReader.hasOctets(this._partialDeliveryAck.cargoIdLengthPrefix)) {
            return;
        }

        const cargoId = this._bufferedReader.readOctets(this._partialDeliveryAck.cargoIdLengthPrefix);
        this._partialDeliveryAck = null;
        return cargoId;
    }

    _write({id, cargo}, encoding, callback) {
        this._socket.write('C'); // Message tag
        this._socket.write(serializeVarchar(id));
        this._socket.write(serializeVarbigint(cargo.length));
        this._socket.write(cargo);
        callback();
    }
}

module.exports = {
    CargoCollectionStream,
    CargoDeliveryStream,
};
