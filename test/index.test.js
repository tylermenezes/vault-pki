/* eslint-disable no-console */
/* eslint-disable node/no-unpublished-require */
require('dotenv').config();
const VaultPki = require('../src');

const vault = new VaultPki({
  address: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN,
  mountpoint: 'pki-api',
});

(async () => {
  vault.issueAndRenew('api', 'api.codeday.org', 60, null, console.log);
})();
