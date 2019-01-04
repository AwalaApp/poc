# poc
Proof of concept for Relaynet

## Generating messages

Example with a parcel:

```bash
cat messages/sample-payload.txt | \
    ./bin/generate-message --type parcel --recipient rne:targetEndpointAddr --cert samples/x509_cert.der
```

## Inspecting messages

Example with a parcel:

```bash
./bin/inspect-message --type parcel sample/sample.parcel
```
