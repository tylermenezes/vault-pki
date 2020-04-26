# vault-pki

A node module for getting certificates from a vault store.

Provides a class which can be initialized with the following config object:

```js
{
  address,
  token,
  mountpoint,
  tls: {
    skipVerify,
    caPath,
    caCert,
  },
}
```

The resulting instance provides three methods:

- `issue(role, cn, ttl, additionalOptions)` - Issues a certificate.
- `issueAndRenew(role, cn, ttl, additionalOptions, onUpdate)` - Issues a certificate, and auto-renews when each token is
  90% of the way through its lifespan. onUpdate is called after each renewal.
- `list` - Lists all certificates in the store.

Returned certificate objects have these properties:

```js
{
  expiresIn,
  type,
  serial,
  certificate,
  privateKey,
  ca,
  chain,
}
```
