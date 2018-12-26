'use strict';
// Remember this is a proof of concept! The code below is ugly and has no tests.

class Cargo {
    constructor(id, size, stream) {
        this.id = id;
        this.size = size;
        this.stream = stream;
    }
}

module.exports = {
    Cargo
};
