#!/bin/sh
set -eu
npm ci
npx prettier --check 'src/**/*.{ts,html,scss}'
npm run lint
npm test
npm run build:firebase
npm audit --omit=dev
