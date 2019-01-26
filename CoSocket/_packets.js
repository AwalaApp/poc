'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

class CargoDelivery {
    constructor(id, stream) {
        this.id = id;
        this.stream = stream;
    }
}

class CargoDeliveryAck {
    constructor(id) {
        this.id = id;
    }
}

const INTENTS = {
    COLLECT: 'C',
    DELIVER: 'D',
};

function getIntent(intentTagBuffer) {
    const intentTag = intentTagBuffer.toString();
    return (Object.values(INTENTS).includes(intentTag)) ? intentTag : null;
}

module.exports = {
    CargoDelivery,
    CargoDeliveryAck,
    getIntent,
    INTENTS,
};
