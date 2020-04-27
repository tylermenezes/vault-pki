const axios = require('axios');
const { pki } = require('node-forge');
const { Agent } = require('https');
const { readFileOrFolder, onceThenRepeat, debug } = require('./util');

const apiVersion = 'v1';
const expiresIn = (cert) => {
  const expires = pki.certificateFromPem(cert).validity.notAfter;
  return Math.floor((expires - Date.now()) / 1000);
};

module.exports = class {
  /**
   * Provides a connection to Hashicorp Vault.
   *
   * @param {object} config Configuration consisting or address, token, mountpoint, role, and TLS
   */
  constructor(config) {
    const {
      address, token, mountpoint, tls,
    } = config;

    this.client = (async () => axios.create({
      baseURL: `${address}/${apiVersion}/${mountpoint}`,
      timeout: 5000,
      httpsAgent: tls && new Agent({
        rejectUnauthorized: tls.skipVerify || false,
        ca: await readFileOrFolder(tls.caPath || tls.caCert),
      }),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }))();
  }

  /**
   * Gets a single certificate.
   *
   * @async
   * @param {string} role The role name to use when issuing.
   * @param {string} commonName The CN to issue the certificate for.
   * @param {number} ttl The time in seconds until the certificate expires.
   * @param {object?} additionalOptions Additional options to send to Vault with the request, such as a SAN. See the
   *                                    Hashicorp docs for the Vault Issuing HTTP API.
   * @returns {object} Certificate information: expiresIn, type, serial, certificate, privateKey, ca, and chain.
   */
  async issue(role, commonName, ttl, additionalOptions) {
    try {
      const cert = (await (await this.client)
        .post(`/issue/${role}`, { common_name: commonName, ttl: `${ttl}s`, ...(additionalOptions || {}) })).data;

      debug(`received certificate ${cert.data.serial_number}`);

      return {
        expiresIn: expiresIn(cert.data.certificate),
        type: cert.data.private_key_type,
        serial: cert.data.serial_number,
        certificate: cert.data.certificate,
        privateKey: cert.data.private_key,
        ca: cert.data.issuing_ca,
        chain: cert.data.ca_chain,
      };
    } catch (err) {
      const msg = (err.response.data.errors || [err.response.data]).join(`\n`);
      throw new Error(msg);
    }
  }

  /**
   * Keeps a certificate up-to-date by auto-renewing before expiration.
   *
   * @param {string} role The role name to use when issuing.
   * @param {string} commonName The CN to issue the certificate for.
   * @param {number} ttl The time in seconds until the certificate expires.
   * @param {object?} additionalOptions Additional options to send to Vault with the request, such as a SAN. See the
   * Hashicorp docs for the Vault Issuing HTTP API.
   * @param {Function} onUpdate Function to run whenever the certificate is updated, taking (err, data), where data is
   *                            an object with: expiresIn, type, serial, certificate, privateKey, ca, chain.
   */
  issueAndRenew(role, commonName, ttl, additionalOptions, onUpdate) {
    onceThenRepeat(
      async () => this.issue(role, commonName, ttl, additionalOptions),
      (err, data) => {
        const refreshTimeout = err ? 10000 : (data.expiresIn * 1000 * 0.9);
        debug(`scheduled refresh for ${Math.floor(refreshTimeout / 1000)}s.`);
        return refreshTimeout;
      },
      (err, data) => { if (!err && data) onUpdate(data); }
    );
  }

  /**
   * Lists all the certificates in the store.
   *
   * @returns {object[]} List of certificates, an array of objects with certificate and chain.
   */
  async list() {
    const client = await this.client;
    const [certificateSerials, certificateChain] = (await Promise.all([
      client.request({ url: `/certs`, method: 'list' }),
      client.get(`/ca_chain`),
    ])).map((r) => r.data);

    const certificates = (await Promise.all(
      certificateSerials.data.keys
        .map(async (serial) => client.get(`/cert/${serial}`))
    )).map((r) => r.data);

    return certificates.map((cert) => ({
      certificate: cert.data.certificate,
      chain: certificateChain,
    }));
  }

  /**
   * Gets the certificate chain for the CA.
   *
   * @returns {string} The CA chain.
   */
  async getCaChain() {
    return (await (await this.client).get(`/ca_chain`)).data;
  }
};
