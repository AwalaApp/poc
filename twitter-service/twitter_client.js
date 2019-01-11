'use strict';
// This is a proof of concept. The code below is ugly, inefficient and has no tests.

const grpc = require('grpc');
const grpcProtoLoader = require('@grpc/proto-loader');
const {dirname} = require('path');

const pogrpcPackageDefinition = grpcProtoLoader.loadSync(
    dirname(__dirname) + '/PogRPC/pogrpc.proto',
    {keepCase: true},
);
const pogrpcPackage = grpc.loadPackageDefinition(pogrpcPackageDefinition).relaynet.pogrpc;
const pogrpcClient = new pogrpcPackage.PogRPC('localhost:21473', grpc.credentials.createInsecure());

// TODO: Finish implementation