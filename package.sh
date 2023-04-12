#!/bin/bash

rm -rf node_modules

npm ci
npm run build
npm prune --production

rm -rf node_modules/.bin

shasum --algorithm 256 manifest.json package.json LICENSE README.md dist/*.js > SHA256SUMS

find node_modules \( -type f -o -type l \) -exec shasum --algorithm 256 {} \; >> SHA256SUMS

TARFILE=`npm pack`
tar xzf ${TARFILE}
cp -r node_modules ./package || true
pushd package
find . -type f -exec shasum --algorithm 256 {} \; >> SHA256SUMS
popd
tar czf ${TARFILE} package

shasum --algorithm 256 ${TARFILE} > ${TARFILE}.sha256sum

rm -rf SHA256SUMS package
