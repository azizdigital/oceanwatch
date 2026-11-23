'use strict';
/* Dashboard Cuaca Aziz - its own local certificate authority ("Dashboard Cuaca Local CA") for phone / tablet HTTPS.
   Adapted from OIM Wazira lib/certs.js. Separate CA name, so it never clashes with OIM Wazira's CA.
   - The CA is generated once (10 years) and kept in <dataDir>/cert. Each device trusts it once.
   - The server certificate is regenerated when the PC's network addresses change (CA stays the same). */
const fs = require('fs');
const path = require('path');
const forge = require('./vendor/node-forge');

const pki = forge.pki;
const CA_NAME = 'Dashboard Cuaca Local CA';
const ORG = 'Dashboard Cuaca Aziz';

function randomSerial() { return '00' + forge.util.bytesToHex(forge.random.getBytesSync(15)); }
function exists(f) { try { return fs.statSync(f).isFile(); } catch (e) { return false; } }

/* ensure({ dataDir, ips }) -> { cert (leaf + CA chain PEM), key, caPem, caName } */
function ensure(opts) {
  const dir = path.join(opts.dataDir, 'cert');
  fs.mkdirSync(dir, { recursive: true });
  const caCertFile = path.join(dir, 'ca.pem'), caKeyFile = path.join(dir, 'ca-key.pem');
  const certFile = path.join(dir, 'server.pem'), keyFile = path.join(dir, 'server-key.pem'), ipFile = path.join(dir, 'ips.txt');

  if (exists(caCertFile) && exists(caKeyFile)) {
    try {
      const cn = (pki.certificateFromPem(fs.readFileSync(caCertFile, 'utf8')).subject.getField('CN') || {}).value;
      if (cn !== CA_NAME) ['ca.pem', 'ca-key.pem', 'server.pem', 'server-key.pem', 'ips.txt'].forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* */ } });
    } catch (e) { /* unreadable: regenerate below */ }
  }
  if (!(exists(caCertFile) && exists(caKeyFile))) {
    const keys = pki.rsa.generateKeyPair(2048);
    const ca = pki.createCertificate();
    ca.publicKey = keys.publicKey;
    ca.serialNumber = randomSerial();
    ca.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
    ca.validity.notAfter = new Date();
    ca.validity.notAfter.setFullYear(ca.validity.notAfter.getFullYear() + 10);
    const attrs = [{ name: 'commonName', value: CA_NAME }, { name: 'organizationName', value: ORG }];
    ca.setSubject(attrs); ca.setIssuer(attrs);
    ca.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
      { name: 'subjectKeyIdentifier' }
    ]);
    ca.sign(keys.privateKey, forge.md.sha256.create());
    fs.writeFileSync(caCertFile, pki.certificateToPem(ca));
    fs.writeFileSync(caKeyFile, pki.privateKeyToPem(keys.privateKey));
    try { fs.unlinkSync(ipFile); } catch (e) { /* force a new server certificate */ }
  }

  const caPem = fs.readFileSync(caCertFile, 'utf8');
  const caCert = pki.certificateFromPem(caPem);
  const caKey = pki.privateKeyFromPem(fs.readFileSync(caKeyFile, 'utf8'));
  const caName = (caCert.subject.getField('CN') || {}).value || 'Local CA';
  const ips = (opts.ips || []).slice().sort();
  const sig = ips.join(',');

  let leafOk = false;
  if (exists(certFile) && exists(keyFile) && exists(ipFile) && fs.readFileSync(ipFile, 'utf8').trim() === sig) {
    try { leafOk = pki.certificateFromPem(fs.readFileSync(certFile, 'utf8')).validity.notAfter.getTime() - Date.now() > 30 * 24 * 3600 * 1000; } catch (e) { leafOk = false; }
  }
  if (leafOk) return { cert: fs.readFileSync(certFile, 'utf8') + caPem, key: fs.readFileSync(keyFile, 'utf8'), caPem, caName };

  const leafKeys = pki.rsa.generateKeyPair(2048);
  const leaf = pki.createCertificate();
  leaf.publicKey = leafKeys.publicKey;
  leaf.serialNumber = randomSerial();
  leaf.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  leaf.validity.notAfter = new Date();
  leaf.validity.notAfter.setDate(leaf.validity.notAfter.getDate() + 800); /* iOS rejects > 825 days */
  leaf.setSubject([{ name: 'commonName', value: ORG }, { name: 'organizationName', value: ORG }]);
  leaf.setIssuer(caCert.subject.attributes);
  leaf.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }].concat(ips.map(ip => ({ type: 7, ip }))) }
  ]);
  leaf.sign(caKey, forge.md.sha256.create());
  const leafPem = pki.certificateToPem(leaf), leafKeyPem = pki.privateKeyToPem(leafKeys.privateKey);
  fs.writeFileSync(certFile, leafPem);
  fs.writeFileSync(keyFile, leafKeyPem);
  fs.writeFileSync(ipFile, sig);
  return { cert: leafPem + caPem, key: leafKeyPem, caPem, caName };
}

module.exports = { ensure, CA_NAME };
