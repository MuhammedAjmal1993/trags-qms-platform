"""Encrypt packed chunks (pack.ts output) into public/import/*.bin for the worker importer.

Chunk format (AES-256-GCM, 12-byte IV prefix, tag appended):
  type 1: [0x01] + gzip(JSON {kind: 'rows'|'sql', ...})
  type 2: [0x02] + uint32-BE header length + header JSON {kind:'file', key, mime} + file bytes

The key is NEVER committed. Read it from the environment (IMPORT_KEY, base64 32 bytes); the same value
must be stored in D1 settings as `import_key`.
Usage: IMPORT_KEY=... python tools/import/encrypt.py <chunks-dir> public/import <batch-id>
"""
import base64, gzip, json, os, struct, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

src, out, batch = sys.argv[1], sys.argv[2], sys.argv[3]
aes = AESGCM(base64.b64decode(os.environ['IMPORT_KEY']))
os.makedirs(out, exist_ok=True)
manifest = json.load(open(os.path.join(src, 'manifest.json')))
for c in manifest:
    spec = json.load(open(os.path.join(src, c['name'] + '.json')))
    if spec['kind'] == 'file':
        head = json.dumps({'kind': 'file', 'key': spec['key'], 'mime': spec['mime']}).encode()
        pt = bytes([2]) + struct.pack('>I', len(head)) + head + open(spec['path'], 'rb').read()
    else:
        pt = bytes([1]) + gzip.compress(json.dumps(spec).encode())
    iv = os.urandom(12)
    open(os.path.join(out, c['name'] + '.bin'), 'wb').write(iv + aes.encrypt(iv, pt, None))
json.dump({'batch': batch, 'chunks': manifest}, open(os.path.join(out, 'manifest.json'), 'w'))
print(len(manifest), 'chunks written')
